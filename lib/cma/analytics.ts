import type { ListingProperty } from "@/types/listings";

/**
 * Pure CMA analytics helpers (WS13). Kept React-free so sort, pagination, and the
 * derived chart/metric math are unit-testable in isolation. Every value here is
 * derived strictly from the real Firestore inventory passed in — no synthetic or
 * placeholder figures. Callers must surface honest empty/"not enough data" states
 * when an input set is empty or a bucket would be degenerate.
 */

/** Listings considered "active" for CMA math (status compared case-insensitively). */
export function selectActiveListings(properties: ListingProperty[]): ListingProperty[] {
  return properties.filter((p) => p.status.toLowerCase() === "active");
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/**
 * Stable sort by an accessor. Numbers sort numerically, everything else by
 * locale-aware string compare. Ties preserve the original input order so
 * pagination stays deterministic across re-sorts.
 */
export function sortByAccessor<T>(
  items: T[],
  accessor: (item: T) => string | number | null | undefined,
  direction: SortDirection,
): T[] {
  const factor = direction === "asc" ? 1 : -1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const av = accessor(a.item);
      const bv = accessor(b.item);
      // Missing values always sink to the bottom regardless of direction, so the
      // direction factor must NOT flip them. We resolve missingness before applying
      // the factor and short-circuit when only one side is missing.
      const aMissing = av === null || av === undefined;
      const bMissing = bv === null || bv === undefined;
      if (aMissing || bMissing) {
        if (aMissing && bMissing) return a.index - b.index;
        return aMissing ? 1 : -1;
      }
      const cmp = compareValues(av, bv);
      return cmp !== 0 ? cmp * factor : a.index - b.index;
    })
    .map((entry) => entry.item);
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Toggle direction for a clicked column: same column flips asc/desc; a new column starts asc. */
export function nextSortState<K extends string>(
  current: SortState<K>,
  clickedKey: K,
): SortState<K> {
  if (current.key === clickedKey) {
    return { key: clickedKey, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { key: clickedKey, direction: "asc" };
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export interface PageResult<T> {
  rows: T[];
  page: number; // clamped 1-based page actually shown
  pageCount: number; // total pages (>= 1)
  pageSize: number;
  total: number;
  startIndex: number; // 0-based index of first row on the page (0 when empty)
  endIndex: number; // 0-based index of last row on the page (-1 when empty)
}

/** Slice items into a clamped 1-based page. Page is clamped into [1, pageCount]. */
export function paginate<T>(items: T[], page: number, pageSize: number): PageResult<T> {
  const total = items.length;
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const clampedPage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const start = (clampedPage - 1) * size;
  const rows = items.slice(start, start + size);
  return {
    rows,
    page: clampedPage,
    pageCount,
    pageSize: size,
    total,
    startIndex: total === 0 ? 0 : start,
    endIndex: total === 0 ? -1 : start + rows.length - 1,
  };
}

// ---------------------------------------------------------------------------
// Derived metrics
// ---------------------------------------------------------------------------

export interface CmaMetrics {
  count: number;
  avgPrice: number;
  medianPrice: number;
  avgPricePerSqft: number;
  minPrice: number;
  maxPrice: number;
}

export function computeMetrics(listings: ListingProperty[]): CmaMetrics {
  if (listings.length === 0) {
    return { count: 0, avgPrice: 0, medianPrice: 0, avgPricePerSqft: 0, minPrice: 0, maxPrice: 0 };
  }
  const prices = listings.map((l) => l.price);
  const totalPrice = prices.reduce((sum, p) => sum + p, 0);
  const totalSqft = listings.reduce((sum, l) => sum + (l.sqft || 0), 0);
  return {
    count: listings.length,
    avgPrice: Math.round(totalPrice / listings.length),
    medianPrice: median(prices),
    avgPricePerSqft: totalSqft > 0 ? Math.round(totalPrice / totalSqft) : 0,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Per-listing price-per-sqft, or null when sqft is missing/zero (kept honest, never 0-faked). */
export function pricePerSqft(listing: ListingProperty): number | null {
  return listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : null;
}

// ---------------------------------------------------------------------------
// Chart datasets (real inventory only)
// ---------------------------------------------------------------------------

export interface HistogramBin {
  label: string;
  count: number;
  min: number;
  max: number;
}

/**
 * Price-distribution histogram with `binCount` equal-width bins across the
 * observed price range. Returns [] when there are no listings or the prices have
 * no spread (a single distinct price can't form a meaningful distribution) so the
 * caller can show an honest "not enough data" state instead of a one-bar chart.
 */
export function priceHistogram(listings: ListingProperty[], binCount = 8): HistogramBin[] {
  if (listings.length < 2) return [];
  const prices = listings.map((l) => l.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  if (max <= min) return [];
  const bins = Math.max(1, Math.floor(binCount));
  const width = (max - min) / bins;
  const result: HistogramBin[] = Array.from({ length: bins }, (_, i) => {
    const binMin = min + i * width;
    const binMax = i === bins - 1 ? max : min + (i + 1) * width;
    return { label: formatPriceRange(binMin, binMax), count: 0, min: binMin, max: binMax };
  });
  for (const price of prices) {
    // Last bin is inclusive of max so the top price lands in-range.
    let idx = Math.floor((price - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    result[idx].count += 1;
  }
  return result;
}

function formatPriceRange(min: number, max: number): string {
  return `${formatPriceShort(min)}–${formatPriceShort(max)}`;
}

function formatPriceShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(value / 1000)}k`;
}

export interface CategoryDatum {
  name: string;
  count: number;
}

/** Property-type mix: count of listings per `propertyType`, sorted by count desc. */
export function propertyTypeMix(listings: ListingProperty[]): CategoryDatum[] {
  return countBy(listings, (l) => l.propertyType || "Unknown");
}

/** Status breakdown across the FULL inventory (not just active), count desc. */
export function statusBreakdown(listings: ListingProperty[]): CategoryDatum[] {
  return countBy(listings, (l) => l.status || "Unknown");
}

/** Listings by city, top N by count (remaining grouped under "Other" when present). */
export function listingsByCity(listings: ListingProperty[], topN = 8): CategoryDatum[] {
  const all = countBy(listings, (l) => l.city || "Unknown");
  if (all.length <= topN) return all;
  const top = all.slice(0, topN);
  const otherCount = all.slice(topN).reduce((sum, d) => sum + d.count, 0);
  return otherCount > 0 ? [...top, { name: "Other", count: otherCount }] : top;
}

export interface PricePerSqftByTypeDatum {
  name: string;
  avgPricePerSqft: number;
  count: number;
}

/**
 * Average $/sqft per property type, derived from listings that have a usable sqft.
 * Types whose listings all lack sqft are dropped so we never emit a $0 bar.
 */
export function pricePerSqftByType(listings: ListingProperty[]): PricePerSqftByTypeDatum[] {
  const groups = new Map<string, { totalPrice: number; totalSqft: number; count: number }>();
  for (const l of listings) {
    if (l.sqft <= 0) continue;
    const key = l.propertyType || "Unknown";
    const g = groups.get(key) ?? { totalPrice: 0, totalSqft: 0, count: 0 };
    g.totalPrice += l.price;
    g.totalSqft += l.sqft;
    g.count += 1;
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .map(([name, g]) => ({
      name,
      avgPricePerSqft: Math.round(g.totalPrice / g.totalSqft),
      count: g.count,
    }))
    .sort((a, b) => b.avgPricePerSqft - a.avgPricePerSqft);
}

function countBy<T>(items: T[], key: (item: T) => string): CategoryDatum[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
