import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeMetrics,
  listingsByCity,
  nextSortState,
  paginate,
  priceHistogram,
  pricePerSqft,
  pricePerSqftByType,
  propertyTypeMix,
  selectActiveListings,
  sortByAccessor,
  statusBreakdown,
  type SortState,
} from "@/lib/cma/analytics";
import type { ListingProperty } from "@/types/listings";

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

describe("selectActiveListings", () => {
  it("keeps only case-insensitive active status", () => {
    const result = selectActiveListings([
      listing("a", { status: "Active" }),
      listing("b", { status: "active" }),
      listing("c", { status: "Pending" }),
      listing("d", { status: "Sold" }),
    ]);
    assert.deepEqual(
      result.map((l) => l.id),
      ["a", "b"],
    );
  });
});

describe("sortByAccessor", () => {
  const rows = [
    listing("a", { price: 300000 }),
    listing("b", { price: 100000 }),
    listing("c", { price: 200000 }),
  ];

  it("sorts numbers ascending", () => {
    const result = sortByAccessor(rows, (r) => r.price, "asc");
    assert.deepEqual(
      result.map((r) => r.id),
      ["b", "c", "a"],
    );
  });

  it("sorts numbers descending", () => {
    const result = sortByAccessor(rows, (r) => r.price, "desc");
    assert.deepEqual(
      result.map((r) => r.id),
      ["a", "c", "b"],
    );
  });

  it("is stable for ties (preserves input order)", () => {
    const tied = [
      listing("a", { price: 100000 }),
      listing("b", { price: 100000 }),
      listing("c", { price: 100000 }),
    ];
    const result = sortByAccessor(tied, (r) => r.price, "asc");
    assert.deepEqual(
      result.map((r) => r.id),
      ["a", "b", "c"],
    );
  });

  it("sorts strings with numeric/locale awareness", () => {
    const cities = [
      listing("a", { city: "Akron" }),
      listing("b", { city: "stow" }),
      listing("c", { city: "Cuyahoga Falls" }),
    ];
    const result = sortByAccessor(cities, (r) => r.city, "asc");
    assert.deepEqual(
      result.map((r) => r.id),
      ["a", "c", "b"],
    );
  });

  it("does not mutate the input array", () => {
    const input = [...rows];
    sortByAccessor(input, (r) => r.price, "asc");
    assert.deepEqual(
      input.map((r) => r.id),
      ["a", "b", "c"],
    );
  });

  it("sinks missing values to the bottom in ascending order", () => {
    const mixed = [
      listing("a", { sqft: 1000 }), // $/sqft present
      listing("b", { sqft: 0 }), // $/sqft null (missing)
      listing("c", { sqft: 2000 }), // $/sqft present
    ];
    const result = sortByAccessor(mixed, (r) => pricePerSqft(r), "asc");
    // Present values sort ascending; the null lands last, not first.
    assert.deepEqual(
      result.map((r) => r.id),
      ["c", "a", "b"],
    );
  });

  it("keeps missing values at the bottom in descending order too", () => {
    const mixed = [
      listing("a", { sqft: 1000 }),
      listing("b", { sqft: 0 }), // missing
      listing("c", { sqft: 2000 }),
    ];
    const result = sortByAccessor(mixed, (r) => pricePerSqft(r), "desc");
    // Present values sort descending; the null still trails, never leads.
    assert.deepEqual(
      result.map((r) => r.id),
      ["a", "c", "b"],
    );
  });

  it("preserves input order among multiple missing values", () => {
    const mixed = [
      listing("a", { sqft: 0 }),
      listing("b", { sqft: 1000 }),
      listing("c", { sqft: 0 }),
    ];
    const result = sortByAccessor(mixed, (r) => pricePerSqft(r), "desc");
    assert.deepEqual(
      result.map((r) => r.id),
      ["b", "a", "c"],
    );
  });
});

describe("nextSortState", () => {
  it("flips direction when the same column is clicked", () => {
    const current: SortState<string> = { key: "price", direction: "asc" };
    assert.deepEqual(nextSortState(current, "price"), { key: "price", direction: "desc" });
  });

  it("starts ascending when a new column is clicked", () => {
    const current: SortState<string> = { key: "price", direction: "desc" };
    assert.deepEqual(nextSortState(current, "city"), { key: "city", direction: "asc" });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 88 }, (_, i) => i + 1);

  it("returns a default-sized first page and correct page count", () => {
    const result = paginate(items, 1, 10);
    assert.equal(result.rows.length, 10);
    assert.deepEqual(result.rows[0], 1);
    assert.equal(result.pageCount, 9);
    assert.equal(result.total, 88);
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 9);
  });

  it("slices the requested page", () => {
    const result = paginate(items, 3, 10);
    assert.deepEqual(result.rows[0], 21);
    assert.equal(result.rows.length, 10);
  });

  it("returns a short final page", () => {
    const result = paginate(items, 9, 10);
    assert.equal(result.rows.length, 8);
    assert.deepEqual(result.rows[0], 81);
  });

  it("clamps out-of-range pages into bounds", () => {
    assert.equal(paginate(items, 999, 10).page, 9);
    assert.equal(paginate(items, -5, 10).page, 1);
  });

  it("supports larger page sizes", () => {
    const result = paginate(items, 1, 100);
    assert.equal(result.rows.length, 88);
    assert.equal(result.pageCount, 1);
  });

  it("handles an empty data set honestly", () => {
    const result = paginate<number>([], 1, 10);
    assert.equal(result.rows.length, 0);
    assert.equal(result.pageCount, 1);
    assert.equal(result.total, 0);
    assert.equal(result.endIndex, -1);
  });
});

describe("computeMetrics", () => {
  it("returns zeros for an empty set", () => {
    assert.deepEqual(computeMetrics([]), {
      count: 0,
      avgPrice: 0,
      medianPrice: 0,
      avgPricePerSqft: 0,
      minPrice: 0,
      maxPrice: 0,
    });
  });

  it("computes average, median, min, max, and $/sqft", () => {
    const m = computeMetrics([
      listing("a", { price: 100000, sqft: 1000 }),
      listing("b", { price: 200000, sqft: 1000 }),
      listing("c", { price: 300000, sqft: 1000 }),
    ]);
    assert.equal(m.count, 3);
    assert.equal(m.avgPrice, 200000);
    assert.equal(m.medianPrice, 200000);
    assert.equal(m.minPrice, 100000);
    assert.equal(m.maxPrice, 300000);
    assert.equal(m.avgPricePerSqft, 200); // 600000 / 3000
  });

  it("computes an even-length median as the average of the two middle values", () => {
    const m = computeMetrics([
      listing("a", { price: 100000 }),
      listing("b", { price: 200000 }),
      listing("c", { price: 300000 }),
      listing("d", { price: 500000 }),
    ]);
    assert.equal(m.medianPrice, 250000);
  });

  it("excludes zero-sqft listings from the $/sqft denominator", () => {
    const m = computeMetrics([
      listing("a", { price: 200000, sqft: 1000 }),
      listing("b", { price: 200000, sqft: 0 }),
    ]);
    // 400000 / 1000 = 400
    assert.equal(m.avgPricePerSqft, 400);
  });
});

describe("pricePerSqft", () => {
  it("returns null for zero/missing sqft instead of faking a value", () => {
    assert.equal(pricePerSqft(listing("a", { sqft: 0 })), null);
  });
  it("rounds the ratio", () => {
    assert.equal(pricePerSqft(listing("a", { price: 250000, sqft: 1000 })), 250);
  });
});

describe("priceHistogram", () => {
  it("returns [] with fewer than two listings", () => {
    assert.deepEqual(priceHistogram([listing("a")]), []);
  });

  it("returns [] when all prices are identical (no spread)", () => {
    assert.deepEqual(
      priceHistogram([listing("a", { price: 300000 }), listing("b", { price: 300000 })]),
      [],
    );
  });

  it("buckets all listings and conserves total count", () => {
    const listings = Array.from({ length: 20 }, (_, i) =>
      listing(`l${i}`, { price: 100000 + i * 10000 }),
    );
    const bins = priceHistogram(listings, 5);
    assert.equal(bins.length, 5);
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    assert.equal(total, 20);
  });

  it("places the maximum price in the last bin (inclusive)", () => {
    const listings = [
      listing("a", { price: 100000 }),
      listing("b", { price: 150000 }),
      listing("c", { price: 200000 }),
    ];
    const bins = priceHistogram(listings, 2);
    const total = bins.reduce((sum, b) => sum + b.count, 0);
    assert.equal(total, 3);
    assert.equal(bins[bins.length - 1].count >= 1, true);
  });
});

describe("propertyTypeMix", () => {
  it("counts by type, sorted by count desc", () => {
    const result = propertyTypeMix([
      listing("a", { propertyType: "Condo" }),
      listing("b", { propertyType: "Single Family" }),
      listing("c", { propertyType: "Single Family" }),
    ]);
    assert.deepEqual(result, [
      { name: "Single Family", count: 2 },
      { name: "Condo", count: 1 },
    ]);
  });
});

describe("statusBreakdown", () => {
  it("counts all statuses across the full inventory", () => {
    const result = statusBreakdown([
      listing("a", { status: "Active" }),
      listing("b", { status: "Active" }),
      listing("c", { status: "Pending" }),
    ]);
    assert.deepEqual(result, [
      { name: "Active", count: 2 },
      { name: "Pending", count: 1 },
    ]);
  });
});

describe("listingsByCity", () => {
  it("groups remaining cities under Other beyond topN", () => {
    const listings = [
      listing("a", { city: "Stow" }),
      listing("b", { city: "Stow" }),
      listing("c", { city: "Akron" }),
      listing("d", { city: "Kent" }),
      listing("e", { city: "Tallmadge" }),
    ];
    const result = listingsByCity(listings, 2);
    assert.equal(result[0].name, "Stow");
    assert.equal(result[result.length - 1].name, "Other");
    const total = result.reduce((sum, d) => sum + d.count, 0);
    assert.equal(total, 5);
  });

  it("does not add Other when within topN", () => {
    const result = listingsByCity([listing("a", { city: "Stow" })], 8);
    assert.deepEqual(result, [{ name: "Stow", count: 1 }]);
  });
});

describe("pricePerSqftByType", () => {
  it("averages $/sqft per type and drops zero-sqft-only types", () => {
    const result = pricePerSqftByType([
      listing("a", { propertyType: "Condo", price: 200000, sqft: 1000 }),
      listing("b", { propertyType: "Condo", price: 300000, sqft: 1000 }),
      listing("c", { propertyType: "Land", price: 50000, sqft: 0 }),
    ]);
    // Condo: 500000 / 2000 = 250; Land dropped (no usable sqft).
    assert.deepEqual(result, [{ name: "Condo", avgPricePerSqft: 250, count: 2 }]);
  });
});
