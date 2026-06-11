import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { isMemberRole } from "@/lib/schemas/sharing";
import type { MemberRole } from "@/types/sharing";
import { authenticateRequest, canManageMembers } from "@/lib/account/route-helpers";
import {
  changeMemberRole,
  getMember,
  listMembers,
  listPendingInvites,
  listWorkspacesForUser,
  removeMember,
} from "@/lib/repositories/account-members";

/**
 * Workspace membership management (WS18).
 *
 * - GET    — list members + pending invites for a workspace (owner/editor/viewer of it),
 *            plus the caller's workspace memberships for the switcher.
 * - PATCH  — change a member's role (owner/editor; never the owner; editors stay <=editor).
 * - DELETE — remove a member (owner/editor; never the owner).
 *
 * The workspace defaults to the caller's own uid; pass `?ownerUid=` (GET) or `ownerUid`
 * in the body (PATCH/DELETE) to target a workspace the caller is a member of.
 */
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const ownerUid = req.nextUrl.searchParams.get("ownerUid")?.trim() || auth.uid;

    // The caller must be the owner or any member to read the member list.
    const isOwner = ownerUid === auth.uid;
    const member = isOwner ? null : await getMember(ownerUid, auth.uid);
    if (!isOwner && !member) {
      return NextResponse.json(
        { error: "You are not a member of this workspace." },
        { status: 403 },
      );
    }

    const callerRole: "owner" | MemberRole = isOwner
      ? "owner"
      : (member as { role: MemberRole }).role;
    const canManage = isOwner || callerRole === "editor";

    const [members, workspaces] = await Promise.all([
      listMembers(ownerUid),
      listWorkspacesForUser(auth.uid),
    ]);
    // Only owners/editors should see outstanding invite tokens-by-email; viewers get [].
    const pendingInvites = canManage ? await listPendingInvites(ownerUid) : [];

    return NextResponse.json({
      ok: true,
      ownerUid,
      callerRole,
      canManage,
      members,
      pendingInvites,
      workspaces,
    });
  } catch (error: unknown) {
    console.error("Account members list error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

interface ChangeRoleBody {
  ownerUid?: string;
  memberUid?: string;
  role?: MemberRole;
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: ChangeRoleBody;
    try {
      body = (await req.json()) as ChangeRoleBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ownerUid = body.ownerUid?.trim() || auth.uid;
    const memberUid = body.memberUid?.trim();
    if (!memberUid) {
      return NextResponse.json({ error: "memberUid is required." }, { status: 400 });
    }
    if (!isMemberRole(body.role)) {
      return NextResponse.json({ error: "role must be 'viewer' or 'editor'." }, { status: 400 });
    }
    // The owner can never be demoted via this route — the owner is not a member record.
    if (memberUid === ownerUid) {
      return NextResponse.json(
        { error: "The workspace owner's role cannot be changed." },
        { status: 403 },
      );
    }

    const permission = await canManageMembers(ownerUid, auth.uid);
    if (!permission.allowed) {
      return NextResponse.json(
        { error: "You do not have permission to change roles in this workspace." },
        { status: 403 },
      );
    }

    const updated = await changeMemberRole(ownerUid, memberUid, body.role);
    return NextResponse.json({ ok: true, member: updated });
  } catch (error: unknown) {
    console.error("Account change-role error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

interface RemoveMemberBody {
  ownerUid?: string;
  memberUid?: string;
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    let body: RemoveMemberBody;
    try {
      body = (await req.json()) as RemoveMemberBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const ownerUid = body.ownerUid?.trim() || auth.uid;
    const memberUid = body.memberUid?.trim();
    if (!memberUid) {
      return NextResponse.json({ error: "memberUid is required." }, { status: 400 });
    }
    if (memberUid === ownerUid) {
      return NextResponse.json(
        { error: "The workspace owner cannot be removed." },
        { status: 403 },
      );
    }

    // A member may remove themselves (leave the workspace); otherwise owner/editor only.
    const isSelf = memberUid === auth.uid;
    if (!isSelf) {
      const permission = await canManageMembers(ownerUid, auth.uid);
      if (!permission.allowed) {
        return NextResponse.json(
          { error: "You do not have permission to remove members from this workspace." },
          { status: 403 },
        );
      }
    }

    await removeMember(ownerUid, memberUid);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("Account remove-member error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
