import type { ProviderQuotaMonth } from "@/types/provider-quota";
import { fail, isNonEmptyString, isNumber, isObject, ok, type ValidationResult } from "./common";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function validatePerKey(value: unknown): ValidationResult<Record<string, number>> {
  if (!isObject(value)) {
    return fail(["perKey must be an object"]);
  }

  for (const [alias, count] of Object.entries(value)) {
    if (!isNonEmptyString(alias, 64)) {
      return fail([`perKey key ${alias} is invalid`]);
    }
    if (!isNumber(count)) {
      return fail([`perKey.${alias} must be a number >= 0`]);
    }
  }

  return ok(value as Record<string, number>);
}

export function validateProviderQuotaMonth(value: unknown): ValidationResult<ProviderQuotaMonth> {
  if (!isObject(value)) {
    return fail(["provider quota month must be an object"]);
  }

  const errors: string[] = [];

  if (typeof value.month !== "string" || !MONTH_PATTERN.test(value.month)) {
    errors.push('month must be a "YYYY-MM" string');
  }
  if (!isNumber(value.monthlyLimitPerKey) || value.monthlyLimitPerKey <= 0) {
    errors.push("monthlyLimitPerKey must be a number > 0");
  }
  if (!isNumber(value.totalSpent)) {
    errors.push("totalSpent must be a number >= 0");
  }
  if (!isNonEmptyString(value.updatedAt, 64)) {
    errors.push("updatedAt must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const perKeyResult = validatePerKey(value.perKey);
  if (!perKeyResult.success) {
    return fail(perKeyResult.errors);
  }

  return ok({
    month: value.month as string,
    perKey: perKeyResult.data,
    monthlyLimitPerKey: value.monthlyLimitPerKey as number,
    totalSpent: value.totalSpent as number,
    updatedAt: value.updatedAt as string,
  });
}
