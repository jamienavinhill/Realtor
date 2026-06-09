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
    assert.equal(result.data.provenance?.keyAlias, "test_key");
  }
});

test("validateListingProperty rejects malformed provenance", () => {
  const listing = normalizeRealtyApiListing(fixture, {
    radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "test_key",
  });

  const result = validateListingProperty({
    ...listing,
    provenance: { fetchPage: 0 },
  });
  assert.equal(result.success, false);
});

test("validateListingProperty rejects malformed listing", () => {
  const result = validateListingProperty({ id: "bad" });
  assert.equal(result.success, false);
});

test("validateListingProperty accepts enrichment and history additions", () => {
  const listing = normalizeRealtyApiListing(fixture, {
    radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "test_key",
  });

  const result = validateListingProperty({
    ...listing,
    enrichment: {
      schools: [{ name: "Stow-Munroe Falls HS", rating: 8, sourceUrl: "https://example.com/s" }],
      neighborhood: "Quiet residential pocket near the river.",
      walkability: 42,
      commuteNotes: "20 min to downtown Akron.",
      sources: [
        {
          field: "neighborhood",
          url: "https://example.com/n",
          provider: "google-search",
          fetchedAt: "2026-06-09T00:00:00.000Z",
        },
      ],
      realtyApiDetailFetchedAt: "2026-06-09T00:00:00.000Z",
    },
    history: [
      {
        observedAt: "2026-06-08T12:00:00.000Z",
        price: 250000,
        status: "Active",
        source: "realtyapi",
      },
    ],
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.enrichment?.sources.length, 1);
    assert.equal(result.data.enrichment?.sources[0]?.provider, "google-search");
    assert.equal(result.data.history?.length, 1);
  }
});

test("validateListingProperty rejects enrichment source with bad provider", () => {
  const listing = normalizeRealtyApiListing(fixture, {
    radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
    ingestedAt: "2026-06-08T12:00:00.000Z",
    keyAlias: "test_key",
  });

  const result = validateListingProperty({
    ...listing,
    enrichment: {
      sources: [
        {
          field: "x",
          url: "https://example.com",
          provider: "made-up",
          fetchedAt: "2026-06-09T00:00:00.000Z",
        },
      ],
    },
  });
  assert.equal(result.success, false);
});
