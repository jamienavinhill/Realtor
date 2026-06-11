import { randomBytes } from "node:crypto";
import type { AccountInvite, AccountMember, MemberRole } from "@/types/sharing";
import { INVITE_TOKEN_BYTES, MEMBER_ROLE_ORDER } from "@/types/sharing";
import { validateAccountInvite, validateAccountMember } from "@/lib/schemas/sharing";
import { getAdminFirestore } from "@/lib/firebase-admin";

/**
 * Server-only repository for account sharing (WS18). All trust-critical writes — minting
 * an invite token, accepting an invite, changing a role, revoking — go through the Admin
 * SDK here so they cannot be spoofed from a browser. `config/firebase/firestore.rules`
 * additionally allows a constrained client path (owner reads members; invitee accepts by
 * token), but the canonical writer is this repository, invoked from the `/api/account/*`
 * routes after the caller's Firebase ID token is verified.
 *
 * Data model:
 * - `accounts/{ownerUid}/members/{memberUid}` holds `AccountMember`.
 * - `invites/{token}` holds `AccountInvite` (token is the document id).
 */

const INVITES_COLLECTION = "invites";

function membersCollection(ownerUid: string) {
  return getAdminFirestore().collection("accounts").doc(ownerUid).collection("members");
}

function memberRef(ownerUid: string, memberUid: string) {
  return membersCollection(ownerUid).doc(memberUid);
}

function inviteRef(token: string) {
  return getAdminFirestore().collection(INVITES_COLLECTION).doc(token);
}

/** Generate an unguessable, URL-safe (base64url) invite token. Never logged. */
function generateInviteToken(): string {
  return randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
}

/** True when `role` is at or below `ceiling` in the role hierarchy (viewer < editor). */
export function roleAtOrBelow(role: MemberRole, ceiling: MemberRole): boolean {
  return MEMBER_ROLE_ORDER[role] <= MEMBER_ROLE_ORDER[ceiling];
}

export interface CreateInviteInput {
  ownerUid: string;
  email: string;
  role: MemberRole;
}

export interface CreatedInvite {
  invite: AccountInvite;
}

/**
 * Create a pending invite for `email` with `role`, owned by `ownerUid`. Returns the
 * stored invite (including its token) so the route can build an accept link. The token
 * is the capability and must be transmitted only over the accept link / optional email —
 * never logged.
 */
export async function createInvite(input: CreateInviteInput): Promise<CreatedInvite> {
  const token = generateInviteToken();
  const now = new Date().toISOString();

  const candidate: AccountInvite = {
    token,
    ownerUid: input.ownerUid,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    status: "pending",
    createdAt: now,
  };

  const validation = validateAccountInvite(candidate);
  if (!validation.success) {
    throw new Error(`Invalid invite: ${validation.errors.join("; ")}`);
  }

  await inviteRef(token).set(validation.data);
  return { invite: validation.data };
}

/** Read an invite by token, or null when absent/malformed. */
export async function getInvite(token: string): Promise<AccountInvite | null> {
  const snap = await inviteRef(token).get();
  if (!snap.exists) {
    return null;
  }
  const validation = validateAccountInvite({ token, ...snap.data() });
  return validation.success ? validation.data : null;
}

export interface AcceptInviteInput {
  token: string;
  /** The accepting user's verified uid (from their Firebase ID token). */
  memberUid: string;
  /** The accepting user's verified email (from their Firebase ID token). */
  memberEmail: string;
}

export type AcceptInviteResult =
  | { ok: true; member: AccountMember; ownerUid: string }
  | { ok: false; reason: "not-found" | "revoked" | "already-accepted" | "email-mismatch" | "self" };

/**
 * Accept a pending invite. Trust-critical, so it runs in a transaction: the invite must
 * still be `pending`, the accepting user's verified email must match the invited email
 * (case-insensitive), and the user cannot join their own workspace. On success it writes
 * the membership and flips the invite to `accepted`.
 */
export async function acceptInvite(input: AcceptInviteInput): Promise<AcceptInviteResult> {
  const db = getAdminFirestore();
  const invRef = inviteRef(input.token);
  const memberEmail = input.memberEmail.trim().toLowerCase();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(invRef);
    if (!snap.exists) {
      return { ok: false, reason: "not-found" } as const;
    }
    const validation = validateAccountInvite({ token: input.token, ...snap.data() });
    if (!validation.success) {
      return { ok: false, reason: "not-found" } as const;
    }
    const invite = validation.data;

    if (invite.status === "revoked") {
      return { ok: false, reason: "revoked" } as const;
    }
    if (invite.status === "accepted") {
      return { ok: false, reason: "already-accepted" } as const;
    }
    if (invite.email !== memberEmail) {
      return { ok: false, reason: "email-mismatch" } as const;
    }
    if (invite.ownerUid === input.memberUid) {
      return { ok: false, reason: "self" } as const;
    }

    const now = new Date().toISOString();
    const memberCandidate: AccountMember = {
      memberUid: input.memberUid,
      email: memberEmail,
      role: invite.role,
      invitedAt: invite.createdAt,
      acceptedAt: now,
    };
    const memberValidation = validateAccountMember(memberCandidate);
    if (!memberValidation.success) {
      throw new Error(`Invalid member: ${memberValidation.errors.join("; ")}`);
    }

    tx.set(memberRef(invite.ownerUid, input.memberUid), memberValidation.data);
    tx.set(
      invRef,
      { status: "accepted", acceptedAt: now, acceptedByUid: input.memberUid },
      { merge: true },
    );

    return { ok: true, member: memberValidation.data, ownerUid: invite.ownerUid } as const;
  });
}

/** List all accepted members of an owner's workspace. */
export async function listMembers(ownerUid: string): Promise<AccountMember[]> {
  const snapshot = await membersCollection(ownerUid).get();
  const members: AccountMember[] = [];
  for (const doc of snapshot.docs) {
    const validation = validateAccountMember({ memberUid: doc.id, ...doc.data() });
    if (validation.success) {
      members.push(validation.data);
    }
  }
  return members;
}

/** Resolve a single member record (or null) for membership/role checks. */
export async function getMember(
  ownerUid: string,
  memberUid: string,
): Promise<AccountMember | null> {
  const snap = await memberRef(ownerUid, memberUid).get();
  if (!snap.exists) {
    return null;
  }
  const validation = validateAccountMember({ memberUid, ...snap.data() });
  return validation.success ? validation.data : null;
}

/** List the pending invites an owner still has outstanding (for the share UI). */
export async function listPendingInvites(ownerUid: string): Promise<AccountInvite[]> {
  const snapshot = await getAdminFirestore()
    .collection(INVITES_COLLECTION)
    .where("ownerUid", "==", ownerUid)
    .where("status", "==", "pending")
    .get();
  const invites: AccountInvite[] = [];
  for (const doc of snapshot.docs) {
    const validation = validateAccountInvite({ token: doc.id, ...doc.data() });
    if (validation.success) {
      invites.push(validation.data);
    }
  }
  return invites;
}

/** Change an existing member's role (owner/editor action; route enforces the caller gate). */
export async function changeMemberRole(
  ownerUid: string,
  memberUid: string,
  role: MemberRole,
): Promise<AccountMember> {
  const ref = memberRef(ownerUid, memberUid);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("Member not found");
  }
  const validation = validateAccountMember({ memberUid, ...snap.data(), role });
  if (!validation.success) {
    throw new Error(`Invalid member: ${validation.errors.join("; ")}`);
  }
  await ref.set({ role }, { merge: true });
  return validation.data;
}

/** Remove a member from the owner's workspace. */
export async function removeMember(ownerUid: string, memberUid: string): Promise<void> {
  await memberRef(ownerUid, memberUid).delete();
}

/** Revoke a still-pending invite by token (owner action). Accepted invites are unaffected. */
export async function revokeInvite(ownerUid: string, token: string): Promise<boolean> {
  const ref = inviteRef(token);
  const snap = await ref.get();
  if (!snap.exists) {
    return false;
  }
  const data = snap.data() as Partial<AccountInvite>;
  if (data.ownerUid !== ownerUid) {
    // Not this owner's invite — refuse silently (the route returns 404/403).
    return false;
  }
  if (data.status === "pending") {
    await ref.set({ status: "revoked" }, { merge: true });
  }
  return true;
}

/**
 * Resolve which workspaces a user can act in: their own (always) plus every owner who
 * has accepted them as a member, with the granted role. Drives the dashboard workspace
 * switcher. Uses a collectionGroup query over `members` filtered to this uid.
 */
export interface WorkspaceMembership {
  ownerUid: string;
  role: MemberRole;
  email: string;
}

export async function listWorkspacesForUser(memberUid: string): Promise<WorkspaceMembership[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collectionGroup("members").where("memberUid", "==", memberUid).get();

  const workspaces: WorkspaceMembership[] = [];
  for (const doc of snapshot.docs) {
    const validation = validateAccountMember({ memberUid, ...doc.data() });
    if (!validation.success) {
      continue;
    }
    // The parent of the `members` collection is `accounts/{ownerUid}`.
    const ownerUid = doc.ref.parent.parent?.id;
    if (!ownerUid) {
      continue;
    }
    workspaces.push({ ownerUid, role: validation.data.role, email: validation.data.email });
  }
  return workspaces;
}
