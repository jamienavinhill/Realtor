import type { ListingMedia, ListingProperty, RadiusCenter } from "@/types/listings";
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
    provenance: value.provenance as ListingProperty["provenance"],
    media,
    rawHash: value.rawHash as string,
    dedupeKey: value.dedupeKey as string,
    distanceMiles: value.distanceMiles as number | undefined,
    radiusCenter,
  });
}