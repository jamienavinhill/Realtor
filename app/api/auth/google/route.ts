import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
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

/** Decode the `sub` (Google account id) from an id_token without re-verifying it — it came
 * directly from Google's token endpoint over TLS, so a second network verification is wasted. */
function decodeIdTokenSub(idToken: string): string | undefined {
  const payload = idToken.split(".")[1];
  if (!payload) return undefined;
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
    return (JSON.parse(json) as { sub?: string }).sub;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Read ONLY the OAuth client vars. Sign-in must not depend on unrelated server env
    // (RealtyAPI, etc.), so we deliberately do NOT call the all-or-nothing getServerEnv().
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
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

    const oauth = new OAuth2Client({ clientId, clientSecret, redirectUri: "postmessage" });

    let idToken: string | undefined;
    let accessToken: string | undefined;
    let refreshToken: string | undefined;
    try {
      const { tokens } = await oauth.getToken(code);
      idToken = tokens.id_token ?? undefined;
      accessToken = tokens.access_token ?? undefined;
      refreshToken = tokens.refresh_token ?? undefined;
    } catch (error) {
      console.error("google auth code exchange failed:", getErrorMessage(error));
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

    // Resolve the Google account id (sub) from the id_token (came from Google's token
    // endpoint over TLS, so we decode rather than make a second verification network call).
    const sub = decodeIdTokenSub(idToken);
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
