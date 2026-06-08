import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { RealtyApiClient } from "@/lib/providers/realty-api";
import { evaluateAlertsForListings } from "@/lib/ingest/alert-eval";
import { BASELINE_CENTER, BASELINE_RADIUS_MILES, BASELINE_ZIP } from "@/lib/ingest/constants";
import { listActiveAlerts } from "@/lib/repositories/alerts";
import { listActiveListings, upsertListings } from "@/lib/repositories/listings";
import { upsertAlertMatch } from "@/lib/repositories/matches";
import { createIngestRun, updateIngestRun } from "@/lib/repositories/runs";
import type { IngestRun, ListingProperty } from "@/types/listings";

export interface DailyRefreshOptions {
  dryRun?: boolean;
  idempotencyKey?: string;
}

export interface DailyRefreshResult {
  runId: string;
  listingsFetched: number;
  listingsUpserted: number;
  alertMatchesCreated: number;
  alertMatchesUpdated: number;
  errors: string[];
  dryRun: boolean;
}

async function markStaleListings(
  refreshedListingIds: Set<string>,
  options?: { dryRun?: boolean },
): Promise<number> {
  const activeListings = await listActiveListings();
  let marked = 0;

  for (const listing of activeListings) {
    if (listing.sourceProvider !== "realtyapi") continue;
    if (refreshedListingIds.has(listing.id)) continue;

    const staleListing: ListingProperty = {
      ...listing,
      status: "Off Market",
      updatedAt: new Date().toISOString(),
    };

    if (!options?.dryRun) {
      const { upsertListing } = await import("@/lib/repositories/listings");
      await upsertListing(staleListing);
    }

    marked += 1;
  }

  return marked;
}

export async function runDailyRefresh(
  options: DailyRefreshOptions = {},
): Promise<DailyRefreshResult> {
  const env = getServerEnv();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const idempotencyKey =
    options.idempotencyKey ?? `daily-${BASELINE_ZIP}-${startedAt.slice(0, 10)}`;

  const initialRun: IngestRun = {
    id: runId,
    type: "daily",
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
    await createIngestRun(initialRun);
  }

  const client = new RealtyApiClient(env.realtyApiKeys);
  const fetchResult = await client.fetchAllActiveListings(
    {
      location: BASELINE_ZIP,
      radiusMiles: BASELINE_RADIUS_MILES,
      centerLat: BASELINE_CENTER.lat,
      centerLng: BASELINE_CENTER.lng,
      zipCode: BASELINE_ZIP,
    },
    { providerRunId: runId },
  );

  const upsertResult = await upsertListings(fetchResult.listings, {
    dryRun: options.dryRun,
    skipDedupeLookup: true,
  });

  const refreshedIds = new Set(fetchResult.listings.map((listing) => listing.id));
  let staleMarked = 0;
  try {
    staleMarked = await markStaleListings(refreshedIds, options);
  } catch (error) {
    fetchResult.stats.errors.push(
      error instanceof Error
        ? `Stale listing scan skipped: ${error.message}`
        : "Stale listing scan skipped: unknown error",
    );
  }

  let alerts: Awaited<ReturnType<typeof listActiveAlerts>> = [];
  try {
    alerts = await listActiveAlerts();
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

  for (const match of evaluation.matches) {
    try {
      const result = await upsertAlertMatch(match, { dryRun: options.dryRun });
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
    await updateIngestRun(runId, finalRun, { ...initialRun, ...finalRun, id: runId });
  }

  return {
    runId,
    listingsFetched: fetchResult.stats.listingsFetched,
    listingsUpserted: upsertResult.upserted,
    alertMatchesCreated,
    alertMatchesUpdated,
    errors,
    dryRun: Boolean(options.dryRun),
  };
}
