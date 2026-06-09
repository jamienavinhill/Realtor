import type { CompareQueue, ListingUserPreference, ListingUserState } from "@/types/listings";
import { MAX_COMPARE_LISTINGS } from "@/types/listings";
import {
  fail,
  isNonEmptyString,
  isObject,
  isStringArray,
  ok,
  type ValidationResult,
} from "./common";

const VALID_STATES: ListingUserState[] = ["interested", "notInterested", "favorite", "hidden"];

function isListingUserState(value: unknown): value is ListingUserState {
  return typeof value === "string" && VALID_STATES.includes(value as ListingUserState);
}

export function validateListingUserPreference(
  value: unknown,
): ValidationResult<ListingUserPreference> {
  if (!isObject(value)) {
    return fail(["listing preference must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.listingId, 128)) errors.push("listingId must be a non-empty string");
  if (!isNonEmptyString(value.userId, 128)) errors.push("userId must be a non-empty string");
  if (!isListingUserState(value.state)) errors.push("state must be a valid ListingUserState");
  if (!isNonEmptyString(value.updatedAt, 64)) errors.push("updatedAt must be a non-empty string");
  if (!isNonEmptyString(value.createdAt, 64)) errors.push("createdAt must be a non-empty string");

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    listingId: value.listingId as string,
    userId: value.userId as string,
    state: value.state as ListingUserState,
    updatedAt: value.updatedAt as string,
    createdAt: value.createdAt as string,
  });
}

export function validateCompareQueue(value: unknown): ValidationResult<CompareQueue> {
  if (!isObject(value)) {
    return fail(["compare queue must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.userId, 128)) errors.push("userId must be a non-empty string");
  if (!isNonEmptyString(value.updatedAt, 64)) errors.push("updatedAt must be a non-empty string");
  if (!isStringArray(value.listingIds, MAX_COMPARE_LISTINGS)) {
    errors.push(`listingIds must be a string array with at most ${MAX_COMPARE_LISTINGS} items`);
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const listingIds = value.listingIds as string[];
  for (const id of listingIds) {
    if (!isNonEmptyString(id, 128)) {
      return fail(["each listingId must be a non-empty string"]);
    }
  }

  return ok({
    userId: value.userId as string,
    listingIds,
    updatedAt: value.updatedAt as string,
  });
}
