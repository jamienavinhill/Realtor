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
});
