import { randomUUID } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { RealtyApiClient } from "@/lib/providers/realty-api";
import { upsertListings } from "@/lib/repositories/listings";
import { createIngestRun, updateIngestRun } from "@/lib/repositories/runs";
import type { IngestRun } from "@/types/listings";
import { BASELINE_CENTER, BASELINE_RADIUS_MILES, BASELINE_ZIP } from "./constants";

export interface BackfillOptions {
  dryRun?: boolean;
  idempotencyKey?: string;
}

export interface BackfillResult {
  runId: string;
  status: IngestRun["status"];
  listingsFetched: number;
  listingsUpserted: number;
  listingsSkipped: number;
  errors: string[];
  dryRun: boolean;
}

export async function runBackfill44224(options: BackfillOptions = {}): Promise<BackfillResult> {
  const env = getServerEnv();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const idempotencyKey =
    options.idempotencyKey ?? `backfill-${BASELINE_ZIP}-${startedAt.slice(0, 10)}`;

  const initialRun: IngestRun = {
    id: runId,
    type: "backfill",
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

  // Dry run is a side-effect-free preview: it must neither write to Firestore nor
  // spend the scarce RealtyAPI monthly budget (~250 req/MONTH per key). It validates
  // env + run wiring and reports that no live fetch or write was performed.
  if (options.dryRun) {
    return {
      runId,
      status: "completed",
      listingsFetched: 0,
      listingsUpserted: 0,
      listingsSkipped: 0,
      errors: [],
      dryRun: true,
    };
  }

  await createIngestRun(initialRun);

  try {
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

    const upsertResult = await upsertListings(fetchResult.listings);

    const errors = [...fetchResult.stats.errors, ...upsertResult.errors];
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
      errors,
    };

    await updateIngestRun(runId, finalRun, { ...initialRun, ...finalRun, id: runId });

    return {
      runId,
      status,
      listingsFetched: fetchResult.stats.listingsFetched,
      listingsUpserted: upsertResult.upserted,
      listingsSkipped: upsertResult.skipped,
      errors,
      dryRun: false,
    };
  } catch (error) {
    // A thrown fetch/upsert error must not leave the run stuck in "running" forever.
    const message = error instanceof Error ? error.message : String(error);
    const finishedAt = new Date().toISOString();
    const finalRun: Partial<IngestRun> = {
      status: "failed",
      finishedAt,
      errors: [message],
    };

    try {
      await updateIngestRun(runId, finalRun, { ...initialRun, ...finalRun, id: runId });
    } catch {
      // Best-effort run-status update; surface the original failure regardless.
    }

    return {
      runId,
      status: "failed",
      listingsFetched: 0,
      listingsUpserted: 0,
      listingsSkipped: 0,
      errors: [message],
      dryRun: false,
    };
  }
}
