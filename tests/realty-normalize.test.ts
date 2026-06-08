import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  haversineDistanceMiles,
  hashRawPayload,
  normalizeRealtyApiListing,
} from "@/lib/providers/realty-api";
import type { RealtyApiSearchResult } from "@/lib/providers/types";

const fixturePath = resolve(process.cwd(), "tests/fixtures/realty-search-result.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as RealtyApiSearchResult;

test("normalizeRealtyApiListing maps RealtyAPI search result shape", () => {
  const listing = normalizeRealtyApiListing(fixture, {
    radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "fixture",
    providerRunId: "run_fixture",
    fetchPage: 1,
  });

  assert.equal(listing.id, "fixture_listing_001");
  assert.equal(listing.sourceListingId, "fixture_listing_001");
  assert.equal(listing.sourceUrl, fixture.href);
  assert.equal(listing.price, 325000);
  assert.equal(listing.city, "Stow");
  assert.equal(listing.state, "OH");
  assert.equal(listing.zipCode, "44224");
  assert.equal(listing.status, "Active");
  assert.equal(listing.imageUrl, fixture.primary_photo);
  assert.equal(listing.provenance?.keyAlias, "fixture");
  assert.ok(listing.distanceMiles !== undefined && listing.distanceMiles >= 0);
});

test("hashRawPayload is stable for identical payloads", () => {
  const first = hashRawPayload(fixture);
  const second = hashRawPayload(fixture);
  assert.equal(first, second);
});

test("normalizeRealtyApiListing coerces string beds and baths from provider payloads", () => {
  const listing = normalizeRealtyApiListing(
    { ...fixture, beds: "3", baths: "2.5" },
    {
      radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
      ingestedAt: "2026-06-08T12:00:00.000Z",
      keyAlias: "fixture",
    },
  );

  assert.equal(listing.beds, 3);
  assert.equal(listing.baths, 2.5);
});

test("normalizeRealtyApiListing strips trailing plus from fractional bath counts", () => {
  const listing = normalizeRealtyApiListing(
    { ...fixture, beds: 4, baths: "4.5+" },
    {
      radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
      ingestedAt: "2026-06-08T12:00:00.000Z",
      keyAlias: "fixture",
    },
  );

  assert.equal(listing.baths, 4.5);
});

test("haversineDistanceMiles returns near-zero for identical coordinates", () => {
  const distance = haversineDistanceMiles(41.1595, -81.4404, 41.1595, -81.4404);
  assert.equal(distance, 0);
});