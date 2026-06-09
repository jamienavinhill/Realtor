import type { ProviderQuotaMonth } from "@/types/provider-quota";
import { fail, isNonEmptyString, isNumber, isObject, ok, type ValidationResult } from "./common";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Call counts are non-negative integers (a fractional or NaN count is corrupt accounting). */
function isCount(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

function validatePerKey(
  value: unknown,
  monthlyLimitPerKey: number,
): ValidationResult<Record<string, number>> {
  if (!isObject(value)) {
    return fail(["perKey must be an object"]);
  }

  for (const [alias, count] of Object.entries(value)) {
    if (!isNonEmptyString(alias, 64)) {
      return fail([`perKey key ${alias} is invalid`]);
    }
    if (!isCount(count)) {
      return fail([`perKey.${alias} must be a non-negative integer`]);
    }
    // The per-key count must never exceed the monthly ceiling — a doc that records
    // more than the budget allows means the reserve gate was bypassed/corrupted.
    if (count > monthlyLimitPerKey) {
      return fail([
        `perKey.${alias} (${count}) exceeds monthlyLimitPerKey (${monthlyLimitPerKey})`,
      ]);
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
  if (!isCount(value.monthlyLimitPerKey) || (value.monthlyLimitPerKey as number) <= 0) {
    errors.push("monthlyLimitPerKey must be a positive integer");
  }
  if (!isCount(value.totalSpent)) {
    errors.push("totalSpent must be a non-negative integer");
  }
  if (!isNonEmptyString(value.updatedAt, 64)) {
    errors.push("updatedAt must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const monthlyLimitPerKey = value.monthlyLimitPerKey as number;
  const perKeyResult = validatePerKey(value.perKey, monthlyLimitPerKey);
  if (!perKeyResult.success) {
    return fail(perKeyResult.errors);
  }

  // totalSpent is a derived field; it must equal the sum of per-key spend or the
  // document is internally inconsistent and cannot be trusted as the budget authority.
  const computedTotal = Object.values(perKeyResult.data).reduce((sum, count) => sum + count, 0);
  if ((value.totalSpent as number) !== computedTotal) {
    return fail([
      `totalSpent (${value.totalSpent}) must equal the sum of perKey (${computedTotal})`,
    ]);
  }

  return ok({
    month: value.month as string,
    perKey: perKeyResult.data,
    monthlyLimitPerKey,
    totalSpent: value.totalSpent as number,
    updatedAt: value.updatedAt as string,
  });
}
