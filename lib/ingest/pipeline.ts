import type {
  AlertMatch,
  ListingEnrichment,
  ListingProperty,
  ProviderListingProperty,
  PropertyAlert,
} from "@/types/listings";
import type { ParsedGmailMessage } from "@/lib/gmail/client";
import type { ListingExtractor } from "@/lib/enrich/extractor";
import type { ListingEnricher } from "@/lib/enrich/enrich";
import { evaluateRealtyDetailGate } from "@/lib/enrich/realty-detail-gate";
import { normalizeEmailListing } from "@/lib/ingest/email-normalize";
import { validateListingProperty } from "@/lib/schemas/listing";
import { evaluateAlertAgainstListing } from "@/lib/ingest/alert-eval";
import { buildAlertMatchId } from "@/lib/repositories/matches";

/**
 * The email-triggered ingestion pipeline (WS7) — the PRIMARY flow.
 *
 * For each parsed Gmail message it runs:
 *   extract (Gemini)  → normalize (provenance + dedupe + history)
 *   → enrich (free lanes: google-search, cited)
 *   → RealtyAPI property-detail GATE (only on an authoritative gap, within monthly
 *     budget, persisting `realtyApiDetailFetchedAt` so it never re-spends)
 *   → validate (WS3 schema)  → upsert (dedupe)
 *   → evaluate saved alerts (reuse alert-eval)  → persist matches  → notify (toast/email)
 *
 * Every external dependency is an injected port so this is fully unit-testable with
 * fakes (no live Gmail / Gemini / RealtyAPI / Firestore). The push handler wires the
 * real ports.
 */
export interface ListingUpsertPort {
  upsert(
    listing: ProviderListingProperty,
  ): Promise<{ id: string; dedupeKey: string; created: boolean }>;
  /** Existing listing by dedupe key, used to honor the persisted RealtyAPI-spend guard. */
  findByDedupeKey(dedupeKey: string): Promise<ListingProperty | null>;
}

export interface AlertMatchPort {
  upsert(match: AlertMatch): Promise<{ created: boolean }>;
}

/**
 * RealtyAPI property-detail port. The pipeline only calls this when the gate says to,
 * and only after a budget reservation succeeds. Returns a partial enrichment patch
 * (authoritative fields/media) plus the spend timestamp. Production wires this to the
 * RealtyAPI adapter + quota store; absence (undefined) means "no detail lane available"
 * and the pipeline degrades to free-lane enrichment only.
 */
export interface RealtyDetailPort {
  /** True when at least one key has monthly budget headroom right now. */
  budgetAvailable(): Promise<boolean>;
  /** Reserve + fetch authoritative detail; returns the enrichment patch to merge. */
  fetchDetail(
    listing: ProviderListingProperty,
  ): Promise<{ patch: Partial<ProviderListingProperty>; detailFetchedAt: string }>;
}

export interface IngestNotifier {
  /** A new listing was ingested. */
  listingIngested(listing: ProviderListingProperty, created: boolean): void;
  /** A saved alert matched a newly-ingested listing. */
  alertMatched(match: AlertMatch, listing: ProviderListingProperty): void;
  /** A recoverable error worth surfacing. */
  error(message: string): void;
}

export interface PipelineDeps {
  extractor: ListingExtractor;
  enricher: ListingEnricher;
  listings: ListingUpsertPort;
  matches: AlertMatchPort;
  /** Active saved alerts to evaluate each new listing against. */
  loadActiveAlerts: () => Promise<PropertyAlert[]>;
  realtyDetail?: RealtyDetailPort;
  notifier?: IngestNotifier;
  providerRunId?: string;
}

export interface ProcessMessageResult {
  listingsUpserted: number;
  listingsCreated: number;
  listingsSkipped: number;
  alertMatchesCreated: number;
  alertMatchesUpdated: number;
  realtyDetailCalls: number;
  errors: string[];
}

function emptyResult(): ProcessMessageResult {
  return {
    listingsUpserted: 0,
    listingsCreated: 0,
    listingsSkipped: 0,
    alertMatchesCreated: 0,
    alertMatchesUpdated: 0,
    realtyDetailCalls: 0,
    errors: [],
  };
}

function mergeEnrichment(
  base: ListingEnrichment | undefined,
  add: ListingEnrichment | undefined,
): ListingEnrichment | undefined {
  if (!base && !add) return undefined;
  return {
    schools: add?.schools ?? base?.schools,
    neighborhood: add?.neighborhood ?? base?.neighborhood,
    walkability: add?.walkability ?? base?.walkability,
    commuteNotes: add?.commuteNotes ?? base?.commuteNotes,
    realtyApiDetailFetchedAt: add?.realtyApiDetailFetchedAt ?? base?.realtyApiDetailFetchedAt,
    sources: [...(base?.sources ?? []), ...(add?.sources ?? [])],
  };
}

/**
 * Process one Gmail message end-to-end. Idempotent: re-running the same message yields
 * the same dedupe key, so the upsert merges rather than duplicates, and the persisted
 * `realtyApiDetailFetchedAt` guard prevents re-spending RealtyAPI on a repeat.
 */
export async function processGmailMessage(
  message: ParsedGmailMessage,
  deps: PipelineDeps,
  options?: { platformId?: string },
): Promise<ProcessMessageResult> {
  const result = emptyResult();

  let drafts;
  try {
    drafts = await deps.extractor.extract(message);
  } catch (error) {
    const msg = `Extraction failed for message ${message.id}: ${
      error instanceof Error ? error.message : String(error)
    }`;
    result.errors.push(msg);
    deps.notifier?.error(msg);
    return result;
  }

  if (drafts.length === 0) {
    // No listing in this email — a normal, frequent outcome. Not an error.
    return result;
  }

  const alerts = await deps.loadActiveAlerts();
  const now = new Date().toISOString();

  for (const draft of drafts) {
    try {
      let listing = normalizeEmailListing(draft, {
        message,
        platformId: options?.platformId,
        ingestedAt: now,
        providerRunId: deps.providerRunId,
      });

      // Carry forward a prior RealtyAPI spend so the gate never re-spends on this home.
      const existing = await deps.listings.findByDedupeKey(listing.dedupeKey);
      if (existing?.enrichment?.realtyApiDetailFetchedAt) {
        listing = {
          ...listing,
          enrichment: mergeEnrichment(existing.enrichment, listing.enrichment),
        };
      }

      // 1) Free-lane enrichment (cited, generous, never authoritative).
      try {
        const freeEnrichment = await deps.enricher.enrich({
          address: listing.address,
          city: listing.city,
          state: listing.state,
          zipCode: listing.zipCode,
        });
        listing = {
          ...listing,
          enrichment: mergeEnrichment(listing.enrichment, freeEnrichment),
        };
      } catch (error) {
        // Best-effort: free enrichment failure does not block the listing.
        result.errors.push(
          `Enrichment failed for ${listing.dedupeKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // 2) RealtyAPI property-detail GATE — only on an authoritative gap + budget + no prior spend.
      if (deps.realtyDetail) {
        const budgetAvailable = await deps.realtyDetail.budgetAvailable();
        const gate = evaluateRealtyDetailGate(listing, budgetAvailable);
        if (gate.shouldFetch) {
          try {
            const { patch, detailFetchedAt } = await deps.realtyDetail.fetchDetail(listing);
            listing = {
              ...listing,
              ...patch,
              enrichment: mergeEnrichment(listing.enrichment, {
                sources: [],
                realtyApiDetailFetchedAt: detailFetchedAt,
              }),
            } as ProviderListingProperty;
            // Authoritative media just arrived: derive the primary imageUrl/imageUrls from
            // it (the contract requires a non-empty imageUrl). Real provider media only.
            if (listing.media.length > 0) {
              listing = {
                ...listing,
                imageUrl: listing.media[0].url,
                imageUrls: listing.media.map((m) => m.url),
              };
            }
            result.realtyDetailCalls += 1;
          } catch (error) {
            result.errors.push(
              `RealtyAPI detail failed for ${listing.dedupeKey}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      // 3) Validate before any write.
      const validation = validateListingProperty(listing);
      if (!validation.success) {
        result.listingsSkipped += 1;
        const msg = `Listing ${listing.dedupeKey} failed validation: ${validation.errors.join("; ")}`;
        result.errors.push(msg);
        continue;
      }

      // 4) Upsert (dedupe-aware).
      const upsertResult = await deps.listings.upsert(listing);
      result.listingsUpserted += 1;
      if (upsertResult.created) result.listingsCreated += 1;
      const persistedListing: ProviderListingProperty = { ...listing, id: upsertResult.id };
      deps.notifier?.listingIngested(persistedListing, upsertResult.created);

      // 5) Evaluate saved alerts and persist matches.
      for (const alert of alerts) {
        if (!alert.isActive) continue;
        const evaluation = evaluateAlertAgainstListing(alert, persistedListing, now);
        if (!evaluation.isMatch) continue;

        const match: AlertMatch = {
          id: buildAlertMatchId(alert.id, persistedListing.id),
          alertId: alert.id,
          listingId: persistedListing.id,
          userId: alert.userId,
          matchReason: evaluation.reason,
          firstSeenAt: now,
          lastSeenAt: now,
        };
        const matchResult = await deps.matches.upsert(match);
        if (matchResult.created) {
          result.alertMatchesCreated += 1;
        } else {
          result.alertMatchesUpdated += 1;
        }
        deps.notifier?.alertMatched(match, persistedListing);
      }
    } catch (error) {
      result.listingsSkipped += 1;
      const msg = `Failed to process a listing from message ${message.id}: ${
        error instanceof Error ? error.message : String(error)
      }`;
      result.errors.push(msg);
      deps.notifier?.error(msg);
    }
  }

  return result;
}

/** Aggregate a batch of per-message results into a single run summary. */
export function aggregateResults(results: ProcessMessageResult[]): ProcessMessageResult {
  const total = emptyResult();
  for (const r of results) {
    total.listingsUpserted += r.listingsUpserted;
    total.listingsCreated += r.listingsCreated;
    total.listingsSkipped += r.listingsSkipped;
    total.alertMatchesCreated += r.alertMatchesCreated;
    total.alertMatchesUpdated += r.alertMatchesUpdated;
    total.realtyDetailCalls += r.realtyDetailCalls;
    total.errors.push(...r.errors);
  }
  return total;
}
