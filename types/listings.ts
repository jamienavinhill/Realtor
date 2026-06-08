export interface ListingMedia {
  url: string;
  type?: "photo" | "primary";
  sourceUrl?: string;
}

export interface RadiusCenter {
  lat: number;
  lng: number;
  zipCode: string;
}

export interface ListingProvenance {
  providerRunId?: string;
  keyAlias?: string;
  fetchPage?: number;
}

export interface ListingProperty {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: "Single Family" | "Condo" | "Townhouse" | "Multi-Family" | "Land" | string;
  status: "Active" | "Pending" | "Sold" | string;
  imageUrl: string;
  imageUrls?: string[];
  coordinates: {
    lat: number;
    lng: number;
  };
  yearBuilt?: number;
  description?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  sourceProvider?: string;
  sourceUrl?: string;
  sourceListingId?: string;
  sourceUpdatedAt?: string;
  ingestedAt?: string;
  provenance?: ListingProvenance;
  media?: ListingMedia[];
  rawHash?: string;
  dedupeKey?: string;
  distanceMiles?: number;
  radiusCenter?: RadiusCenter;
}

export interface ProviderListingProperty extends ListingProperty {
  sourceProvider: string;
  sourceUrl: string;
  sourceListingId: string;
  ingestedAt: string;
  media: ListingMedia[];
  rawHash: string;
  dedupeKey: string;
}

export interface PropertyAlert {
  id: string;
  userId: string;
  name: string;
  criteria: {
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    beds?: number;
    baths?: number;
    propertyType?: string;
  };
  isActive: boolean;
  createdAt: string;
}

export interface AlertMatch {
  id: string;
  alertId: string;
  listingId: string;
  userId: string;
  matchReason: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface IngestRun {
  id: string;
  type: "backfill" | "daily";
  status: "running" | "completed" | "failed" | "partial";
  startedAt: string;
  finishedAt?: string;
  idempotencyKey: string;
  zipCode?: string;
  radiusMiles?: number;
  radiusCenter?: RadiusCenter;
  keyAliasesUsed: string[];
  quotaUsed: Record<string, number>;
  listingsFetched: number;
  listingsUpserted: number;
  listingsSkipped: number;
  alertMatchesCreated: number;
  alertMatchesUpdated: number;
  errors: string[];
}
