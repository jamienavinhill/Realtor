import type { ListingEnrichment, ListingEnrichmentSource } from "@/types/listings";
import { GoogleSearchClient } from "@/lib/providers/google-search";

/**
 * Free-lane enrichment for an emailed listing (WS7). Uses the WS5 Google-search port to
 * gap-fill NON-authoritative context (neighborhood narrative, school references) and
 * ALWAYS records citations. When search envs are absent the port is a clear no-op and
 * this returns an empty (but valid) enrichment block — never invented values.
 *
 * Authoritative structured data (price/photos/history) is NOT sourced here; that is the
 * RealtyAPI detail gate's job. This lane is generous but strictly cited and free.
 */
export interface ListingEnricherInput {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface ListingEnricher {
  enrich(input: ListingEnricherInput): Promise<ListingEnrichment>;
}

export interface GoogleSearchEnricherOptions {
  searchClient?: GoogleSearchClient;
  /** Max citations to keep per field (clamped by the port to the API's 10 max). */
  resultsPerField?: number;
}

/**
 * Build an enricher backed by the Google-search port. Runs one search per
 * non-authoritative field and merges the returned citations into a single enrichment
 * block. Failures in a single lane are swallowed (best-effort enrichment never blocks
 * ingestion), but a configured-and-erroring search is surfaced via a thrown error only
 * at the port boundary — here we degrade to an empty block so a listing still lands.
 */
export function createGoogleSearchEnricher(
  options: GoogleSearchEnricherOptions = {},
): ListingEnricher {
  const client = options.searchClient ?? new GoogleSearchClient();
  const num = options.resultsPerField ?? 3;

  return {
    async enrich(input) {
      const locality = `${input.city}, ${input.state} ${input.zipCode}`.trim();
      const sources: ListingEnrichmentSource[] = [];
      let neighborhood: string | undefined;

      if (!client.isConfigured()) {
        // Clear no-op: a valid, empty enrichment block (no invented values).
        return { sources };
      }

      // Neighborhood / area context.
      try {
        const result = await client.search(`${locality} neighborhood overview`, "neighborhood", {
          num,
        });
        sources.push(...result.sources);
        if (result.citations.length > 0) {
          // Use only the cited snippet text the API returned; never synthesize prose.
          const snippet = result.citations.find((c) => c.snippet)?.snippet;
          if (snippet) neighborhood = snippet;
        }
      } catch {
        // Best-effort: a transient search failure must not block the listing.
      }

      // School references.
      try {
        const result = await client.search(`${locality} public schools ratings`, "schools", {
          num,
        });
        sources.push(...result.sources);
      } catch {
        // Best-effort.
      }

      return { neighborhood, sources };
    },
  };
}
