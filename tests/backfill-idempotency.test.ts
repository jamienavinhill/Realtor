import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildDedupeKey,
  hashRawPayload,
  normalizeRealtyApiListing,
} from "@/lib/providers/realty-api";
import type { RealtyApiSearchResult } from "@/lib/providers/types";
import { BASELINE_CENTER } from "@/lib/ingest/constants";

const fixturePath = resolve(process.cwd(), "tests/fixtures/realty-search-result.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as RealtyApiSearchResult;

const normalizeOptions = {
  radiusCenter: BASELINE_CENTER,
  ingestedAt: "2026-06-08T12:00:00.000Z",
  keyAlias: "realty_key_1",
  providerRunId: "run_backfill_fixture",
  fetchPage: 1,
};

// The backfill's idempotency depends entirely on a deterministic dedupe key + doc id:
// re-running must target the same Firestore document so existing records are updated,
// never duplicated. These tests pin that determinism using the sanitized fixture only —
// no live RealtyAPI calls, no Firestore writes.

test("dedupeKey is deterministic across repeated normalization of the same payload", () => {
  const first = normalizeRealtyApiListing(fixture, normalizeOptions);
  const second = normalizeRealtyApiListing(fixture, normalizeOptions);

  assert.equal(first.dedupeKey, second.dedupeKey);
  // Composite key: normalized address + locality + rounded coords + canonical URL.
  assert.equal(
    first.dedupeKey,
    "realtyapi:addr=123 sample st stow oh 44224|geo=41.1600,-81.4400|url=example.test/listing/fixture_listing_001",
  );
});

test("doc id is deterministically derived from the provider listing id", () => {
  const listing = normalizeRealtyApiListing(fixture, normalizeOptions);
  // upsertListing writes to db.collection("properties").doc(listing.id); a stable id
  // is what makes a re-run an update rather than an insert.
  assert.equal(listing.id, "fixture_listing_001");
  assert.equal(listing.sourceListingId, "fixture_listing_001");
});

test("dedupeKey is independent of the ingest run / key alias / timestamp", () => {
  const runA = normalizeRealtyApiListing(fixture, {
    ...normalizeOptions,
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "realty_key_1",
    providerRunId: "run_a",
  });
  const runB = normalizeRealtyApiListing(fixture, {
    ...normalizeOptions,
    ingestedAt: "2026-07-01T09:30:00.000Z",
    keyAlias: "realty_key_7",
    providerRunId: "run_b",
  });

  assert.equal(runA.dedupeKey, runB.dedupeKey);
  assert.equal(runA.id, runB.id);
});

test("two payloads sharing a listing_id collapse to one dedupeKey (in-batch dedup)", () => {
  const original = normalizeRealtyApiListing(fixture, normalizeOptions);
  // Same listing_id but a changed price (a typical re-listing update) must keep the
  // same dedupe key so the backfill's seenDedupeKeys set treats it as one listing.
  const updated = normalizeRealtyApiListing({ ...fixture, list_price: 339000 }, normalizeOptions);

  assert.equal(original.dedupeKey, updated.dedupeKey);
  assert.equal(original.id, updated.id);
  assert.notEqual(original.rawHash, updated.rawHash);
});

test("dedupeKey is stable when listing_id is absent (composite is address/geo/url based)", () => {
  // The composite key does not depend on the provider listing id, so a re-issue under
  // a different id (or with listing_id dropped) still collapses to the same physical
  // listing. The doc id, however, falls back to property_id.
  const withListingId = normalizeRealtyApiListing(fixture, normalizeOptions);
  const withoutListingId = normalizeRealtyApiListing(
    { ...fixture, listing_id: "" },
    normalizeOptions,
  );

  assert.equal(withoutListingId.dedupeKey, withListingId.dedupeKey);
  assert.equal(withoutListingId.id, "fixture_property_001");
});

test("dedupeKey falls back to the provider id only for sparse payloads (no address/geo/url)", () => {
  const sparse = buildDedupeKey({
    property_id: "sparse_property_001",
    listing_id: "",
    status: "for_sale",
    href: "",
    list_price: 0,
    beds: null,
    baths: null,
    sqft: 0,
    property_type: "single_family",
    address: {
      line: "",
      city: "",
      state_code: "",
      postal_code: "",
      latitude: Number.NaN,
      longitude: Number.NaN,
    },
  });

  assert.equal(sparse, "realtyapi:id=sparse_property_001");
});

test("a re-issue under a different listing/property id still collapses to one dedupeKey", () => {
  const original = normalizeRealtyApiListing(fixture, normalizeOptions);
  const reissued = normalizeRealtyApiListing(
    { ...fixture, listing_id: "different_listing_999", property_id: "different_property_999" },
    normalizeOptions,
  );

  // Same physical home (address/coords/url unchanged) → one dedupe key.
  assert.equal(original.dedupeKey, reissued.dedupeKey);
});

test("rawHash changes only when the underlying provider payload changes", () => {
  const unchanged = hashRawPayload(fixture);
  const sameAgain = hashRawPayload({ ...fixture });
  const changed = hashRawPayload({ ...fixture, list_price: 339000 });

  assert.equal(unchanged, sameAgain);
  assert.notEqual(unchanged, changed);
});

test("normalized listing carries the full provenance set the backfill persists", () => {
  const listing = normalizeRealtyApiListing(fixture, normalizeOptions);

  assert.equal(listing.sourceProvider, "realtyapi");
  assert.equal(listing.sourceUrl, fixture.href);
  assert.equal(listing.sourceListingId, "fixture_listing_001");
  assert.ok(listing.ingestedAt);
  assert.ok(Array.isArray(listing.media) && listing.media.length > 0);
  assert.ok(listing.rawHash);
  assert.ok(listing.dedupeKey);
  assert.deepEqual(listing.radiusCenter, BASELINE_CENTER);
  assert.ok(listing.distanceMiles !== undefined && listing.distanceMiles >= 0);
  assert.equal(listing.provenance?.keyAlias, "realty_key_1");
  assert.equal(listing.provenance?.providerRunId, "run_backfill_fixture");
});
