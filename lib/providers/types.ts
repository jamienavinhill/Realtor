export interface RealtyApiAddress {
  line: string;
  city: string;
  state_code: string;
  postal_code: string;
  latitude: number;
  longitude: number;
}

export interface RealtyApiSearchResult {
  property_id: string;
  listing_id: string;
  status: string;
  href: string;
  list_price: number;
  beds: number | string | null;
  baths: number | string | null;
  sqft: number;
  property_type: string;
  address: RealtyApiAddress;
  primary_photo?: string;
  photos?: string[];
  list_date?: string;
}

export interface RealtyApiSearchResponse {
  total: number;
  nextPage: boolean;
  resultCount: number;
  searchResults: RealtyApiSearchResult[];
}

export interface ProviderSearchParams {
  location: string;
  radiusMiles: number;
  centerLat: number;
  centerLng: number;
  zipCode: string;
}

export interface ProviderFetchStats {
  pagesFetched: number;
  listingsFetched: number;
  keyAliasesUsed: string[];
  quotaUsed: Record<string, number>;
  errors: string[];
}

export interface ProviderFetchResult {
  listings: import("@/types/listings").ProviderListingProperty[];
  stats: ProviderFetchStats;
}