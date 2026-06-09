import assert from "node:assert/strict";
import test from "node:test";
import { runBackfill44224 } from "@/lib/ingest/backfill";
import type { BackfillDeps } from "@/lib/ingest/backfill";
import type { ProviderFetchResult } from "@/lib/providers/types";
import type { ListingProperty } from "@/types/listings";

// Function-level coverage for runBackfill44224's run lifecycle and dry-run cost
// safety. These are the WS6 production guarantees and were previously only asserted at
// the normalization layer. All env/provider/repository dependencies are injected as
// in-memory fakes, so this suite makes ZERO live RealtyAPI calls and ZERO Firestore
// writes — and it runs inside the standard `npm run test` gate (no special flags).

const ENV = {
  realtyApiKeys: [{ alias: "realty_key_1", key: "rt_test" }],
} as ReturnType<BackfillDeps["getServerEnv"]>;

const emptyFetch: ProviderFetchResult = {
  listings: [],
  stats: {
    pagesFetched: 1,
    listingsFetched: 0,
    keyAliasesUsed: ["realty_key_1"],
    quotaUsed: { realty_key_1: 1 },
    errors: [],
  },
};

interface Recorder {
  getServerEnv: number;
  createClient: number;
  fetchAllActiveListings: number;
  upsertListings: number;
  createIngestRun: { id: string; status: string }[];
  updateIngestRun: { runId: string; status?: string }[];
}

function makeDeps(opts: {
  fetch?: () => Promise<ProviderFetchResult>;
  upsert?: () => Promise<{ upserted: number; skipped: number; errors: string[] }>;
}): { deps: Partial<BackfillDeps>; rec: Recorder } {
  const rec: Recorder = {
    getServerEnv: 0,
    createClient: 0,
    fetchAllActiveListings: 0,
    upsertListings: 0,
    createIngestRun: [],
    updateIngestRun: [],
  };

  const deps: Partial<BackfillDeps> = {
    getServerEnv: () => {
      rec.getServerEnv += 1;
      return ENV;
    },
    createClient: () => {
      rec.createClient += 1;
      return {
        fetchAllActiveListings: async () => {
          rec.fetchAllActiveListings += 1;
          return opts.fetch ? opts.fetch() : emptyFetch;
        },
      };
    },
    upsertListings: async (listings: ListingProperty[]) => {
      rec.upsertListings += 1;
      return opts.upsert ? opts.upsert() : { upserted: listings.length, skipped: 0, errors: [] };
    },
    createIngestRun: async (run) => {
      rec.createIngestRun.push({ id: run.id, status: run.status });
    },
    updateIngestRun: async (runId, patch) => {
      rec.updateIngestRun.push({ runId, status: patch.status });
    },
  };

  return { deps, rec };
}

test("dry-run performs zero Firestore writes and zero live provider calls", async () => {
  const { deps, rec } = makeDeps({});

  const result = await runBackfill44224({ dryRun: true, deps });

  assert.equal(result.dryRun, true);
  assert.equal(result.status, "completed");
  assert.equal(result.listingsFetched, 0);
  assert.equal(result.listingsUpserted, 0);
  assert.equal(result.listingsSkipped, 0);
  assert.deepEqual(result.errors, []);

  // Cost-safety guarantee: no client, no fetch, no upsert, no run record writes.
  assert.equal(rec.createClient, 0, "dry-run must not construct the RealtyAPI client");
  assert.equal(rec.fetchAllActiveListings, 0, "dry-run must not call the live provider");
  assert.equal(rec.upsertListings, 0, "dry-run must not write listings");
  assert.equal(rec.createIngestRun.length, 0, "dry-run must not open a run record");
  assert.equal(rec.updateIngestRun.length, 0, "dry-run must not write a run record");
});

test("a successful backfill opens and closes the run record as completed", async () => {
  const { deps, rec } = makeDeps({
    fetch: async () =>
      ({
        listings: [{ dedupeKey: "realtyapi:x" }],
        stats: {
          pagesFetched: 1,
          listingsFetched: 1,
          keyAliasesUsed: ["realty_key_1"],
          quotaUsed: { realty_key_1: 1 },
          errors: [],
        },
      }) as unknown as ProviderFetchResult,
    upsert: async () => ({ upserted: 1, skipped: 0, errors: [] }),
  });

  const result = await runBackfill44224({ deps });

  assert.equal(result.status, "completed");
  assert.equal(result.listingsUpserted, 1);
  assert.equal(rec.createIngestRun.length, 1);
  assert.equal(rec.createIngestRun[0].status, "running");
  assert.equal(rec.updateIngestRun.length, 1);
  assert.equal(rec.updateIngestRun[0].status, "completed");
});

test("fetch/upsert errors with zero upserts close the run as failed (never left running)", async () => {
  const { deps, rec } = makeDeps({
    fetch: async () => ({
      listings: [],
      stats: {
        pagesFetched: 1,
        listingsFetched: 0,
        keyAliasesUsed: ["realty_key_1"],
        quotaUsed: { realty_key_1: 1 },
        errors: ["provider exploded"],
      },
    }),
    upsert: async () => ({ upserted: 0, skipped: 0, errors: [] }),
  });

  const result = await runBackfill44224({ deps });

  assert.equal(result.status, "failed");
  assert.equal(rec.updateIngestRun.length, 1);
  assert.equal(rec.updateIngestRun[0].status, "failed");
});

test("a thrown provider error never leaves the run stuck in running", async () => {
  const { deps, rec } = makeDeps({
    fetch: async () => {
      throw new Error("network down");
    },
  });

  const result = await runBackfill44224({ deps });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.errors, ["network down"]);
  assert.equal(rec.createIngestRun.length, 1);
  assert.equal(rec.createIngestRun[0].status, "running");
  assert.equal(rec.updateIngestRun.length, 1);
  assert.equal(rec.updateIngestRun[0].status, "failed");
});

test("partial failure (some upserts, some errors) closes the run as partial", async () => {
  const { deps, rec } = makeDeps({
    fetch: async () =>
      ({
        listings: [{ dedupeKey: "realtyapi:a" }, { dedupeKey: "realtyapi:b" }],
        stats: {
          pagesFetched: 1,
          listingsFetched: 2,
          keyAliasesUsed: ["realty_key_1"],
          quotaUsed: { realty_key_1: 1 },
          errors: [],
        },
      }) as unknown as ProviderFetchResult,
    upsert: async () => ({
      upserted: 1,
      skipped: 1,
      errors: ["Listing realtyapi:b: boom"],
    }),
  });

  const result = await runBackfill44224({ deps });

  assert.equal(result.status, "partial");
  assert.equal(result.listingsUpserted, 1);
  assert.equal(result.listingsSkipped, 1);
  assert.equal(rec.updateIngestRun[0].status, "partial");
  assert.ok(result.errors.includes("Listing realtyapi:b: boom"));
});
