import assert from "node:assert/strict";
import test from "node:test";
import { RealtyApiClient } from "@/lib/providers/realty-api";
import { createInMemoryMonthlyQuotaStore } from "@/lib/repositories/provider-quota";
import type { RealtyApiKeyEntry } from "@/lib/env";

const KEYS: RealtyApiKeyEntry[] = [
  { alias: "realty_key_1", key: "rt_secretONE" },
  { alias: "realty_key_2", key: "rt_secretTWO" },
  { alias: "realty_key_3", key: "rt_secretTHREE" },
];

const SEARCH_PARAMS = {
  location: "44224",
  radiusMiles: 10,
  centerLat: 41.1595,
  centerLng: -81.4404,
  zipCode: "44224",
};

function makeSearchResult(id: string) {
  return {
    property_id: `p_${id}`,
    listing_id: `l_${id}`,
    status: "for_sale",
    href: `https://example.test/listing/${id}`,
    list_price: 300000,
    beds: 3,
    baths: 2,
    sqft: 1500,
    property_type: "single_family",
    address: {
      line: `${id} Test St`,
      city: "Stow",
      state_code: "OH",
      postal_code: "44224",
      latitude: 41.16,
      longitude: -81.44,
    },
    primary_photo: `https://images.example.test/${id}.jpg`,
  };
}

/** Records the x-realtyapi-key headers seen so we can assert rotation without leaking values into errors. */
function makeFetchStub(pages: Array<{ results: string[]; nextPage: boolean }>) {
  const headerKeysSeen: string[] = [];
  let call = 0;
  const fetchImpl = (async (_url: URL | string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    headerKeysSeen.push(headers["x-realtyapi-key"]);
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          total: 100,
          nextPage: page.nextPage,
          resultCount: page.results.length,
          searchResults: page.results.map(makeSearchResult),
        };
      },
      async text() {
        return "";
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, headerKeysSeen };
}

test("key rotation is deterministic across pages and reserves each key durably", async () => {
  const { fetchImpl, headerKeysSeen } = makeFetchStub([
    { results: ["a"], nextPage: true },
    { results: ["b"], nextPage: true },
    { results: ["c"], nextPage: false },
  ]);
  const quotaStore = createInMemoryMonthlyQuotaStore();
  const client = new RealtyApiClient(KEYS, { quotaStore, fetchImpl });

  const result = await client.fetchAllActiveListings(SEARCH_PARAMS, { providerRunId: "run_rot" });

  // Three pages → keys rotate 1,2,3 deterministically.
  assert.deepEqual(headerKeysSeen, ["rt_secretONE", "rt_secretTWO", "rt_secretTHREE"]);
  assert.equal(result.stats.pagesFetched, 3);
  assert.equal(result.listings.length, 3);
  assert.equal(result.stats.partial, false);
  assert.deepEqual(result.stats.keyAliasesUsed, ["realty_key_1", "realty_key_2", "realty_key_3"]);

  // Durable store recorded one spend per key alias — never the key value.
  const doc = await quotaStore.read();
  assert.equal(doc?.perKey.realty_key_1, 1);
  assert.equal(doc?.perKey.realty_key_2, 1);
  assert.equal(doc?.perKey.realty_key_3, 1);
});

test("monthly quota stops pagination before the ceiling and degrades to PARTIAL", async () => {
  // Seed the durable store so two of three keys are already exhausted this month and
  // the third has only 1 call left, then ask for 5 pages.
  const month = new Date().toISOString().slice(0, 7);
  const quotaStore = createInMemoryMonthlyQuotaStore({
    [month]: { realty_key_1: 250, realty_key_2: 250, realty_key_3: 249 },
  });
  const { fetchImpl, headerKeysSeen } = makeFetchStub([
    { results: ["a"], nextPage: true },
    { results: ["b"], nextPage: true },
    { results: ["c"], nextPage: true },
  ]);
  const client = new RealtyApiClient(KEYS, { quotaStore, fetchImpl });

  const result = await client.fetchAllActiveListings(SEARCH_PARAMS);

  // Only key 3 had a single call left → exactly one live fetch, then PARTIAL.
  assert.deepEqual(headerKeysSeen, ["rt_secretTHREE"]);
  assert.equal(result.stats.pagesFetched, 1);
  assert.equal(result.listings.length, 1);
  assert.equal(result.stats.partial, true, "quota exhaustion must degrade to partial");
  assert.ok(
    result.stats.errors.some((e) => e.toLowerCase().includes("monthly quota")),
    "should record the monthly-quota stop reason",
  );

  // The over-budget key was never spent past its ceiling.
  const doc = await quotaStore.read();
  assert.equal(doc?.perKey.realty_key_3, 250);
});

test("no RealtyAPI key value leaks into the error array or stats", async () => {
  const month = new Date().toISOString().slice(0, 7);
  const quotaStore = createInMemoryMonthlyQuotaStore({
    [month]: { realty_key_1: 250, realty_key_2: 250, realty_key_3: 250 },
  });
  const { fetchImpl } = makeFetchStub([{ results: ["a"], nextPage: false }]);
  const client = new RealtyApiClient(KEYS, { quotaStore, fetchImpl });

  const result = await client.fetchAllActiveListings(SEARCH_PARAMS);
  const serialized = JSON.stringify(result.stats);

  for (const entry of KEYS) {
    assert.ok(
      !serialized.includes(entry.key),
      `stats must not contain the key value ${entry.alias}`,
    );
  }
  assert.equal(result.stats.partial, true);
});
