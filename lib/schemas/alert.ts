import type { AlertMatch, PropertyAlert } from "@/types/listings";
import {
  fail,
  isBoolean,
  isNonEmptyString,
  isObject,
  isOptionalNumber,
  isOptionalString,
  ok,
  type ValidationResult,
} from "./common";

function validateAlertCriteria(value: unknown): ValidationResult<PropertyAlert["criteria"]> {
  if (!isObject(value)) {
    return fail(["criteria must be an object"]);
  }

  const errors: string[] = [];
  if (value.minPrice !== undefined && !isOptionalNumber(value.minPrice)) {
    errors.push("criteria.minPrice must be a number >= 0 when provided");
  }
  if (value.maxPrice !== undefined && !isOptionalNumber(value.maxPrice)) {
    errors.push("criteria.maxPrice must be a number >= 0 when provided");
  }
  if (value.city !== undefined && !isOptionalString(value.city, 100)) {
    errors.push("criteria.city must be a string when provided");
  }
  if (value.beds !== undefined && !isOptionalNumber(value.beds)) {
    errors.push("criteria.beds must be a number >= 0 when provided");
  }
  if (value.baths !== undefined && !isOptionalNumber(value.baths)) {
    errors.push("criteria.baths must be a number >= 0 when provided");
  }
  if (value.propertyType !== undefined && !isOptionalString(value.propertyType, 50)) {
    errors.push("criteria.propertyType must be a string when provided");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    minPrice: value.minPrice as number | undefined,
    maxPrice: value.maxPrice as number | undefined,
    city: value.city as string | undefined,
    beds: value.beds as number | undefined,
    baths: value.baths as number | undefined,
    propertyType: value.propertyType as string | undefined,
  });
}

export function validatePropertyAlert(value: unknown): ValidationResult<PropertyAlert> {
  if (!isObject(value)) {
    return fail(["alert must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.id, 128)) errors.push("id must be a non-empty string");
  if (!isNonEmptyString(value.userId, 128)) errors.push("userId must be a non-empty string");
  if (!isNonEmptyString(value.name, 100)) errors.push("name must be a non-empty string");
  if (!isBoolean(value.isActive)) errors.push("isActive must be a boolean");
  if (!isNonEmptyString(value.createdAt, 64)) errors.push("createdAt must be a non-empty string");

  if (errors.length > 0) {
    return fail(errors);
  }

  const criteriaResult = validateAlertCriteria(value.criteria);
  if (!criteriaResult.success) {
    return fail(criteriaResult.errors);
  }

  return ok({
    id: value.id as string,
    userId: value.userId as string,
    name: value.name as string,
    criteria: criteriaResult.data,
    isActive: value.isActive as boolean,
    createdAt: value.createdAt as string,
  });
}

export function validateAlertMatch(value: unknown): ValidationResult<AlertMatch> {
  if (!isObject(value)) {
    return fail(["alert match must be an object"]);
  }

  const errors: string[] = [];
  const required: Array<[keyof AlertMatch, number]> = [
    ["id", 256],
    ["alertId", 128],
    ["listingId", 128],
    ["userId", 128],
    ["matchReason", 500],
    ["firstSeenAt", 64],
    ["lastSeenAt", 64],
  ];

  for (const [field, max] of required) {
    if (!isNonEmptyString(value[field], max)) {
      errors.push(`${field} must be a non-empty string`);
    }
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    id: value.id as string,
    alertId: value.alertId as string,
    listingId: value.listingId as string,
    userId: value.userId as string,
    matchReason: value.matchReason as string,
    firstSeenAt: value.firstSeenAt as string,
    lastSeenAt: value.lastSeenAt as string,
  });
}
