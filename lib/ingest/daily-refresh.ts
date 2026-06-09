import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import type { ServerEnv } from "@/lib/env";
import { RealtyApiClient } from "@/lib/providers/realty-api";
import { evaluateAlertsForListings } from "@/lib/ingest/alert-eval";
import { BASELINE_CENTER, BASELINE_RADIUS_MILES, BASELINE_ZIP } from "@/lib/ingest/constants";
import { listActiveAlerts } from "@/lib/repositories/alerts";
import { listActiveListings, upsertListing, upsertListings } from "@/lib/repositories/listings";
import { upsertAlertMatch } from "@/lib/repositories/matches";
import {
  firestoreMonthlyQuotaStore,
  type MonthlyQuotaStore,
} from "@/lib/repositories/provider-quota";
import { createIngestRun, updateIngestRun } from "@/lib/repositories/runs";
import type { ProviderFetchResult } from "@/lib/providers/types";
import type {
  AlertMatch,
  IngestRun,
  IngestRunType,
  ListingHistoryEntry,
  ListingProperty,
  PropertyAlert,
} from "@/types/listings";

/**
 * Injectable seams for the periodic refresh + alert-evaluation loop (WS8). Production
 * uses the real env/provider/repository implementations (the defaults); tests inject
 * in-memory fakes so the run lifecycle, idempotent alert-match persistence,
 * monthly-budget stop, history append, and dry-run cost safety can be verified with
 * ZERO live RealtyAPI calls and ZERO Firestore writes.
 */
export interface DailyRefreshDeps {
  getServerEnv: typeof getServerEnv;
  createClient: (
    keys: ServerEnv["realtyApiKeys"],
  ) => Pick<RealtyApiClient, "fetchAllActiveListings">;
  listActiveListings: typeof listActiveListings;
  upsertListing: typeof upsertListing;
  upsertListings: (
    listings: ListingProperty[],
    options?: { dryRun?: boolean; skipDedupeLookup?: boolean },
  ) => Promise<{ upserted: number; skipped: number; errors: string[] }>;
  listActiveAlerts: typeof listActiveAlerts;
  upsertAlertMatch: typeof upsertAlertMatch;
  createIngestRun: typeof createIngestRun;
  updateIngestRun: typeof updateIngestRun;
  quotaStore: MonthlyQuotaStore;
}

const defaultDeps: DailyRefreshDeps = {
  getServerEnv,
  createClient: (keys) => new RealtyApiClient(keys),
  listActiveListings,
  upsertListing,
  upsertListings,
  listActiveAlerts,
  upsertAlertMatch,
  createIngestRun,
  updateIngestRun,
  quotaStore: firestoreMonthlyQuotaStore,
};

export interface DailyRefreshOptions {
  dryRun?: boolean;
  idempotencyKey?: string;
  /** Run type recorded on the IngestRun. `daily` = scheduled zone refresh; `poll` = safety-net poll. */
  runType?: Extract<IngestRunType, "daily" | "poll">;
  deps?: Partial<DailyRefreshDeps>;
}

export interface DailyRefreshResult {
  runId: string;
  type: Extract<IngestRunType, "daily" | "poll">;
  status: IngestRun["status"];
  listingsFetched: number;
  listingsUpserted: number;
  alertMatchesCreated: number;
  alertMatchesUpdated: number;
  /** RealtyAPI calls spent this run, by key alias. */
  quotaUsed: Record<string, number>;
  /** Running monthly RealtyAPI total across all keys (durable budget), when readable. */
  monthlyRealtyApiCalls?: number;
  errors: string[];
  dryRun: boolean;
}

/**
 * Append a dated price/observation snapshot to each refreshed listing's `history[]`
 * (WS3 contract) so the analysis tools accrue a real time-series. Idempotent within a
 * run: a snapshot is appended only when the latest history entry differs from the
 * current observation (same observedAt date + same price + same status is a no-op), so
 * a poll immediately after a daily refresh does not duplicate the trail.
 */
function appendHistorySnapshot(
  current: ListingProperty | undefined,
  listing: ListingProperty,
  observedAt: string,
): ListingHistoryEntry[] {
  const existing = current?.history ?? listing.history ?? [];
  const snapshot: ListingHistoryEntry = {
    observedAt,
    price: listing.price,
    status: listing.status,
    source: listing.sourceProvider ?? listing.source ?? "realtyapi",
  };

  const last = existing[existing.length - 1];
  const observedDay = observedAt.slice(0, 10);
  const isDuplicate =
    last !== undefined &&
    last.observedAt.slice(0, 10) === observedDay &&
    last.price === snapshot.price &&
    last.status === snapshot.status &&
    last.source === snapshot.source;

  if (isDuplicate) {
    return existing;
  }

  return [...existing, snapshot];
}

async function markStaleListings(
  deps: DailyRefreshDeps,
  refreshedListingIds: Set<string>,
  observedAt: string,
  options?: { dryRun?: boolean },
): Promise<number> {
  const activeListings = await deps.listActiveListings();
  let marked = 0;

  for (const listing of activeListings) {
    if (listing.sourceProvider !== "realtyapi") continue;
    if (refreshedListingIds.has(listing.id)) continue;

    const staleListing: ListingProperty = {
      ...listing,
      status: "Off Market",
      updatedAt: observedAt,
      history: appendHistorySnapshot(listing, { ...listing, status: "Off Market" }, observedAt),
    };

    if (!options?.dryRun) {
      await deps.upsertListing(staleListing, { skipDedupeLookup: true });
    }

    marked += 1;
  }

  return marked;
}

export async function runDailyRefresh(
  options: DailyRefreshOptions = {},
): Promise<DailyRefreshResult> {
  const deps: DailyRefreshDeps = { ...defaultDeps, ...options.deps };
  const runType = options.runType ?? "daily";
  const env = deps.getServerEnv();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const idempotencyKey =
    options.idempotencyKey ?? `${runType}-${BASELINE_ZIP}-${startedAt.slice(0, 10)}`;

  const initialRun: IngestRun = {
    id: runId,
    type: runType,
    status: "running",
    startedAt,
    idempotencyKey,
    zipCode: BASELINE_ZIP,
    radiusMiles: BASELINE_RADIUS_MILES,
    radiusCenter: BASELINE_CENTER,
    keyAliasesUsed: [],
    quotaUsed: {},
    listingsFetched: 0,
    listingsUpserted: 0,
    listingsSkipped: 0,
    alertMatchesCreated: 0,
    alertMatchesUpdated: 0,
    errors: [],
  };

  if (!options.dryRun) {
    await deps.createIngestRun(initialRun);
  }

  const client = deps.createClient(env.realtyApiKeys);
  const fetchResult: ProviderFetchResult = await client.fetchAllActiveListings(
    {
      location: BASELINE_ZIP,
      radiusMiles: BASELINE_RADIUS_MILES,
      centerLat: BASELINE_CENTER.lat,
      centerLng: BASELINE_CENTER.lng,
      zipCode: BASELINE_ZIP,
    },
    { providerRunId: runId },
  );

  // Append a dated price/observation snapshot to each fetched listing before upsert so
  // the durable record accrues a time-series on every refresh (WS3 history contract).
  let existingById = new Map<string, ListingProperty>();
  try {
    const active = await deps.listActiveListings();
    existingById = new Map(active.map((listing) => [listing.id, listing]));
  } catch (error) {
    fetchResult.stats.errors.push(
      error instanceof Error
        ? `History snapshot read skipped: ${error.message}`
        : "History snapshot read skipped: unknown error",
    );
  }

  const listingsWithHistory: ListingProperty[] = fetchResult.listings.map((listing) => ({
    ...listing,
    history: appendHistorySnapshot(existingById.get(listing.id), listing, startedAt),
  }));

  const upsertResult = await deps.upsertListings(listingsWithHistory, {
    dryRun: options.dryRun,
    skipDedupeLookup: true,
  });

  const refreshedIds = new Set(fetchResult.listings.map((listing) => listing.id));
  let staleMarked = 0;
  try {
    staleMarked = await markStaleListings(deps, refreshedIds, startedAt, options);
  } catch (error) {
    fetchResult.stats.errors.push(
      error instanceof Error
        ? `Stale listing scan skipped: ${error.message}`
        : "Stale listing scan skipped: unknown error",
    );
  }

  let alerts: PropertyAlert[] = [];
  try {
    alerts = await deps.listActiveAlerts();
  } catch (error) {
    fetchResult.stats.errors.push(
      error instanceof Error
        ? `Alert evaluation skipped: ${error.message}`
        : "Alert evaluation skipped: unknown error",
    );
  }

  const evaluation = evaluateAlertsForListings(alerts, fetchResult.listings, startedAt);

  let alertMatchesCreated = 0;
  let alertMatchesUpdated = 0;

  for (const match of evaluation.matches as AlertMatch[]) {
    try {
      const result = await deps.upsertAlertMatch(match, { dryRun: options.dryRun });
      if (result.created) {
        alertMatchesCreated += 1;
      } else {
        alertMatchesUpdated += 1;
      }
    } catch (error) {
      fetchResult.stats.errors.push(
        error instanceof Error
          ? `Alert match ${match.id}: ${error.message}`
          : `Alert match ${match.id}: unknown error`,
      );
    }
  }

  const errors = [...fetchResult.stats.errors, ...upsertResult.errors];
  if (staleMarked > 0) {
    errors.push(`Marked ${staleMarked} stale RealtyAPI listings as Off Market.`);
  }

  // Running monthly RealtyAPI total across all keys (durable budget). Read-only; a
  // failure here must not fail the refresh, so it degrades to undefined.
  let monthlyRealtyApiCalls: number | undefined;
  try {
    const quotaMonth = await deps.quotaStore.read();
    monthlyRealtyApiCalls = quotaMonth?.totalSpent;
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `Monthly quota readback skipped: ${error.message}`
        : "Monthly quota readback skipped: unknown error",
    );
  }

  const finishedAt = new Date().toISOString();
  const status: IngestRun["status"] =
    errors.length > 0 && upsertResult.upserted === 0
      ? "failed"
      : errors.length > 0
        ? "partial"
        : "completed";

  const finalRun: Partial<IngestRun> = {
    status,
    finishedAt,
    keyAliasesUsed: fetchResult.stats.keyAliasesUsed,
    quotaUsed: fetchResult.stats.quotaUsed,
    listingsFetched: fetchResult.stats.listingsFetched,
    listingsUpserted: upsertResult.upserted,
    listingsSkipped: upsertResult.skipped,
    alertMatchesCreated,
    alertMatchesUpdated,
    errors,
  };

  if (!options.dryRun) {
    await deps.updateIngestRun(runId, finalRun, { ...initialRun, ...finalRun, id: runId });
  }

  return {
    runId,
    type: runType,
    status,
    listingsFetched: fetchResult.stats.listingsFetched,
    listingsUpserted: upsertResult.upserted,
    alertMatchesCreated,
    alertMatchesUpdated,
    quotaUsed: fetchResult.stats.quotaUsed,
    monthlyRealtyApiCalls,
    errors,
    dryRun: Boolean(options.dryRun),
  };
}
