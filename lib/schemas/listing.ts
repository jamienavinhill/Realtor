import type {
  ListingEnrichment,
  ListingEnrichmentSchool,
  ListingEnrichmentSource,
  ListingHistoryEntry,
  ListingMedia,
  ListingProperty,
  ListingProvenance,
  RadiusCenter,
} from "@/types/listings";
import {
  fail,
  isNonEmptyString,
  isNumber,
  isObject,
  isOptionalNumber,
  isOptionalString,
  isStringArray,
  ok,
  type ValidationResult,
} from "./common";

const ENRICHMENT_PROVIDERS = ["gemini", "google-search", "web"] as const;

function validateMediaItem(value: unknown): ValidationResult<ListingMedia> {
  if (!isObject(value)) {
    return fail(["media item must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.url, 2000)) {
    errors.push("media.url must be a non-empty string");
  }
  if (value.type !== undefined && value.type !== "photo" && value.type !== "primary") {
    errors.push("media.type must be photo or primary when provided");
  }
  if (value.sourceUrl !== undefined && !isNonEmptyString(value.sourceUrl, 2000)) {
    errors.push("media.sourceUrl must be a string when provided");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    url: value.url as string,
    type: value.type as ListingMedia["type"],
    sourceUrl: value.sourceUrl as string | undefined,
  });
}

function validateListingProvenance(value: unknown): ValidationResult<ListingProvenance> {
  if (!isObject(value)) {
    return fail(["provenance must be an object"]);
  }

  const errors: string[] = [];
  if (value.providerRunId !== undefined && !isNonEmptyString(value.providerRunId, 128)) {
    errors.push("provenance.providerRunId must be a string when provided");
  }
  if (value.keyAlias !== undefined && !isNonEmptyString(value.keyAlias, 64)) {
    errors.push("provenance.keyAlias must be a string when provided");
  }
  if (value.fetchPage !== undefined && !isNumber(value.fetchPage, 1)) {
    errors.push("provenance.fetchPage must be a number >= 1 when provided");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    providerRunId: value.providerRunId as string | undefined,
    keyAlias: value.keyAlias as string | undefined,
    fetchPage: value.fetchPage as number | undefined,
  });
}

function validateRadiusCenter(value: unknown): ValidationResult<RadiusCenter> {
  if (!isObject(value)) {
    return fail(["radiusCenter must be an object"]);
  }

  const errors: string[] = [];
  if (typeof value.lat !== "number" || !Number.isFinite(value.lat)) {
    errors.push("radiusCenter.lat must be a number");
  }
  if (typeof value.lng !== "number" || !Number.isFinite(value.lng)) {
    errors.push("radiusCenter.lng must be a number");
  }
  if (!isNonEmptyString(value.zipCode, 15)) {
    errors.push("radiusCenter.zipCode must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    lat: value.lat as number,
    lng: value.lng as number,
    zipCode: value.zipCode as string,
  });
}

function validateEnrichmentSource(value: unknown): ValidationResult<ListingEnrichmentSource> {
  if (!isObject(value)) {
    return fail(["enrichment source must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.field, 100)) {
    errors.push("enrichment source.field must be a non-empty string");
  }
  if (!isNonEmptyString(value.url, 2000)) {
    errors.push("enrichment source.url must be a non-empty string");
  }
  if (
    typeof value.provider !== "string" ||
    !ENRICHMENT_PROVIDERS.includes(value.provider as ListingEnrichmentSource["provider"])
  ) {
    errors.push("enrichment source.provider must be gemini, google-search, or web");
  }
  if (!isNonEmptyString(value.fetchedAt, 64)) {
    errors.push("enrichment source.fetchedAt must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    field: value.field as string,
    url: value.url as string,
    provider: value.provider as ListingEnrichmentSource["provider"],
    fetchedAt: value.fetchedAt as string,
  });
}

function validateEnrichmentSchool(value: unknown): ValidationResult<ListingEnrichmentSchool> {
  if (!isObject(value)) {
    return fail(["enrichment school must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.name, 200)) {
    errors.push("enrichment school.name must be a non-empty string");
  }
  if (value.rating !== undefined && !isOptionalNumber(value.rating)) {
    errors.push("enrichment school.rating must be a number >= 0 when provided");
  }
  if (!isNonEmptyString(value.sourceUrl, 2000)) {
    errors.push("enrichment school.sourceUrl must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    name: value.name as string,
    rating: value.rating as number | undefined,
    sourceUrl: value.sourceUrl as string,
  });
}

function validateEnrichment(value: unknown): ValidationResult<ListingEnrichment> {
  if (!isObject(value)) {
    return fail(["enrichment must be an object"]);
  }

  const errors: string[] = [];

  if (value.neighborhood !== undefined && !isOptionalString(value.neighborhood, 5000)) {
    errors.push("enrichment.neighborhood must be a string when provided");
  }
  if (value.walkability !== undefined && !isOptionalNumber(value.walkability)) {
    errors.push("enrichment.walkability must be a number >= 0 when provided");
  }
  if (value.commuteNotes !== undefined && !isOptionalString(value.commuteNotes, 2000)) {
    errors.push("enrichment.commuteNotes must be a string when provided");
  }
  if (
    value.realtyApiDetailFetchedAt !== undefined &&
    !isOptionalString(value.realtyApiDetailFetchedAt, 64)
  ) {
    errors.push("enrichment.realtyApiDetailFetchedAt must be a string when provided");
  }
  if (value.schools !== undefined && !Array.isArray(value.schools)) {
    errors.push("enrichment.schools must be an array when provided");
  }
  if (!Array.isArray(value.sources)) {
    errors.push("enrichment.sources must be an array");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  let schools: ListingEnrichmentSchool[] | undefined;
  if (value.schools !== undefined) {
    schools = [];
    for (const item of value.schools as unknown[]) {
      const schoolResult = validateEnrichmentSchool(item);
      if (!schoolResult.success) {
        return fail(schoolResult.errors.map((error) => `enrichment.schools: ${error}`));
      }
      schools.push(schoolResult.data);
    }
  }

  const sources: ListingEnrichmentSource[] = [];
  for (const item of value.sources as unknown[]) {
    const sourceResult = validateEnrichmentSource(item);
    if (!sourceResult.success) {
      return fail(sourceResult.errors.map((error) => `enrichment.sources: ${error}`));
    }
    sources.push(sourceResult.data);
  }

  return ok({
    schools,
    neighborhood: value.neighborhood as string | undefined,
    walkability: value.walkability as number | undefined,
    commuteNotes: value.commuteNotes as string | undefined,
    sources,
    realtyApiDetailFetchedAt: value.realtyApiDetailFetchedAt as string | undefined,
  });
}

function validateHistoryEntry(value: unknown): ValidationResult<ListingHistoryEntry> {
  if (!isObject(value)) {
    return fail(["history entry must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.observedAt, 64)) {
    errors.push("history.observedAt must be a non-empty string");
  }
  if (!isNumber(value.price)) {
    errors.push("history.price must be a number >= 0");
  }
  if (!isNonEmptyString(value.status, 50)) {
    errors.push("history.status must be a non-empty string");
  }
  if (!isNonEmptyString(value.source, 50)) {
    errors.push("history.source must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    observedAt: value.observedAt as string,
    price: value.price as number,
    status: value.status as string,
    source: value.source as string,
  });
}

export function validateListingProperty(value: unknown): ValidationResult<ListingProperty> {
  if (!isObject(value)) {
    return fail(["listing must be an object"]);
  }

  const errors: string[] = [];

  const requiredStrings: Array<[keyof ListingProperty, number]> = [
    ["id", 128],
    ["title", 200],
    ["address", 200],
    ["city", 100],
    ["state", 5],
    ["zipCode", 15],
    ["propertyType", 50],
    ["status", 50],
    ["imageUrl", 1000],
    ["source", 50],
    ["createdAt", 64],
    ["updatedAt", 64],
    ["sourceProvider", 50],
    ["sourceUrl", 2000],
    ["sourceListingId", 128],
    ["ingestedAt", 64],
    ["rawHash", 128],
    ["dedupeKey", 256],
  ];

  for (const [field, max] of requiredStrings) {
    if (!isNonEmptyString(value[field], max)) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (!isNumber(value.price)) errors.push("price must be a number >= 0");
  if (!isNumber(value.beds)) errors.push("beds must be a number >= 0");
  if (!isNumber(value.baths)) errors.push("baths must be a number >= 0");
  if (!isNumber(value.sqft)) errors.push("sqft must be a number >= 0");

  if (!isObject(value.coordinates)) {
    errors.push("coordinates must be an object");
  } else {
    const lat = value.coordinates.lat;
    const lng = value.coordinates.lng;
    if (typeof lat !== "number" || !Number.isFinite(lat)) {
      errors.push("coordinates.lat must be a number");
    }
    if (typeof lng !== "number" || !Number.isFinite(lng)) {
      errors.push("coordinates.lng must be a number");
    }
  }

  if (!Array.isArray(value.media)) {
    errors.push("media must be an array");
  } else if (value.media.length > 100) {
    errors.push("media must contain at most 100 items");
  }

  if (value.imageUrls !== undefined && !isStringArray(value.imageUrls, 100)) {
    errors.push("imageUrls must be an array of strings when provided");
  }

  if (value.sourceUpdatedAt !== undefined && !isNonEmptyString(value.sourceUpdatedAt, 64)) {
    errors.push("sourceUpdatedAt must be a string when provided");
  }

  if (value.distanceMiles !== undefined && !isOptionalNumber(value.distanceMiles)) {
    errors.push("distanceMiles must be a number >= 0 when provided");
  }

  if (value.yearBuilt !== undefined && !isOptionalNumber(value.yearBuilt)) {
    errors.push("yearBuilt must be a number >= 0 when provided");
  }

  if (value.description !== undefined && !isOptionalString(value.description, 5000)) {
    errors.push("description must be a string when provided");
  }

  if (value.history !== undefined && !Array.isArray(value.history)) {
    errors.push("history must be an array when provided");
  } else if (Array.isArray(value.history) && value.history.length > 500) {
    errors.push("history must contain at most 500 entries");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const media: ListingMedia[] = [];
  for (const item of value.media as unknown[]) {
    const mediaResult = validateMediaItem(item);
    if (!mediaResult.success) {
      return fail(mediaResult.errors.map((error) => `media: ${error}`));
    }
    media.push(mediaResult.data);
  }

  let radiusCenter: RadiusCenter | undefined;
  if (value.radiusCenter !== undefined) {
    const centerResult = validateRadiusCenter(value.radiusCenter);
    if (!centerResult.success) {
      return fail(centerResult.errors);
    }
    radiusCenter = centerResult.data;
  }

  let provenance: ListingProvenance | undefined;
  if (value.provenance !== undefined) {
    const provenanceResult = validateListingProvenance(value.provenance);
    if (!provenanceResult.success) {
      return fail(provenanceResult.errors.map((error) => `provenance: ${error}`));
    }
    provenance = provenanceResult.data;
  }

  let enrichment: ListingEnrichment | undefined;
  if (value.enrichment !== undefined) {
    const enrichmentResult = validateEnrichment(value.enrichment);
    if (!enrichmentResult.success) {
      return fail(enrichmentResult.errors);
    }
    enrichment = enrichmentResult.data;
  }

  let history: ListingHistoryEntry[] | undefined;
  if (value.history !== undefined) {
    history = [];
    for (const item of value.history as unknown[]) {
      const historyResult = validateHistoryEntry(item);
      if (!historyResult.success) {
        return fail(historyResult.errors.map((error) => `history: ${error}`));
      }
      history.push(historyResult.data);
    }
  }

  return ok({
    id: value.id as string,
    title: value.title as string,
    address: value.address as string,
    city: value.city as string,
    state: value.state as string,
    zipCode: value.zipCode as string,
    price: value.price as number,
    beds: value.beds as number,
    baths: value.baths as number,
    sqft: value.sqft as number,
    propertyType: value.propertyType as ListingProperty["propertyType"],
    status: value.status as ListingProperty["status"],
    imageUrl: value.imageUrl as string,
    imageUrls: value.imageUrls as string[] | undefined,
    coordinates: {
      lat: (value.coordinates as { lat: number }).lat,
      lng: (value.coordinates as { lng: number }).lng,
    },
    yearBuilt: value.yearBuilt as number | undefined,
    description: value.description as string | undefined,
    source: value.source as string,
    createdAt: value.createdAt as string,
    updatedAt: value.updatedAt as string,
    sourceProvider: value.sourceProvider as string,
    sourceUrl: value.sourceUrl as string,
    sourceListingId: value.sourceListingId as string,
    sourceUpdatedAt: value.sourceUpdatedAt as string | undefined,
    ingestedAt: value.ingestedAt as string,
    provenance,
    media,
    rawHash: value.rawHash as string,
    dedupeKey: value.dedupeKey as string,
    distanceMiles: value.distanceMiles as number | undefined,
    radiusCenter,
    enrichment,
    history,
  });
}
