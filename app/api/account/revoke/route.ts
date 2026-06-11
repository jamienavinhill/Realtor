import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { authenticateRequest, canManageMembers } from "@/lib/account/route-helpers";
import { listPendingInvites, revokeInvite } from "@/lib/repositories/account-members";

/**
 * Revoke a still-pending workspace invite by token (WS18). Owner or editor of the
 * workspace only. Revoking flips the invite's status to "revoked" so it can no longer be
 * accepted; already-accepted invites (and their memberships) are unaffected — remove the
 * member via DELETE /api/account/members for that.
 */
export const runtime = "nodejs";

interface RevokeBody {
  token?: string;
  ownerUid?: string;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: RevokeBody;
    try {
      body = (await req.json()) as RevokeBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "An invite token is required." }, { status: 400 });
    }
    const ownerUid = body.ownerUid?.trim() || auth.uid;

    const permission = await canManageMembers(ownerUid, auth.uid);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: "You do not have permission to revoke invites for this workspace." },
        { status: 403 },
      );
    }

    const revoked = await revokeInvite(ownerUid, token);
    if (!revoked) {
      return NextResponse.json({ error: "Invite not found for this workspace." }, { status: 404 });
    }

    const pendingInvites = await listPendingInvites(ownerUid);
    return NextResponse.json({ ok: true, pendingInvites });
  } catch (error: unknown) {
    console.error("Account revoke error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
