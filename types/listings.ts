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

/** Provider/source attribution for a single free-lane enriched field. */
export interface ListingEnrichmentSource {
  field: string;
  url: string;
  provider: "gemini" | "google-search" | "web";
  fetchedAt: string;
}

export interface ListingEnrichmentSchool {
  name: string;
  rating?: number;
  sourceUrl: string;
}

/**
 * Free-lane enrichment (Gemini / web search), always carrying citations.
 * Never presented as provider-verified fact.
 */
export interface ListingEnrichment {
  schools?: ListingEnrichmentSchool[];
  neighborhood?: string;
  walkability?: number;
  commuteNotes?: string;
  sources: ListingEnrichmentSource[];
  /** Set when a RealtyAPI property-detail call was spent here (guards against re-spend). */
  realtyApiDetailFetchedAt?: string;
}

/** One dated observation appended to a listing's price/status trail on each refresh. */
export interface ListingHistoryEntry {
  observedAt: string;
  price: number;
  status: string;
  source: string;
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
  enrichment?: ListingEnrichment;
  history?: ListingHistoryEntry[];
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

export type ListingUserState = "interested" | "notInterested" | "favorite" | "hidden";

export interface ListingUserPreference {
  listingId: string;
  userId: string;
  state: ListingUserState;
  /** Optional free-text note the owner attaches to this listing. */
  note?: string;
  updatedAt: string;
  createdAt: string;
}

export interface CompareQueue {
  userId: string;
  listingIds: string[];
  updatedAt: string;
}

export const MAX_COMPARE_LISTINGS = 4;

/**
 * Canonical document id for the single per-user compare queue stored under the
 * `users/{uid}/compareQueue/{COMPARE_QUEUE_DOC_ID}` subcollection. Modeling the
 * queue as a fixed doc inside a subcollection (rather than a bare document)
 * keeps the Firestore path uniform with `listingPreferences` and matches the
 * roadmap collection map.
 */
export const COMPARE_QUEUE_DOC_ID = "main";

export type IngestRunType = "backfill" | "daily" | "email" | "poll";

export interface IngestRun {
  id: string;
  type: IngestRunType;
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
