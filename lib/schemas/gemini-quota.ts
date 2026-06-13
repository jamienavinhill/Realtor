import type { GeminiQuotaDay } from "@/types/gemini-quota";
import { fail, isNonEmptyString, isNumber, isObject, ok, type ValidationResult } from "./common";

const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Counts are non-negative integers (isNumber already enforces >= 0). */
function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

export function validateGeminiQuotaDay(value: unknown): ValidationResult<GeminiQuotaDay> {
  if (!isObject(value)) {
    return fail(["gemini quota day must be an object"]);
  }

  const errors: string[] = [];

  if (typeof value.day !== "string" || !DAY_PATTERN.test(value.day)) {
    errors.push('day must be a "YYYY-MM-DD" string');
  }
  if (!isCount(value.dailyLimit) || (value.dailyLimit as number) <= 0) {
    errors.push("dailyLimit must be a positive integer");
  }
  if (!isCount(value.count)) {
    errors.push("count must be a non-negative integer");
  }
  if (!isNonEmptyString(value.updatedAt, 64)) {
    errors.push("updatedAt must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const dailyLimit = value.dailyLimit as number;
  const count = value.count as number;
  // A count above the ceiling means the reserve gate was bypassed/corrupted.
  if (count > dailyLimit) {
    return fail([`count (${count}) exceeds dailyLimit (${dailyLimit})`]);
  }

  return ok({
    day: value.day as string,
    count,
    dailyLimit,
    updatedAt: value.updatedAt as string,
  });
}
