import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { isMemberRole } from "@/lib/schemas/sharing";
import type { MemberRole } from "@/types/sharing";
import {
  authenticateRequest,
  canManageMembers,
  sendInviteEmailBestEffort,
} from "@/lib/account/route-helpers";
import { createInvite, listMembers, listPendingInvites } from "@/lib/repositories/account-members";

/**
 * Create a workspace invite (WS18). The caller is authenticated by their Firebase ID
 * token; the workspace owner is taken from `ownerUid` (defaults to the caller, i.e. the
 * caller invites into their own workspace). Only the owner or an editor of that workspace
 * may invite — and an editor can only grant a role at or below editor (enforced by
 * `canManageMembers` + role check).
 *
 * An unguessable token is generated and the invite is stored at `invites/{token}`. An
 * accept-link email is sent via the owner's connected Gmail on a BEST-EFFORT basis — a
 * send failure never fails the request, and the token is never logged.
 */
export const runtime = "nodejs";

interface InviteBody {
  email?: string;
  role?: MemberRole;
  /** Workspace to invite into; defaults to the caller's own uid. */
  ownerUid?: string;
  /** When false, skip the optional Gmail accept-link email. Defaults to true. */
  sendEmail?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: InviteBody;
    try {
      body = (await req.json()) as InviteBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "An invitee email is required." }, { status: 400 });
    }
    const role: MemberRole = isMemberRole(body.role) ? body.role : "viewer";
    const ownerUid = body.ownerUid?.trim() || auth.uid;

    // Only the owner or an editor of this workspace may invite.
    const permission = await canManageMembers(ownerUid, auth.uid);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: "You do not have permission to invite members to this workspace." },
        { status: 403 },
      );
    }
    // An editor cannot grant a role above their own (they may grant at or below editor;
    // editor is the ceiling, so this only matters if higher roles are ever added).
    if (permission.role === "editor" && role !== "viewer" && role !== "editor") {
      return NextResponse.json(
        { error: "Editors may grant viewer or editor only." },
        { status: 403 },
      );
    }

    const { invite } = await createInvite({ ownerUid, email, role });

    // Best-effort accept-link email via the owner's Gmail. Never blocks or fails the request.
    const acceptUrl = `${req.nextUrl.origin}/invite/${invite.token}`;
    const emailResult =
      body.sendEmail === false
        ? { attempted: false, sent: false }
        : await sendInviteEmailBestEffort({
            ownerUid,
            toEmail: email,
            role,
            acceptUrl,
          });

    // Return the up-to-date member + pending lists so the UI refreshes in one round-trip.
    const [members, pending] = await Promise.all([
      listMembers(ownerUid),
      listPendingInvites(ownerUid),
    ]);

    return NextResponse.json({
      ok: true,
      // The token is returned to the owner UI so it can show/copy the accept link.
      acceptUrl,
      invite: {
        token: invite.token,
        email: invite.email,
        role: invite.role,
        status: invite.status,
      },
      emailSent: emailResult.sent,
      emailAttempted: emailResult.attempted,
      members,
      pendingInvites: pending,
    });
  } catch (error: unknown) {
    console.error("Account invite error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
