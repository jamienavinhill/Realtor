export type ValidationResult<T> = { success: true; data: T } | { success: false; errors: string[] };

export function isNonEmptyString(value: unknown, maxLength = 1000): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function isOptionalString(value: unknown, maxLength = 1000): value is string | undefined {
  return value === undefined || isNonEmptyString(value, maxLength);
}

export function isNumber(value: unknown, min = 0): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min;
}

export function isOptionalNumber(value: unknown, min = 0): value is number | undefined {
  return value === undefined || isNumber(value, min);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function isStringArray(value: unknown, maxItems = 100): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string")
  );
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function fail<T>(errors: string[]): ValidationResult<T> {
  return { success: false, errors };
}

export function ok<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}
