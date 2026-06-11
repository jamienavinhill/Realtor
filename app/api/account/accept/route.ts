import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { authenticateRequest } from "@/lib/account/route-helpers";
import { acceptInvite } from "@/lib/repositories/account-members";

/**
 * Accept a workspace invite by token (WS18). The accepting user is authenticated by their
 * Firebase ID token; their verified email must match the invited email. Acceptance is a
 * transactional Admin SDK write (pending -> accepted + membership), so it cannot be
 * forged from the client and a double-accept is rejected.
 */
export const runtime = "nodejs";

interface AcceptBody {
  token?: string;
}

const REASON_STATUS: Record<string, number> = {
  "not-found": 404,
  revoked: 410,
  "already-accepted": 409,
  "email-mismatch": 403,
  self: 400,
};

const REASON_MESSAGE: Record<string, string> = {
  "not-found": "This invite no longer exists.",
  revoked: "This invite has been revoked.",
  "already-accepted": "This invite has already been accepted.",
  "email-mismatch": "This invite was sent to a different email address. Sign in with that account.",
  self: "You cannot accept an invite into your own workspace.",
};

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    if (!auth.email) {
      return NextResponse.json(
        { error: "Your account has no verified email; cannot accept the invite." },
        { status: 403 },
      );
    }

    let body: AcceptBody;
    try {
      body = (await req.json()) as AcceptBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const token = body.token?.trim();
    if (!token) {
      return NextResponse.json({ error: "An invite token is required." }, { status: 400 });
    }

    const result = await acceptInvite({
      token,
      memberUid: auth.uid,
      memberEmail: auth.email,
    });

    if (!result.ok) {
      const status = REASON_STATUS[result.reason] ?? 400;
      return NextResponse.json(
        { error: REASON_MESSAGE[result.reason], reason: result.reason },
        { status },
      );
    }

    return NextResponse.json({
      ok: true,
      ownerUid: result.ownerUid,
      role: result.member.role,
    });
  } catch (error: unknown) {
    console.error("Account accept error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
