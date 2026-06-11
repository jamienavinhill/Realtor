import type { NextRequest } from "next/server";
import type { MemberRole } from "@/types/sharing";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { getMember } from "@/lib/repositories/account-members";
import { getServerEnv } from "@/lib/env";
import { GmailClient, refreshTokenAccessProvider } from "@/lib/gmail/client";
import { getDecryptedRefreshToken } from "@/lib/repositories/gmail-sync";

/**
 * Shared helpers for the `/api/account/*` sharing routes (WS18). Centralizes Firebase ID
 * token verification, workspace permission resolution, and the optional best-effort
 * invite email so each route stays thin and the auth path is identical to the Gmail
 * routes (verify the caller's ID token; never trust a client-supplied uid).
 */

export interface AuthedCaller {
  ok: true;
  uid: string;
  email: string | null;
}
export interface AuthError {
  ok: false;
  status: number;
  error: string;
}

/** Verify the caller's Firebase ID token and return their uid + verified email. */
export async function authenticateRequest(req: NextRequest): Promise<AuthedCaller | AuthError> {
  const idToken = extractBearerToken(req.headers.get("authorization"));
  if (!idToken) {
    return { ok: false, status: 401, error: "Missing Firebase ID token" };
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { ok: true, uid: decoded.uid, email: decoded.email?.toLowerCase() ?? null };
  } catch {
    return { ok: false, status: 401, error: "Invalid Firebase ID token" };
  }
}

export interface ManagePermission {
  allowed: boolean;
  /** "owner" when the caller owns the workspace, otherwise the member role, or null. */
  role: "owner" | MemberRole | null;
}

/**
 * Resolve whether `callerUid` may manage members (invite/change-role/revoke/remove) in
 * `ownerUid`'s workspace. The owner always can; an editor can; a viewer and non-members
 * cannot. The route layer applies the extra "cannot remove/demote the owner" rule.
 */
export async function canManageMembers(
  ownerUid: string,
  callerUid: string,
): Promise<ManagePermission> {
  if (callerUid === ownerUid) {
    return { allowed: true, role: "owner" };
  }
  const member = await getMember(ownerUid, callerUid);
  if (!member) {
    return { allowed: false, role: null };
  }
  return { allowed: member.role === "editor", role: member.role };
}

/** Encode a string as RFC 2047 base64 so non-ASCII subjects survive transit. */
function encodeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/** Build a base64url-encoded RFC 5322 message for the Gmail `send` API. */
function buildRawEmail(params: { to: string; subject: string; body: string }): string {
  const lines = [
    `To: ${params.to}`,
    `Subject: ${encodeHeader(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.body, "utf-8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8").toString("base64url");
}

export interface InviteEmailInput {
  ownerUid: string;
  toEmail: string;
  role: MemberRole;
  acceptUrl: string;
}
export interface InviteEmailResult {
  attempted: boolean;
  sent: boolean;
}

/**
 * Send an accept-link invite email via the OWNER's connected Gmail (reuses the WS7 send
 * path + stored encrypted refresh token). Strictly best-effort: any missing prerequisite
 * (no connected Gmail, OAuth not configured) or send failure resolves to
 * `{ sent: false }` and NEVER throws — email is never a hard dependency of inviting, and
 * the token-bearing accept URL is never logged.
 */
export async function sendInviteEmailBestEffort(
  input: InviteEmailInput,
): Promise<InviteEmailResult> {
  try {
    const env = getServerEnv();
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      return { attempted: false, sent: false };
    }
    const refreshToken = await getDecryptedRefreshToken(input.ownerUid);
    if (!refreshToken) {
      return { attempted: false, sent: false };
    }

    const client = new GmailClient({
      accessTokenProvider: refreshTokenAccessProvider({
        clientId: env.googleOAuthClientId,
        clientSecret: env.googleOAuthClientSecret,
        refreshToken,
      }),
    });

    const subject = "You've been invited to an Abode Alerts workspace";
    const body = [
      `You've been invited to collaborate on an Abode Alerts workspace as a ${input.role}.`,
      "",
      "Open the link below while signed in to the invited Google account to accept:",
      input.acceptUrl,
      "",
      "If you weren't expecting this invitation, you can ignore this email.",
    ].join("\n");

    await client.sendMessage(buildRawEmail({ to: input.toEmail, subject, body }));
    return { attempted: true, sent: true };
  } catch {
    // Never surface the token-bearing URL or the underlying error; email is optional.
    return { attempted: true, sent: false };
  }
}
