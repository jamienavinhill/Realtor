import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRealtyDetailGate, hasSpentRealtyDetail } from "@/lib/enrich/realty-detail-gate";
import type { ListingProperty } from "@/types/listings";

type GateListing = Parameters<typeof evaluateRealtyDetailGate>[0];

function listing(overrides: Partial<GateListing> = {}): GateListing {
  return {
    media: [{ url: "https://example.test/a.jpg" }],
    imageUrl: "https://example.test/a.jpg",
    price: 350000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    yearBuilt: 1995,
    enrichment: undefined,
    ...overrides,
  };
}

test("no spend when the listing has media + core facts + year (free lanes suffice)", () => {
  const gate = evaluateRealtyDetailGate(listing(), true);
  assert.equal(gate.shouldFetch, false);
});

test("spends when media is missing and budget is available", () => {
  const gate = evaluateRealtyDetailGate(listing({ media: [], imageUrl: "" }), true);
  assert.equal(gate.shouldFetch, true);
  assert.match(gate.reason, /media/);
});

test("spends when core facts are missing (price/sqft/beds+baths)", () => {
  const gate = evaluateRealtyDetailGate(listing({ price: 0, sqft: 0, beds: 0, baths: 0 }), true);
  assert.equal(gate.shouldFetch, true);
  assert.match(gate.reason, /core-facts/);
});

test("NEVER spends when an authoritative gap exists but the monthly budget is exhausted", () => {
  const gate = evaluateRealtyDetailGate(listing({ media: [], imageUrl: "" }), false);
  assert.equal(gate.shouldFetch, false);
  assert.match(gate.reason, /budget/);
});

test("NEVER re-spends once a prior RealtyAPI detail call is persisted on the listing", () => {
  const spent: Pick<ListingProperty, "enrichment"> = {
    enrichment: { sources: [], realtyApiDetailFetchedAt: "2026-06-09T00:00:00.000Z" },
  };
  assert.equal(hasSpentRealtyDetail(spent), true);
  const gate = evaluateRealtyDetailGate(
    listing({ media: [], imageUrl: "", enrichment: spent.enrichment }),
    true,
  );
  assert.equal(gate.shouldFetch, false);
  assert.match(gate.reason, /already spent/);
});
