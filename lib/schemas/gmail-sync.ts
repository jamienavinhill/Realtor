import type { GmailSync } from "@/types/gmail-sync";
import { fail, isNonEmptyString, isStringArray, isObject, ok, type ValidationResult } from "./common";

/**
 * Runtime validator for the server-only `GmailSync` document. Hand-written to match
 * the repo's existing validator pattern (no zod). The encrypted refresh token is
 * validated only as a bounded string here; integrity is enforced by AES-GCM on decrypt.
 */
export function validateGmailSync(value: unknown): ValidationResult<GmailSync> {
  if (!isObject(value)) {
    return fail(["gmailSync must be an object"]);
  }

  const errors: string[] = [];

  if (!isNonEmptyString(value.uid, 128)) {
    errors.push("uid must be a non-empty string");
  }
  if (value.emailAddress !== undefined && !isNonEmptyString(value.emailAddress, 320)) {
    errors.push("emailAddress must be a string when provided");
  }
  if (value.historyId !== undefined && !isNonEmptyString(value.historyId, 64)) {
    errors.push("historyId must be a string when provided");
  }
  if (value.watchExpiresAt !== undefined && !isNonEmptyString(value.watchExpiresAt, 64)) {
    errors.push("watchExpiresAt must be a string when provided");
  }
  if (value.lastProcessedAt !== undefined && !isNonEmptyString(value.lastProcessedAt, 64)) {
    errors.push("lastProcessedAt must be a string when provided");
  }
  if (!isStringArray(value.platformSelection, 50)) {
    errors.push("platformSelection must be an array of strings");
  }
  // customQuery is an OPTIONAL free-text fragment where "" legitimately means "no
  // fragment". It must accept the empty string — `isOptionalString` rejects "" (requires
  // length > 0), which silently failed the whole gmailSync read path (token, watch, push)
  // whenever an empty customQuery was persisted. Accept any string up to the cap.
  if (
    value.customQuery !== undefined &&
    (typeof value.customQuery !== "string" || value.customQuery.length > 2000)
  ) {
    errors.push("customQuery must be a string of at most 2000 characters when provided");
  }
  // The encrypted token can be long; allow up to 8KB. Empty/undefined is allowed
  // (selection can be persisted before the token is captured).
  if (value.refreshTokenEnc !== undefined && !isNonEmptyString(value.refreshTokenEnc, 8192)) {
    errors.push("refreshTokenEnc must be a non-empty string when provided");
  }
  if (!isNonEmptyString(value.updatedAt, 64)) {
    errors.push("updatedAt must be a non-empty string");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  return ok({
    uid: value.uid as string,
    emailAddress: value.emailAddress as string | undefined,
    historyId: value.historyId as string | undefined,
    watchExpiresAt: value.watchExpiresAt as string | undefined,
    lastProcessedAt: value.lastProcessedAt as string | undefined,
    platformSelection: value.platformSelection as string[],
    customQuery: value.customQuery as string | undefined,
    refreshTokenEnc: value.refreshTokenEnc as string | undefined,
    updatedAt: value.updatedAt as string,
  });
}
