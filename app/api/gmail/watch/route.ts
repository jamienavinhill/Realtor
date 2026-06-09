import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { validateIngestToken } from "@/lib/ingest/auth";
import { GmailClient, refreshTokenAccessProvider } from "@/lib/gmail/client";
import {
  getDecryptedRefreshToken,
  listConnectedGmailUids,
  upsertGmailSync,
} from "@/lib/repositories/gmail-sync";

/**
 * Register / renew the Gmail `watch` → Cloud Pub/Sub topic for connected mailboxes (WS7).
 *
 * `INGEST_JOB_TOKEN`-gated (called by the operator and the weekly re-watch GitHub Action;
 * Gmail expires a watch within ~7 days — see WS8). For each target uid it mints an access
 * token from the stored encrypted refresh token, calls `users.watch` against the
 * configured Pub/Sub topic, and persists the returned `historyId` + `watchExpiresAt`
 * watermark so the push handler can advance from it.
 *
 * Body (optional): `{ uid?: string }` to (re)watch a single mailbox; omitted = all
 * connected mailboxes. No body is required for the scheduled renewal.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const expectedToken = process.env.INGEST_JOB_TOKEN?.trim();
    if (!expectedToken) {
      return NextResponse.json({ error: "Ingest job token not configured" }, { status: 503 });
    }
    const authorized = validateIngestToken({
      authorizationHeader: req.headers.get("authorization"),
      ingestTokenHeader: req.headers.get("x-ingest-token"),
      expectedToken,
    });
    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const env = getServerEnv();
    if (!env.gmailPubsubTopic) {
      return NextResponse.json(
        { error: "GMAIL_PUBSUB_TOPIC is not configured on the server." },
        { status: 503 },
      );
    }
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      return NextResponse.json(
        { error: "Google OAuth client is not configured on the server." },
        { status: 503 },
      );
    }

    let body: { uid?: string } = {};
    try {
      body = (await req.json()) as { uid?: string };
    } catch {
      // No body is fine for the scheduled renewal.
    }

    const uids = body.uid ? [body.uid] : await listConnectedGmailUids();
    if (uids.length === 0) {
      return NextResponse.json({
        ok: true,
        watched: 0,
        results: [],
        note: "No connected mailboxes.",
      });
    }

    const results: Array<{ uid: string; ok: boolean; watchExpiresAt?: string; error?: string }> =
      [];

    for (const uid of uids) {
      try {
        const refreshToken = await getDecryptedRefreshToken(uid);
        if (!refreshToken) {
          results.push({ uid, ok: false, error: "No stored refresh token." });
          continue;
        }
        const client = new GmailClient({
          accessTokenProvider: refreshTokenAccessProvider({
            clientId: env.googleOAuthClientId,
            clientSecret: env.googleOAuthClientSecret,
            refreshToken,
          }),
        });
        const watch = await client.registerWatch(env.gmailPubsubTopic);
        const watchExpiresAt = new Date(Number(watch.expiration)).toISOString();
        await upsertGmailSync(uid, {
          historyId: watch.historyId,
          watchExpiresAt,
        });
        results.push({ uid, ok: true, watchExpiresAt });
      } catch (error) {
        results.push({ uid, ok: false, error: getErrorMessage(error) });
      }
    }

    const watched = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, watched, results });
  } catch (error: unknown) {
    console.error("Gmail watch error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
