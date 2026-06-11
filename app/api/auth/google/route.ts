import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getServerEnv } from "@/lib/env";
import { getErrorMessage } from "@/lib/errors";
import { encryptToken } from "@/lib/crypto/token-cipher";
import { getAdminFirestore } from "@/lib/firebase-admin";

/**
 * Exchange a Google offline authorization code (from the GIS code flow) for tokens. Returns
 * the id_token + access_token so the browser can sign into Firebase as the SAME Google
 * identity (preserving the account/uid), and stashes the refresh token — encrypted, keyed by
 * the Google `sub` — in `pendingGmailTokens/{sub}` until the client finishes Firebase sign-in
 * and claims it under its uid via `/api/gmail/claim`. The refresh token never reaches the
 * browser. This route is part of sign-in, so it is intentionally NOT Firebase-authenticated.
 */
export const runtime = "nodejs";

interface ExchangeBody {
  code?: string;
}

export async function POST(req: NextRequest) {
  try {
    const env = getServerEnv();
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      return NextResponse.json(
        { error: "Google OAuth client is not configured on the server." },
        { status: 503 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as ExchangeBody;
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "Missing authorization code." }, { status: 400 });
    }

    const oauth = new OAuth2Client({
      clientId: env.googleOAuthClientId,
      clientSecret: env.googleOAuthClientSecret,
      redirectUri: "postmessage",
    });

    let idToken: string | undefined;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    try {
      const { tokens } = await oauth.getToken(code);
      idToken = tokens.id_token ?? undefined;
      accessToken = tokens.access_token ?? undefined;
      refreshToken = tokens.refresh_token ?? undefined;
    } catch (error) {
      return NextResponse.json(
        { error: `Authorization code exchange failed: ${getErrorMessage(error)}` },
        { status: 400 },
      );
    }

    if (!idToken || !accessToken) {
      return NextResponse.json(
        { error: "Google did not return the expected tokens." },
        { status: 400 },
      );
    }

    // Resolve the Google account id from the verified id_token to key the pending token.
    const ticket = await oauth.verifyIdToken({ idToken, audience: env.googleOAuthClientId });
    const sub = ticket.getPayload()?.sub;
    if (!sub) {
      return NextResponse.json({ error: "Could not resolve the Google account." }, { status: 400 });
    }

    if (refreshToken) {
      await getAdminFirestore()
        .collection("pendingGmailTokens")
        .doc(sub)
        .set({ refreshTokenEnc: encryptToken(refreshToken), createdAt: new Date().toISOString() });
    }

    // id_token + access_token go to the browser for Firebase signInWithCredential; the
    // refresh token (the secret) stays server-side.
    return NextResponse.json({ idToken, accessToken, hasRefreshToken: Boolean(refreshToken) });
  } catch (error: unknown) {
    console.error("google auth exchange error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
