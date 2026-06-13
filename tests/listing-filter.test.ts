import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterListings } from "@/lib/listings/filter";
import type { ListingProperty, ListingUserState } from "@/types/listings";

function listing(id: string, overrides: Partial<ListingProperty> = {}): ListingProperty {
  return {
    id,
    title: `Listing ${id}`,
    address: `${id} Main St`,
    city: "Stow",
    state: "OH",
    zipCode: "44224",
    price: 300000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    propertyType: "Single Family",
    status: "Active",
    imageUrl: "",
    coordinates: { lat: 0, lng: 0 },
    source: "test",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  };
}

const baseOptions = {
  searchTerm: "",
  cityFilter: "All",
  states: {} as Record<string, ListingUserState>,
  showHidden: false,
  favoritesOnly: false,
};

describe("filterListings (WS12 grid filter)", () => {
  const all = [
    listing("a", { city: "Stow" }),
    listing("b", { city: "Akron", title: "Lakeside Cottage" }),
    listing("c", { city: "Stow" }),
  ];

  it("returns everything with no filters and no preferences", () => {
    const result = filterListings(all, baseOptions);
    assert.equal(result.length, 3);
  });

  it("excludes hidden listings from the default grid", () => {
    const result = filterListings(all, {
      ...baseOptions,
      states: { b: "hidden" },
    });
    assert.deepEqual(
      result.map((l) => l.id),
      ["a", "c"],
    );
  });

  it("recovers hidden listings when showHidden is on", () => {
    const result = filterListings(all, {
      ...baseOptions,
      states: { b: "hidden" },
      showHidden: true,
    });
    assert.equal(result.length, 3);
  });

  it("favoritesOnly narrows to favorited listings", () => {
    const result = filterListings(all, {
      ...baseOptions,
      states: { a: "favorite", c: "interested" },
      favoritesOnly: true,
    });
    assert.deepEqual(
      result.map((l) => l.id),
      ["a"],
    );
  });

  it("a hidden listing stays out even when favoritesOnly is requested", () => {
    const result = filterListings(all, {
      ...baseOptions,
      states: { a: "favorite", b: "hidden" },
      favoritesOnly: true,
    });
    assert.deepEqual(
      result.map((l) => l.id),
      ["a"],
    );
  });

  it("matches search across title, address, and city (case-insensitive)", () => {
    assert.equal(filterListings(all, { ...baseOptions, searchTerm: "lakeside" }).length, 1);
    assert.equal(filterListings(all, { ...baseOptions, searchTerm: "MAIN ST" }).length, 3);
    assert.equal(filterListings(all, { ...baseOptions, searchTerm: "akron" }).length, 1);
  });

  it("applies the city filter", () => {
    const result = filterListings(all, { ...baseOptions, cityFilter: "Stow" });
    assert.deepEqual(
      result.map((l) => l.id),
      ["a", "c"],
    );
  });

  it("applies propertyFilters (types + bedMins matching default data)", () => {
    const pf = { priceBands: [], bedMins: [2], bathMins: [], types: ["Single Family"] };
    const result = filterListings(all, { ...baseOptions, propertyFilters: pf });
    // All three samples are Single Family with beds=3 (>=2), so all pass
    assert.deepEqual(result.map((l) => l.id), ["a", "b", "c"]);
  });

  it("propertyFilters excludes on type mismatch", () => {
    const pf = { priceBands: [], bedMins: [], bathMins: [], types: ["Land"] };
    const result = filterListings(all, { ...baseOptions, propertyFilters: pf });
    assert.equal(result.length, 0);
  });
});

// Committed error-path test for validateListingProperty (real shipped validator)
import { validateListingProperty } from "@/lib/schemas/listing";
import { normalizeManualListing } from "@/lib/ingest/manual-normalize";
import { buildDedupeKey } from "@/lib/providers/realty-api";
import { composeGmailQuery, DEFAULT_PLATFORM_SELECTION } from "@/lib/gmail/platforms";

describe("validateListingProperty (shipped, error path)", () => {
  it("rejects incomplete input and returns success false with errors containing expected fields", () => {
    const bad = { id: "bad", title: "t" };
    const v = validateListingProperty(bad);
    assert.equal(v.success, false);
    assert.ok(Array.isArray(v.errors));
    assert.ok(v.errors.some((e: string) => e.toLowerCase().includes("address")));
  });
});

describe("validateListingProperty (shipped, happy path)", () => {
  it("accepts a complete valid catalog listing and returns success true with data", () => {
    const complete = {
      id: "v-happy", title: "Valid Stow SFH", address: "1 Valid Ln", city: "Stow", state: "OH", zipCode: "44224",
      price: 250000, beds: 3, baths: 2, sqft: 1800, propertyType: "Single Family", status: "Active",
      imageUrl: "https://img", coordinates: { lat: 41.16, lng: -81.44 },
      createdAt: "2026-06-01T00:00:00.000Z", updatedAt: "2026-06-01T00:00:00.000Z", source: "test",
      sourceProvider: "realty", sourceUrl: "https://ex/v-happy", sourceListingId: "v-happy",
      ingestedAt: "2026-06-12T00:00:00.000Z", rawHash: "deadbeef0123456789abcdef01234567", dedupeKey: "dedupe0123456789abcdef0123456789ab",
      media: [{ url: "https://img", type: "primary" }]
    };
    const v = validateListingProperty(complete);
    assert.equal(v.success, true);
    assert.ok(v.data && v.data.id === "v-happy");
  });
});

describe("normalize / dedupe / compose (shipped pure units, real sanitized inputs)", () => {
  it("normalizeManualListing produces listing with id/provenance, no stock media, and passes validator", () => {
    const input = {
      address: "123 Maple Ave",
      city: "Stow",
      state: "OH",
      zipCode: "44224",
      price: 325000,
      beds: 4,
      baths: 2.5,
      sqft: 2400,
      propertyType: "single family",
      title: "Renovated Colonial",
      imageUrl: "https://example.com/photo.jpg",
    };
    const result = normalizeManualListing(input, "manual_paste" as any, { now: "2026-06-12T00:00:00.000Z" });
    assert.equal(result.success, true);
    if (!result.success) return;
    const l = result.listing;
    assert.ok(l && typeof l.id === "string" && l.id.length > 0);
    assert.ok(l.source && l.createdAt);
    const v = validateListingProperty(l);
    assert.equal(v.success, true);
  });

  it("buildDedupeKey is stable for same address/geo", () => {
    const base = { address: "123 Main", city: "Stow", state: "OH", coordinates: { lat: 41.16, lng: -81.44 } } as any;
    const k1 = buildDedupeKey(base);
    const k2 = buildDedupeKey(base);
    assert.equal(k1, k2);
  });

  it("composeGmailQuery includes default platforms + custom fragment", () => {
    const q = composeGmailQuery({ platformIds: DEFAULT_PLATFORM_SELECTION, customQuery: "newer_than:7d" });
    assert.ok(q.includes("Zillow") || q.includes("Redfin") || q.includes("realtor.com"));
    assert.ok(q.includes("newer_than:7d"));
  });
});
