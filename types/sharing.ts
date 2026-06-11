/**
 * Account sharing & collaboration contracts (WS18).
 *
 * An "account" is owned by a single owner `uid` — the owner's existing data IS the
 * shared workspace. The owner can invite other people into that workspace by email and
 * pick a role:
 *
 * - **viewer** — read-only across the owner's listings, alerts, matches, preferences,
 *   and profile.
 * - **editor** — everything the owner can do on the workspace data EXCEPT delete the
 *   owner's account or remove/demote the owner. Editors may add/remove other members at
 *   or below the editor role.
 *
 * Membership lives at `accounts/{ownerUid}/members/{memberUid}` and pending email
 * invitations live at `invites/{token}` keyed by an unguessable token. Both the server
 * (Admin SDK) and `config/firebase/firestore.rules` resolve membership the same way.
 *
 * This is deliberately a simple invite + role model, NOT an abstract RBAC system.
 */

/** The two collaboration roles. `editor` is a strict superset of `viewer`. */
export type MemberRole = "viewer" | "editor";

/** Lifecycle of a pending email invite. */
export type AccountInviteStatus = "pending" | "accepted" | "revoked";

/**
 * A person who has accepted membership in an owner's workspace. Stored at
 * `accounts/{ownerUid}/members/{memberUid}`; the document id is the member's uid.
 */
export interface AccountMember {
  /** The member's Firebase uid (also the document id under the members subcollection). */
  memberUid: string;
  /** The member's email at invite time (for display in the member list). */
  email: string;
  role: MemberRole;
  /** ISO-8601 timestamp the invite that produced this membership was created. */
  invitedAt: string;
  /** ISO-8601 timestamp the invitee accepted; set when the membership was written. */
  acceptedAt?: string;
}

/**
 * A pending email invitation. Stored at `invites/{token}` where `token` is an
 * unguessable, URL-safe random string. The token is the capability: whoever holds it
 * (and signs in) can accept the invite for the named email.
 */
export interface AccountInvite {
  /** Unguessable URL-safe invite token (also the document id under `invites`). */
  token: string;
  /** The uid of the workspace owner who created the invite. */
  ownerUid: string;
  /** Lower-cased email the invite was addressed to. */
  email: string;
  role: MemberRole;
  status: AccountInviteStatus;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 timestamp the invite was accepted (status -> "accepted"). */
  acceptedAt?: string;
  /** The uid of the user who accepted the invite. */
  acceptedByUid?: string;
}

/** Roles ordered from least to most privileged, for "at or below" comparisons. */
export const MEMBER_ROLE_ORDER: Record<MemberRole, number> = {
  viewer: 0,
  editor: 1,
};

/** All valid member roles. */
export const MEMBER_ROLES: MemberRole[] = ["viewer", "editor"];

/** All valid invite statuses. */
export const ACCOUNT_INVITE_STATUSES: AccountInviteStatus[] = ["pending", "accepted", "revoked"];

/**
 * Byte length of the random invite token before base64url encoding. 32 bytes ->
 * 43 url-safe characters of ~256 bits of entropy: unguessable, never logged.
 */
export const INVITE_TOKEN_BYTES = 32;
