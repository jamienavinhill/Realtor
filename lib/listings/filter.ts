import type { ListingProperty, ListingUserState } from "@/types/listings";

export interface PropertyMultiFilter {
  /** Selected price band ids (e.g. 'lt200', '200-350', 'gt500'). Empty = no price constraint. */
  priceBands: string[];
  /** Selected minimum bed thresholds (e.g. [2,3]); effective floor is the lowest chosen. Empty = no bed constraint. */
  bedMins: number[];
  /** Selected minimum bath thresholds. Empty = no bath constraint. */
  bathMins: number[];
  /** Allowed property types (exact match to listing.propertyType). Empty = allow all. */
  types: string[];
}

export interface ListingFilterOptions {
  searchTerm: string;
  cityFilter: string;
  /** Map of listingId -> per-user state (WS4). */
  states: Record<string, ListingUserState>;
  /** When false, hidden listings are excluded from the result (default grid). */
  showHidden: boolean;
  /** When true, only favorited listings are returned. */
  favoritesOnly: boolean;
  /** Grouped multi-select filters (price/beds/baths/types). No label on control; uniform to fav/hidden/city. */
  propertyFilters?: PropertyMultiFilter;
}

/**
 * Pure listing-grid filter used by the dashboard (WS12). Kept here so the
 * show/hide-hidden and favorites-only rules are unit-testable without React.
 *
 * Rules:
 * - search matches title/address/city (case-insensitive)
 * - city filter ("All" = no constraint)
 * - hidden listings leave the default grid unless `showHidden` is on (recoverable)
 * - `favoritesOnly` narrows to listings whose state is "favorite"
 * - propertyFilters (grouped multi): price band ORs, effective min for beds/baths (lowest selected),
 *   exact type allow-list. Land is excluded by default via the UI filter control.
 */
export function filterListings(
  properties: ListingProperty[],
  options: ListingFilterOptions,
): ListingProperty[] {
  const term = (options.searchTerm || "").trim().toLowerCase();
  const cityFilter = options.cityFilter || "All";
  const states = options.states || {};
  const showHidden = !!options.showHidden;
  const favoritesOnly = !!options.favoritesOnly;
  const pf = options.propertyFilters;

  // Price band matchers (simple, no overdesign).
  const bandTests: Record<string, (price: number) => boolean> = {
    lt200: (p) => p < 200000,
    "200-350": (p) => p >= 200000 && p < 350000,
    "350-500": (p) => p >= 350000 && p < 500000,
    gt500: (p) => p >= 500000,
  };

  return properties.filter((prop) => {
    const matchesSearch =
      term.length === 0 ||
      prop.title.toLowerCase().includes(term) ||
      prop.address.toLowerCase().includes(term) ||
      prop.city.toLowerCase().includes(term);

    const matchesCity = cityFilter === "All" || prop.city === cityFilter;

    const state = states[prop.id];
    const matchesHidden = showHidden || state !== "hidden";
    const matchesFavorites = !favoritesOnly || state === "favorite";

    let matchesProperty = true;
    if (pf) {
      // Types: allow-list (empty = all). This is how Land is excluded (default UI starts without "Land").
      if (pf.types.length > 0 && !pf.types.includes(prop.propertyType)) {
        matchesProperty = false;
      }
      // Price: any selected band matches (OR within group).
      if (matchesProperty && pf.priceBands.length > 0) {
        const anyBand = pf.priceBands.some((b) => bandTests[b]?.(prop.price) ?? false);
        if (!anyBand) matchesProperty = false;
      }
      // Beds: effective floor = lowest selected min (or no filter).
      if (matchesProperty && pf.bedMins.length > 0) {
        const floor = Math.min(...pf.bedMins);
        if (prop.beds < floor) matchesProperty = false;
      }
      // Baths: same.
      if (matchesProperty && pf.bathMins.length > 0) {
        const floor = Math.min(...pf.bathMins);
        if (prop.baths < floor) matchesProperty = false;
      }
    }

    return matchesSearch && matchesCity && matchesHidden && matchesFavorites && matchesProperty;
  });
}
