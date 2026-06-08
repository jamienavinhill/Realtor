import { createHash } from "node:crypto";
import type { RealtyApiKeyEntry } from "@/lib/env";
import type {
  ListingMedia,
  ListingProperty,
  ProviderListingProperty,
  RadiusCenter,
} from "@/types/listings";
import { validateListingProperty } from "@/lib/schemas/listing";
import {
  mapHttpStatusToProviderError,
  RealtyApiMalformedPayloadError,
  RealtyApiNoResultsError,
  RealtyApiQuotaExhaustedError,
} from "./errors";
import { DEFAULT_DAILY_QUOTA_PER_KEY, QuotaTracker } from "./quota";
import type {
  ProviderFetchResult,
  ProviderSearchParams,
  RealtyApiSearchResponse,
  RealtyApiSearchResult,
} from "./types";

const REALTY_API_BASE_URL = "https://realtor.realtyapi.io";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((earthRadiusMiles * c).toFixed(2));
}

export function hashRawPayload(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function sanitizeDocId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function buildMedia(result: RealtyApiSearchResult): ListingMedia[] {
  const media: ListingMedia[] = [];
  const seen = new Set<string>();

  if (result.primary_photo) {
    media.push({ url: result.primary_photo, type: "primary", sourceUrl: result.href });
    seen.add(result.primary_photo);
  }

  for (const photo of result.photos ?? []) {
    if (!photo || seen.has(photo)) continue;
    media.push({ url: photo, type: "photo", sourceUrl: result.href });
    seen.add(photo);
  }

  return media;
}

function mapPropertyType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("condo")) return "Condo";
  if (normalized.includes("town")) return "Townhouse";
  if (normalized.includes("multi")) return "Multi-Family";
  if (normalized.includes("land")) return "Land";
  if (normalized.includes("single")) return "Single Family";
  return value;
}

function parseNumericField(
  value: number | string | null | undefined,
  fieldName: string,
): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${fieldName} must be a number >= 0`);
    }
    return value;
  }
  const cleaned = String(value).trim().replace(/\+$/, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be a number >= 0`);
  }
  return parsed;
}

function mapStatus(value: string): ListingProperty["status"] {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("pending")) return "Pending";
  if (normalized.includes("sold")) return "Sold";
  return "Active";
}

export function normalizeRealtyApiListing(
  result: RealtyApiSearchResult,
  options: {
    radiusCenter: RadiusCenter;
    ingestedAt?: string;
    keyAlias?: string;
    providerRunId?: string;
    fetchPage?: number;
  },
): ProviderListingProperty {
  const ingestedAt = options.ingestedAt ?? new Date().toISOString();
  const media = buildMedia(result);
  const imageUrls = media.map((item) => item.url);
  const imageUrl = media.find((item) => item.type === "primary")?.url ?? imageUrls[0] ?? "";
  const dedupeKey = `realtyapi:${result.listing_id || result.property_id}`;
  const distanceMiles = haversineDistanceMiles(
    options.radiusCenter.lat,
    options.radiusCenter.lng,
    result.address.latitude,
    result.address.longitude,
  );

  const listing: ListingProperty = {
    id: sanitizeDocId(result.listing_id || result.property_id),
    title: `${result.beds}bd ${result.baths}ba ${mapPropertyType(result.property_type)} - ${result.address.line}`,
    address: result.address.line,
    city: result.address.city,
    state: result.address.state_code,
    zipCode: result.address.postal_code,
    price: result.list_price,
    beds: parseNumericField(result.beds, "beds"),
    baths: parseNumericField(result.baths, "baths"),
    sqft: result.sqft,
    propertyType: mapPropertyType(result.property_type),
    status: mapStatus(result.status),
    imageUrl,
    imageUrls,
    coordinates: {
      lat: result.address.latitude,
      lng: result.address.longitude,
    },
    source: "realtyapi",
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
    sourceProvider: "realtyapi",
    sourceUrl: result.href,
    sourceListingId: result.listing_id || result.property_id,
    sourceUpdatedAt: result.list_date,
    ingestedAt,
    provenance: {
      keyAlias: options.keyAlias,
      providerRunId: options.providerRunId,
      fetchPage: options.fetchPage,
    },
    media,
    rawHash: hashRawPayload(result),
    dedupeKey,
    distanceMiles,
    radiusCenter: options.radiusCenter,
  };

  const validation = validateListingProperty(listing);
  if (!validation.success) {
    throw new RealtyApiMalformedPayloadError(
      `Normalized listing failed validation: ${validation.errors.join("; ")}`,
    );
  }

  return validation.data as ProviderListingProperty;
}

function validateSearchResponse(payload: unknown): RealtyApiSearchResponse {
  if (!payload || typeof payload !== "object") {
    throw new RealtyApiMalformedPayloadError("Search response is not an object");
  }

  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.searchResults)) {
    throw new RealtyApiMalformedPayloadError("searchResults must be an array");
  }

  return {
    total: typeof data.total === "number" ? data.total : 0,
    nextPage: Boolean(data.nextPage),
    resultCount: typeof data.resultCount === "number" ? data.resultCount : data.searchResults.length,
    searchResults: data.searchResults as RealtyApiSearchResult[],
  };
}

export class RealtyApiClient {
  private readonly quota: QuotaTracker;

  constructor(
    private readonly keys: RealtyApiKeyEntry[],
    private readonly dailyQuotaPerKey = DEFAULT_DAILY_QUOTA_PER_KEY,
  ) {
    this.quota = new QuotaTracker(keys, dailyQuotaPerKey);
  }

  async fetchPage(
    params: ProviderSearchParams,
    page: number,
    _options?: { providerRunId?: string },
  ): Promise<{ response: RealtyApiSearchResponse; keyAlias: string }> {
    const keyEntry = this.quota.nextAvailableKey();
    if (!keyEntry) {
      throw new RealtyApiQuotaExhaustedError();
    }

    this.quota.reserve(keyEntry.alias);

    const url = new URL(`${REALTY_API_BASE_URL}/search/bylocation`);
    url.searchParams.set("location", params.location);
    url.searchParams.set("radius", String(params.radiusMiles));
    url.searchParams.set("page", String(page));

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-realtyapi-key": keyEntry.key,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw mapHttpStatusToProviderError(response.status, body);
    }

    const payload = await response.json();
    const parsed = validateSearchResponse(payload);

    if (page === 1 && parsed.searchResults.length === 0 && parsed.total === 0) {
      throw new RealtyApiNoResultsError();
    }

    return {
      response: parsed,
      keyAlias: keyEntry.alias,
    };
  }

  async fetchAllActiveListings(
    params: ProviderSearchParams,
    options?: { providerRunId?: string; maxPages?: number },
  ): Promise<ProviderFetchResult> {
    const listings: ProviderListingProperty[] = [];
    const seenDedupeKeys = new Set<string>();
    const errors: string[] = [];
    let page = 1;
    let pagesFetched = 0;
    const maxPages = options?.maxPages ?? 100;

    const radiusCenter: RadiusCenter = {
      lat: params.centerLat,
      lng: params.centerLng,
      zipCode: params.zipCode,
    };

    while (page <= maxPages) {
      if (!this.quota.hasAvailableKey()) {
        errors.push("Stopped pagination because all RealtyAPI keys reached daily quota.");
        break;
      }

      try {
        const { response, keyAlias } = await this.fetchPage(params, page, options);
        pagesFetched += 1;

        for (const result of response.searchResults) {
          if (!result.listing_id && !result.property_id) {
            errors.push("Skipped search result with no listing_id or property_id");
            continue;
          }

          try {
            const listing = normalizeRealtyApiListing(result, {
              radiusCenter,
              keyAlias,
              providerRunId: options?.providerRunId,
              fetchPage: page,
            });

            if (seenDedupeKeys.has(listing.dedupeKey)) {
              continue;
            }

            seenDedupeKeys.add(listing.dedupeKey);
            listings.push(listing);
          } catch (error) {
            errors.push(
              error instanceof Error
                ? `Failed to normalize listing ${result.listing_id}: ${error.message}`
                : `Failed to normalize listing ${result.listing_id}`,
            );
          }
        }

        if (!response.nextPage) {
          break;
        }

        page += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        break;
      }
    }

    return {
      listings,
      stats: {
        pagesFetched,
        listingsFetched: listings.length,
        keyAliasesUsed: this.quota.getUsedAliases(),
        quotaUsed: this.quota.getUsage(),
        errors,
      },
    };
  }
}