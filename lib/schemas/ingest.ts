import type { IngestRun, RadiusCenter } from "@/types/listings";
import {
  fail,
  isNonEmptyString,
  isNumber,
  isObject,
  isOptionalNumber,
  isStringArray,
  ok,
  type ValidationResult,
} from "./common";

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
  if (!isNonEmptyString(value.zipCode, 15)) errors.push("radiusCenter.zipCode must be a string");

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    lat: value.lat as number,
    lng: value.lng as number,
    zipCode: value.zipCode as string,
  });
}

function validateQuotaUsed(value: unknown): ValidationResult<Record<string, number>> {
  if (!isObject(value)) {
    return fail(["quotaUsed must be an object"]);
  }

  for (const [key, count] of Object.entries(value)) {
    if (!isNonEmptyString(key, 64)) {
      return fail([`quotaUsed key ${key} is invalid`]);
    }
    if (!isNumber(count)) {
      return fail([`quotaUsed.${key} must be a number >= 0`]);
    }
  }

  return ok(value as Record<string, number>);
}

export function validateIngestRun(value: unknown): ValidationResult<IngestRun> {
  if (!isObject(value)) {
    return fail(["ingest run must be an object"]);
  }

  const errors: string[] = [];

  if (!isNonEmptyString(value.id, 128)) errors.push("id must be a non-empty string");
  if (value.type !== "backfill" && value.type !== "daily") {
    errors.push("type must be backfill or daily");
  }
  if (
    value.status !== "running" &&
    value.status !== "completed" &&
    value.status !== "failed" &&
    value.status !== "partial"
  ) {
    errors.push("status must be running, completed, failed, or partial");
  }
  if (!isNonEmptyString(value.startedAt, 64)) errors.push("startedAt must be a string");
  if (value.finishedAt !== undefined && !isNonEmptyString(value.finishedAt, 64)) {
    errors.push("finishedAt must be a string when provided");
  }
  if (!isNonEmptyString(value.idempotencyKey, 256)) {
    errors.push("idempotencyKey must be a non-empty string");
  }
  if (value.zipCode !== undefined && !isNonEmptyString(value.zipCode, 15)) {
    errors.push("zipCode must be a string when provided");
  }
  if (value.radiusMiles !== undefined && !isOptionalNumber(value.radiusMiles)) {
    errors.push("radiusMiles must be a number >= 0 when provided");
  }
  if (!isStringArray(value.keyAliasesUsed, 50)) {
    errors.push("keyAliasesUsed must be an array of strings");
  }
  if (!isNumber(value.listingsFetched)) errors.push("listingsFetched must be a number >= 0");
  if (!isNumber(value.listingsUpserted)) errors.push("listingsUpserted must be a number >= 0");
  if (!isNumber(value.listingsSkipped)) errors.push("listingsSkipped must be a number >= 0");
  if (!isNumber(value.alertMatchesCreated)) {
    errors.push("alertMatchesCreated must be a number >= 0");
  }
  if (!isNumber(value.alertMatchesUpdated)) {
    errors.push("alertMatchesUpdated must be a number >= 0");
  }
  if (!isStringArray(value.errors, 100)) {
    errors.push("errors must be an array of strings");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const quotaResult = validateQuotaUsed(value.quotaUsed);
  if (!quotaResult.success) {
    return fail(quotaResult.errors);
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
    type: value.type as IngestRun["type"],
    status: value.status as IngestRun["status"],
    startedAt: value.startedAt as string,
    finishedAt: value.finishedAt as string | undefined,
    idempotencyKey: value.idempotencyKey as string,
    zipCode: value.zipCode as string | undefined,
    radiusMiles: value.radiusMiles as number | undefined,
    radiusCenter,
    keyAliasesUsed: value.keyAliasesUsed as string[],
    quotaUsed: quotaResult.data,
    listingsFetched: value.listingsFetched as number,
    listingsUpserted: value.listingsUpserted as number,
    listingsSkipped: value.listingsSkipped as number,
    alertMatchesCreated: value.alertMatchesCreated as number,
    alertMatchesUpdated: value.alertMatchesUpdated as number,
    errors: value.errors as string[],
  });
}