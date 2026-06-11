import type {
  AccountInvite,
  AccountInviteStatus,
  AccountMember,
  MemberRole,
} from "@/types/sharing";
import { ACCOUNT_INVITE_STATUSES, MEMBER_ROLES } from "@/types/sharing";
import { fail, isNonEmptyString, isObject, ok, type ValidationResult } from "./common";

const MAX_EMAIL_LENGTH = 320;
const MAX_UID_LENGTH = 128;
const MAX_TOKEN_LENGTH = 256;

/**
 * Minimal, deliberately-loose email shape check. We are not trying to fully validate
 * RFC 5322 — just reject obviously-malformed values before they reach Firestore. A
 * stricter address is enforced by Google sign-in at acceptance time.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite tokens are URL-safe base64 (base64url): letters, digits, `-`, `_`. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && MEMBER_ROLES.includes(value as MemberRole);
}

export function isAccountInviteStatus(value: unknown): value is AccountInviteStatus {
  return (
    typeof value === "string" && ACCOUNT_INVITE_STATUSES.includes(value as AccountInviteStatus)
  );
}

function isValidEmail(value: unknown): value is string {
  return isNonEmptyString(value, MAX_EMAIL_LENGTH) && EMAIL_PATTERN.test(value);
}

/** Validate an `AccountMember` document (path: `accounts/{ownerUid}/members/{memberUid}`). */
export function validateAccountMember(value: unknown): ValidationResult<AccountMember> {
  if (!isObject(value)) {
    return fail(["account member must be an object"]);
  }

  const errors: string[] = [];
  if (!isNonEmptyString(value.memberUid, MAX_UID_LENGTH)) {
    errors.push("memberUid must be a non-empty string");
  }
  if (!isValidEmail(value.email)) {
    errors.push("email must be a valid email address");
  }
  if (!isMemberRole(value.role)) {
    errors.push("role must be 'viewer' or 'editor'");
  }
  if (!isNonEmptyString(value.invitedAt, 64)) {
    errors.push("invitedAt must be a non-empty string");
  }
  if (value.acceptedAt !== undefined && !isNonEmptyString(value.acceptedAt, 64)) {
    errors.push("acceptedAt must be a string when provided");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const member: AccountMember = {
    memberUid: value.memberUid as string,
    email: (value.email as string).toLowerCase(),
    role: value.role as MemberRole,
    invitedAt: value.invitedAt as string,
  };
  if (typeof value.acceptedAt === "string") {
    member.acceptedAt = value.acceptedAt;
  }

  return ok(member);
}

/** Validate an `AccountInvite` document (path: `invites/{token}`). */
export function validateAccountInvite(value: unknown): ValidationResult<AccountInvite> {
  if (!isObject(value)) {
    return fail(["account invite must be an object"]);
  }

  const errors: string[] = [];
  if (
    !isNonEmptyString(value.token, MAX_TOKEN_LENGTH) ||
    !TOKEN_PATTERN.test(value.token as string)
  ) {
    errors.push("token must be an unguessable url-safe string");
  }
  if (!isNonEmptyString(value.ownerUid, MAX_UID_LENGTH)) {
    errors.push("ownerUid must be a non-empty string");
  }
  if (!isValidEmail(value.email)) {
    errors.push("email must be a valid email address");
  }
  if (!isMemberRole(value.role)) {
    errors.push("role must be 'viewer' or 'editor'");
  }
  if (!isAccountInviteStatus(value.status)) {
    errors.push("status must be 'pending', 'accepted', or 'revoked'");
  }
  if (!isNonEmptyString(value.createdAt, 64)) {
    errors.push("createdAt must be a non-empty string");
  }
  if (value.acceptedAt !== undefined && !isNonEmptyString(value.acceptedAt, 64)) {
    errors.push("acceptedAt must be a string when provided");
  }
  if (value.acceptedByUid !== undefined && !isNonEmptyString(value.acceptedByUid, MAX_UID_LENGTH)) {
    errors.push("acceptedByUid must be a string when provided");
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  const invite: AccountInvite = {
    token: value.token as string,
    ownerUid: value.ownerUid as string,
    email: (value.email as string).toLowerCase(),
    role: value.role as MemberRole,
    status: value.status as AccountInviteStatus,
    createdAt: value.createdAt as string,
  };
  if (typeof value.acceptedAt === "string") {
    invite.acceptedAt = value.acceptedAt;
  }
  if (typeof value.acceptedByUid === "string") {
    invite.acceptedByUid = value.acceptedByUid;
  }

  return ok(invite);
}
