import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { validateListingProperty } from "@/lib/schemas/listing";
import { normalizeRealtyApiListing } from "@/lib/providers/realty-api";
import type { RealtyApiSearchResult } from "@/lib/providers/types";

const fixturePath = resolve(process.cwd(), "tests/fixtures/realty-search-result.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as RealtyApiSearchResult;

test("validateListingProperty accepts normalized RealtyAPI fixture", () => {
  const listing = normalizeRealtyApiListing(fixture, {
    radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "test_key",
  });

  const result = validateListingProperty(listing);
  assert.equal(result.success, true);

  if (result.success) {
    assert.equal(result.data.sourceProvider, "realtyapi");
    assert.equal(result.data.dedupeKey, "realtyapi:fixture_listing_001");
    assert.equal(result.data.media?.length, 2);
    assert.ok((result.data.rawHash?.length ?? 0) > 0);
    assert.equal(result.data.radiusCenter?.zipCode, "44224");
  }
});

test("validateListingProperty rejects malformed listing", () => {
  const result = validateListingProperty({ id: "bad" });
  assert.equal(result.success, false);
});