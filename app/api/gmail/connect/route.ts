import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { upsertGmailSync } from "@/lib/repositories/gmail-sync";

/**
 * Persist a user's Google OAuth refresh token + email-platform selection so the email
 * pipeline can run WITHOUT a browser session (WS7).
 *
 * Auth: the caller sends its Firebase ID token as `Authorization: Bearer <idToken>`; the
 * server verifies it with the Admin SDK and derives the uid (never trusts a client uid).
 *
 * The refresh token is obtained by exchanging a one-time `serverAuthCode` server-side
 * (Google Identity Services offline/code flow with `access_type=offline`). The plaintext
 * refresh token is encrypted at rest by the repository and is NEVER returned to the
 * client. Platform selection / custom query may be persisted in the same call.
 *
 * This route does the privileged code→token exchange; the browser only ever holds the
 * short-lived authorization code, not the long-lived refresh token.
 */
export const runtime = "nodejs";

interface ConnectBody {
  /** One-time GIS authorization code with offline access (preferred path). */
  serverAuthCode?: string;
  /** OAuth redirect URI used to obtain the code (must match the code's redirect). */
  redirectUri?: string;
  /** The user's connected Gmail address (for push emailAddress -> uid mapping). */
  emailAddress?: string;
  /** Optional platform selection / custom query to persist alongside the token. */
  platformSelection?: string[];
  customQuery?: string;
}

export async function POST(req: NextRequest) {
  try {
    const idToken = extractBearerToken(req.headers.get("authorization"));
    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token" }, { status: 401 });
    }

    let uid: string;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    const env = getServerEnv();
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      return NextResponse.json(
        { error: "Google OAuth client is not configured on the server." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as ConnectBody;

    let plaintextRefreshToken: string | undefined;
    if (body.serverAuthCode) {
      const oauthClient = new OAuth2Client({
        clientId: env.googleOAuthClientId,
        clientSecret: env.googleOAuthClientSecret,
        redirectUri: body.redirectUri ?? "postmessage",
      });
      try {
        const { tokens } = await oauthClient.getToken(body.serverAuthCode);
        plaintextRefreshToken = tokens.refresh_token ?? undefined;
      } catch (error) {
        return NextResponse.json(
          { error: `Authorization code exchange failed: ${getErrorMessage(error)}` },
          { status: 400 },
        );
      }
      if (!plaintextRefreshToken) {
        return NextResponse.json(
          {
            error:
              "No refresh token returned. Re-consent with offline access (prompt=consent, access_type=offline).",
          },
          { status: 400 },
        );
      }
    }

    await upsertGmailSync(uid, {
      emailAddress: body.emailAddress?.trim().toLowerCase(),
      platformSelection: body.platformSelection,
      customQuery: body.customQuery,
      plaintextRefreshToken,
    });

    // Never echo the token back. Report only whether a token is now stored.
    return NextResponse.json({ ok: true, connected: Boolean(plaintextRefreshToken) });
  } catch (error: unknown) {
    console.error("Gmail connect error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
