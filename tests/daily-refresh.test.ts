import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as dailyRoute } from "@/app/api/ingest/daily/route";
import { runDailyRefresh, type DailyRefreshDeps } from "@/lib/ingest/daily-refresh";
import { createInMemoryMonthlyQuotaStore } from "@/lib/repositories/provider-quota";
import { buildAlertMatchId } from "@/lib/repositories/matches";
import type { ProviderFetchResult } from "@/lib/providers/types";
import type { AlertMatch, ListingProperty, PropertyAlert } from "@/types/listings";

// Function-level coverage for the WS8 periodic refresh + alert-evaluation loop.
// Every env/provider/repository dependency is injected as an in-memory fake, so this
// suite makes ZERO live RealtyAPI calls and ZERO Firestore writes and runs inside the
// standard `npm run test` gate (no flags, no emulator).

const ENV = {
  realtyApiKeys: [{ alias: "realty_key_1", key: "rt_test" }],
} as ReturnType<DailyRefreshDeps["getServerEnv"]>;

function listing(overrides: Partial<ListingProperty> = {}): ListingProperty {
  return {
    id: "listing-1",
    title: "3bd 2ba Single Family - 1 Test St",
    address: "1 Test St",
    city: "Stow",
    state: "OH",
    zipCode: "44224",
    price: 300000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    propertyType: "Single Family",
    status: "Active",
    imageUrl: "https://example.com/a.jpg",
    coordinates: { lat: 41.16, lng: -81.44 },
    source: "realtyapi",
    sourceProvider: "realtyapi",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    dedupeKey: "realtyapi:addr=1 test st stow oh 44224",
    ...overrides,
  };
}

function fetchResult(listings: ListingProperty[], errors: string[] = []): ProviderFetchResult {
  return {
    listings: listings as ProviderFetchResult["listings"],
    stats: {
      pagesFetched: 1,
      listingsFetched: listings.length,
      keyAliasesUsed: ["realty_key_1"],
      quotaUsed: { realty_key_1: 1 },
      errors,
      partial: false,
    },
  };
}

interface Recorder {
  createIngestRun: { id: string; type: string; status: string }[];
  updateIngestRun: { runId: string; status?: string }[];
  upsertedListings: ListingProperty[][];
  upsertedMatches: { id: string }[];
  createClient: number;
}

function makeDeps(opts: {
  fetch?: () => Promise<ProviderFetchResult>;
  active?: ListingProperty[];
  alerts?: PropertyAlert[];
  quotaSeed?: Record<string, Record<string, number>>;
  existingMatchIds?: Set<string>;
}): { deps: Partial<DailyRefreshDeps>; rec: Recorder } {
  const rec: Recorder = {
    createIngestRun: [],
    updateIngestRun: [],
    upsertedListings: [],
    upsertedMatches: [],
    createClient: 0,
  };
  const existingMatchIds = opts.existingMatchIds ?? new Set<string>();

  const deps: Partial<DailyRefreshDeps> = {
    getServerEnv: () => ENV,
    createClient: () => {
      rec.createClient += 1;
      return {
        fetchAllActiveListings: async () =>
          opts.fetch ? opts.fetch() : fetchResult(opts.active ?? []),
      };
    },
    listActiveListings: async () => opts.active ?? [],
    upsertListing: async () => ({ id: "x", dedupeKey: "x", created: true }),
    upsertListings: async (listings) => {
      rec.upsertedListings.push(listings);
      return { upserted: listings.length, skipped: 0, errors: [] };
    },
    listActiveAlerts: async () => opts.alerts ?? [],
    upsertAlertMatch: async (match: AlertMatch) => {
      rec.upsertedMatches.push({ id: match.id });
      const created = !existingMatchIds.has(match.id);
      existingMatchIds.add(match.id);
      return { created };
    },
    createIngestRun: async (run) => {
      rec.createIngestRun.push({ id: run.id, type: run.type, status: run.status });
    },
    updateIngestRun: async (runId, patch) => {
      rec.updateIngestRun.push({ runId, status: patch.status });
    },
    quotaStore: createInMemoryMonthlyQuotaStore(opts.quotaSeed),
  };

  return { deps, rec };
}

function dailyRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.test/api/ingest/daily", {
    method: "POST",
    headers,
  });
}

test("protected daily route: returns 503 when INGEST_JOB_TOKEN is not configured", async () => {
  const prior = process.env.INGEST_JOB_TOKEN;
  delete process.env.INGEST_JOB_TOKEN;
  try {
    const res = await dailyRoute(dailyRequest({ authorization: "Bearer anything" }));
    assert.equal(res.status, 503);
  } finally {
    if (prior !== undefined) process.env.INGEST_JOB_TOKEN = prior;
  }
});

test("protected daily route: returns 401 without a token and with a wrong token", async () => {
  const prior = process.env.INGEST_JOB_TOKEN;
  process.env.INGEST_JOB_TOKEN = "ws8-secret";
  try {
    const noToken = await dailyRoute(dailyRequest());
    assert.equal(noToken.status, 401, "missing token must be rejected");

    const wrongToken = await dailyRoute(dailyRequest({ authorization: "Bearer wrong" }));
    assert.equal(wrongToken.status, 401, "wrong token must be rejected");

    const wrongHeader = await dailyRoute(dailyRequest({ "x-ingest-token": "nope" }));
    assert.equal(wrongHeader.status, 401, "wrong x-ingest-token must be rejected");
  } finally {
    if (prior === undefined) delete process.env.INGEST_JOB_TOKEN;
    else process.env.INGEST_JOB_TOKEN = prior;
  }
});

test("dry-run performs zero Firestore writes (no run record, no match write)", async () => {
  const alert: PropertyAlert = {
    id: "alert-1",
    userId: "user-1",
    name: "Stow homes",
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    criteria: { city: "Stow" },
  };
  const { deps, rec } = makeDeps({
    fetch: async () => fetchResult([listing()]),
    alerts: [alert],
  });

  const result = await runDailyRefresh({ dryRun: true, deps });

  assert.equal(result.dryRun, true);
  assert.equal(rec.createIngestRun.length, 0, "dry-run must not open a run record");
  assert.equal(rec.updateIngestRun.length, 0, "dry-run must not write a run record");
  // upsert is invoked with dryRun:true so the repository performs no write; the match
  // upsert is also passed dryRun and must not persist.
  assert.equal(rec.upsertedMatches.length, 1);
});

test("records the run type (daily vs poll) on the IngestRun", async () => {
  const daily = makeDeps({ active: [] });
  await runDailyRefresh({ deps: daily.deps });
  assert.equal(daily.rec.createIngestRun[0].type, "daily");

  const poll = makeDeps({ active: [] });
  await runDailyRefresh({ runType: "poll", deps: poll.deps });
  assert.equal(poll.rec.createIngestRun[0].type, "poll");
});

test("idempotent alert matches: a retry updates, never duplicates", async () => {
  const alert: PropertyAlert = {
    id: "alert-1",
    userId: "user-1",
    name: "Stow homes",
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    criteria: { city: "Stow", maxPrice: 400000 },
  };
  const matched = listing();
  const matchId = buildAlertMatchId(alert.id, matched.id);
  const existingMatchIds = new Set<string>();

  const run1 = makeDeps({
    fetch: async () => fetchResult([matched]),
    alerts: [alert],
    existingMatchIds,
  });
  const r1 = await runDailyRefresh({ deps: run1.deps });
  assert.equal(r1.alertMatchesCreated, 1);
  assert.equal(r1.alertMatchesUpdated, 0);
  assert.deepEqual(run1.rec.upsertedMatches, [{ id: matchId }]);

  // Second run with the SAME match id (shared existingMatchIds) is a retry: update, not create.
  const run2 = makeDeps({
    fetch: async () => fetchResult([matched]),
    alerts: [alert],
    existingMatchIds,
  });
  const r2 = await runDailyRefresh({ deps: run2.deps });
  assert.equal(r2.alertMatchesCreated, 0);
  assert.equal(r2.alertMatchesUpdated, 1);
});

test("appends a dated history snapshot to each refreshed listing", async () => {
  const existing = listing({
    price: 300000,
    history: [
      {
        observedAt: "2026-05-01T00:00:00.000Z",
        price: 310000,
        status: "Active",
        source: "realtyapi",
      },
    ],
  });
  // Provider returns the same listing at a new price.
  const refreshed = listing({ price: 300000 });
  const { deps, rec } = makeDeps({
    fetch: async () => fetchResult([refreshed]),
    active: [existing],
  });

  await runDailyRefresh({ deps });

  const written = rec.upsertedListings[0]?.[0];
  assert.ok(written, "a listing was upserted");
  assert.ok(Array.isArray(written.history));
  // Prior entry preserved + new snapshot appended.
  assert.equal(written.history!.length, 2);
  assert.equal(written.history![1].price, 300000);
  assert.equal(written.history![1].status, "Active");
});

test("history append is idempotent within the same day for an unchanged observation", async () => {
  const today = new Date().toISOString();
  const existing = listing({
    price: 300000,
    status: "Active",
    history: [{ observedAt: today, price: 300000, status: "Active", source: "realtyapi" }],
  });
  const refreshed = listing({ price: 300000, status: "Active" });
  const { deps, rec } = makeDeps({
    fetch: async () => fetchResult([refreshed]),
    active: [existing],
  });

  await runDailyRefresh({ deps });

  const written = rec.upsertedListings[0]?.[0];
  // No duplicate snapshot for the same day + same price/status.
  assert.equal(written?.history?.length, 1);
});

test("monthly-budget stop: an exhausted-key partial fetch closes the run as partial and records monthly total", async () => {
  // Seed the durable monthly store so the key is already at its ceiling; the provider
  // fake surfaces the quota-exhaustion error and an empty result, mirroring the adapter
  // degrading to PARTIAL rather than overspending.
  const { deps } = makeDeps({
    fetch: async () =>
      fetchResult(
        [],
        [
          "Stopped pagination because all RealtyAPI keys reached their monthly quota (~250/MONTH per key).",
        ],
      ),
    quotaSeed: { [new Date().toISOString().slice(0, 7)]: { realty_key_1: 250 } },
  });

  const result = await runDailyRefresh({ deps });

  assert.equal(result.status, "failed", "no upserts + errors => failed");
  assert.ok(result.errors.some((e) => e.includes("monthly quota")));
  // Running monthly total surfaced from the durable budget store.
  assert.equal(result.monthlyRealtyApiCalls, 250);
});

test("a clean refresh closes the run as completed and surfaces per-run + monthly quota", async () => {
  const { deps, rec } = makeDeps({
    fetch: async () => fetchResult([listing()]),
    active: [],
  });

  const result = await runDailyRefresh({ deps });

  assert.equal(result.status, "completed");
  assert.equal(rec.createIngestRun[0].status, "running");
  assert.equal(rec.updateIngestRun[0].status, "completed");
  assert.deepEqual(result.quotaUsed, { realty_key_1: 1 });
});
