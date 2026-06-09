import type { ListingProperty, ListingUserState } from "@/types/listings";

export interface ListingFilterOptions {
  searchTerm: string;
  cityFilter: string;
  /** Map of listingId -> per-user state (WS4). */
  states: Record<string, ListingUserState>;
  /** When false, hidden listings are excluded from the result (default grid). */
  showHidden: boolean;
  /** When true, only favorited listings are returned. */
  favoritesOnly: boolean;
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
 */
export function filterListings(
  properties: ListingProperty[],
  options: ListingFilterOptions,
): ListingProperty[] {
  const term = options.searchTerm.trim().toLowerCase();
  return properties.filter((prop) => {
    const matchesSearch =
      term.length === 0 ||
      prop.title.toLowerCase().includes(term) ||
      prop.address.toLowerCase().includes(term) ||
      prop.city.toLowerCase().includes(term);

    const matchesCity = options.cityFilter === "All" || prop.city === options.cityFilter;

    const state = options.states[prop.id];
    const matchesHidden = options.showHidden || state !== "hidden";
    const matchesFavorites = !options.favoritesOnly || state === "favorite";

    return matchesSearch && matchesCity && matchesHidden && matchesFavorites;
  });
}
