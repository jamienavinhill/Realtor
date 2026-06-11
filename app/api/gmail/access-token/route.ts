import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { getDecryptedRefreshToken } from "@/lib/repositories/gmail-sync";
import { refreshTokenAccessProvider } from "@/lib/gmail/client";

/**
 * Mint a fresh, short-lived Google access token from the signed-in user's STORED refresh
 * token (captured once during the offline sign-in). This lets the dashboard silently restore
 * Gmail/Workspace access after a reload — no re-authorization popup — completing set-and-forget.
 * The refresh token never leaves the server; only the short-lived access token is returned.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const idToken = extractBearerToken(req.headers.get("authorization"));
    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token" }, { status: 401 });
    }
    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const refreshToken = await getDecryptedRefreshToken(uid);
    if (!refreshToken) {
      return NextResponse.json({ connected: false }, { status: 200 });
    }

    const accessToken = await refreshTokenAccessProvider({
      clientId,
      clientSecret,
      refreshToken,
    })();
    return NextResponse.json({ connected: true, accessToken });
  } catch (error: unknown) {
    console.error("gmail access-token error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
