import { createHash } from "node:crypto";
import type { RealtyApiKeyEntry } from "@/lib/env";
import type {
  ListingMedia,
  ListingProperty,
  ProviderListingProperty,
  RadiusCenter,
} from "@/types/listings";
import { validateListingProperty } from "@/lib/schemas/listing";
import type { MonthlyQuotaStore } from "@/lib/repositories/provider-quota";
import { firestoreMonthlyQuotaStore } from "@/lib/repositories/provider-quota";
import {
  mapHttpStatusToProviderError,
  RealtyApiMalformedPayloadError,
  RealtyApiNoResultsError,
  RealtyApiQuotaExhaustedError,
} from "./errors";
import { QuotaTracker, REALTY_API_MONTHLY_QUOTA_PER_KEY } from "./quota";
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

/** Canonicalize a source URL for dedupe: drop scheme casing, query, fragment, trailing slash. */
function canonicalizeSourceUrl(href: string | undefined): string {
  if (!href) return "";
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return href.trim().toLowerCase();
  }
}

/** Normalize an address line for dedupe: lowercase, collapse whitespace, strip punctuation. */
function normalizeAddressToken(value: string | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

/** Round a coordinate to ~11m precision so trivially-different fixes still collide. */
function coordToken(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toFixed(4);
}

/**
 * Robust composite dedupe key: normalized street address + city/zip + rounded
 * coordinates + canonical source URL. This collapses the same physical listing even
 * when a provider re-issues it under a different listing/property id, or when two
 * sources point at the same home. The provider id is appended last only as a final
 * tiebreaker/fallback when address+coords+url are all absent (so a sparse payload
 * still yields a stable, non-empty key).
 *
 * Format: `realtyapi:addr=<...>|geo=<lat,lng>|url=<host/path>` (or `|id=<id>` fallback).
 * The `realtyapi:` prefix is retained for backward compatibility with the existing
 * single-provider baseline; see WS5 dedupe reconciliation in the roadmap.
 */
export function buildDedupeKey(result: RealtyApiSearchResult): string {
  const addr = normalizeAddressToken(result.address?.line);
  const locality = normalizeAddressToken(
    `${result.address?.city ?? ""} ${result.address?.state_code ?? ""} ${
      result.address?.postal_code ?? ""
    }`,
  );
  const geo = `${coordToken(result.address?.latitude)},${coordToken(result.address?.longitude)}`;
  const url = canonicalizeSourceUrl(result.href);

  const parts: string[] = [];
  if (addr) parts.push(`addr=${addr} ${locality}`.trim());
  if (geo !== ",") parts.push(`geo=${geo}`);
  if (url) parts.push(`url=${url}`);

  if (parts.length === 0) {
    // Sparse payload: fall back to the provider id so the key is still stable.
    const id = result.listing_id || result.property_id || "";
    return `realtyapi:id=${id}`;
  }

  return `realtyapi:${parts.join("|")}`;
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

function parseNumericField(value: number | string | null | undefined, fieldName: string): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  if (typeof value === "string" && value.trim().toLowerCase() === "null") {
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

export function buildListingTitle(
  beds: number,
  baths: number,
  propertyType: string,
  addressLine: string,
): string {
  const typeLabel = mapPropertyType(propertyType);
  if (
    typeLabel === "Land" ||
    !Number.isFinite(beds) ||
    !Number.isFinite(baths) ||
    (beds === 0 && baths === 0)
  ) {
    return `${typeLabel} - ${addressLine}`;
  }

  const bathLabel = Number.isInteger(baths) ? String(baths) : baths.toFixed(1).replace(/\.0$/, "");
  return `${beds}bd ${bathLabel}ba ${typeLabel} - ${addressLine}`;
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
  const dedupeKey = buildDedupeKey(result);
  const distanceMiles = haversineDistanceMiles(
    options.radiusCenter.lat,
    options.radiusCenter.lng,
    result.address.latitude,
    result.address.longitude,
  );

  const beds = parseNumericField(result.beds, "beds");
  const baths = parseNumericField(result.baths, "baths");
  const propertyType = mapPropertyType(result.property_type);

  const listing: ListingProperty = {
    id: sanitizeDocId(result.listing_id || result.property_id),
    title: buildListingTitle(beds, baths, propertyType, result.address.line),
    address: result.address.line,
    city: result.address.city,
    state: result.address.state_code,
    zipCode: result.address.postal_code,
    price: result.list_price,
    beds,
    baths,
    sqft: result.sqft,
    propertyType,
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
    resultCount:
      typeof data.resultCount === "number" ? data.resultCount : data.searchResults.length,
    searchResults: data.searchResults as RealtyApiSearchResult[],
  };
}

export interface RealtyApiClientOptions {
  /**
   * Per-key monthly ceiling. Defaults to the RealtyAPI free-plan limit
   * (250/MONTH/key). Used both by the in-run tracker and as the durable-store
   * reservation limit.
   */
  monthlyLimitPerKey?: number;
  /**
   * Durable monthly budget store. Defaults to the Firestore-backed store so the
   * ceiling survives serverless cold starts. Tests inject an in-memory store to
   * exercise quota behavior with no live Firestore.
   */
  quotaStore?: MonthlyQuotaStore;
  /** Override the fetch implementation (tests inject a stub; no live HTTP). */
  fetchImpl?: typeof fetch;
}

export class RealtyApiClient {
  private readonly quota: QuotaTracker;
  private readonly monthlyLimitPerKey: number;
  private readonly quotaStore: MonthlyQuotaStore;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly keys: RealtyApiKeyEntry[],
    options: RealtyApiClientOptions = {},
  ) {
    this.monthlyLimitPerKey = options.monthlyLimitPerKey ?? REALTY_API_MONTHLY_QUOTA_PER_KEY;
    this.quotaStore = options.quotaStore ?? firestoreMonthlyQuotaStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.quota = new QuotaTracker(keys, this.monthlyLimitPerKey);
  }

  /**
   * Reserve one durable monthly call against the next key with in-run headroom,
   * rotating across keys. Returns the granted key alias/key, or null when every key
   * is exhausted in the durable monthly budget (caller degrades to PARTIAL).
   *
   * The durable reservation is the authority: the in-run tracker only narrows which
   * key we try first so a single run does not pin one alias.
   */
  private async reserveKey(): Promise<RealtyApiKeyEntry | null> {
    for (let attempt = 0; attempt < this.keys.length; attempt += 1) {
      const candidate = this.quota.nextAvailableKey();
      if (!candidate) {
        return null;
      }

      const reservation = await this.quotaStore.reserve(candidate.alias, {
        monthlyLimitPerKey: this.monthlyLimitPerKey,
      });

      if (reservation.granted) {
        this.quota.recordSpend(candidate.alias);
        return candidate;
      }

      // Durable budget says this alias is exhausted this month even though the
      // in-run tracker thought it had headroom (e.g. spent by a prior invocation).
      // Mark it locally exhausted so nextAvailableKey() skips it, then rotate on.
      this.quota.markExhausted(candidate.alias);
      this.quota.rotatePast(candidate.alias);
    }

    return null;
  }

  async fetchPage(
    params: ProviderSearchParams,
    page: number,
    _options?: { providerRunId?: string },
  ): Promise<{ response: RealtyApiSearchResponse; keyAlias: string }> {
    const keyEntry = await this.reserveKey();
    if (!keyEntry) {
      throw new RealtyApiQuotaExhaustedError();
    }

    const url = new URL(`${REALTY_API_BASE_URL}/search/bylocation`);
    url.searchParams.set("location", params.location);
    url.searchParams.set("radius", String(params.radiusMiles));
    url.searchParams.set("page", String(page));

    const response = await this.fetchImpl(url, {
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
    let partial = false;
    const maxPages = options?.maxPages ?? 100;

    const radiusCenter: RadiusCenter = {
      lat: params.centerLat,
      lng: params.centerLng,
      zipCode: params.zipCode,
    };

    while (page <= maxPages) {
      if (!this.quota.hasAvailableKey()) {
        errors.push(
          "Stopped pagination because all RealtyAPI keys reached their monthly quota (~250/MONTH per key).",
        );
        partial = true;
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
        // Quota exhaustion mid-pagination is an expected degraded outcome: keep the
        // listings already gathered and surface a PARTIAL result rather than crashing
        // or silently failing. Any other provider error also stops pagination but is
        // recorded distinctly.
        if (error instanceof RealtyApiQuotaExhaustedError) {
          errors.push(error.message);
          partial = true;
        } else {
          errors.push(error instanceof Error ? error.message : String(error));
          // A first-page hard failure with nothing gathered is a true failure;
          // a later-page failure after some listings is partial.
          partial = listings.length > 0;
        }
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
        partial,
      },
    };
  }
}
