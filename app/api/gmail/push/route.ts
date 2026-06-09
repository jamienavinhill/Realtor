import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { createPushVerifier, type PubSubPushBody } from "@/lib/gmail/pubsub-push";
import { findUidByEmailAddress } from "@/lib/repositories/gmail-sync";
import { runEmailPipelineForUser } from "@/lib/ingest/email-pipeline-runner";

/**
 * Cloud Pub/Sub push handler for Gmail notifications — the PRIMARY ingestion trigger (WS7).
 *
 * Authenticity is verified BEFORE any work: the Pub/Sub OIDC JWT (issuer, audience,
 * service-account email — verified against Google's public certs via google-auth-library)
 * plus a defense-in-depth shared `?token=` secret. A forged or absent token is rejected
 * 401 and nothing runs. Verified against official docs (2026-06-09):
 *   https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions
 *   https://developers.google.com/workspace/gmail/api/guides/push
 *
 * On a valid push it decodes `{ emailAddress, historyId }`, maps the address to its uid,
 * and runs the shared email pipeline from the stored `historyId` watermark — idempotent
 * against dedupe keys, so a redelivered push never duplicates a listing or alert match.
 *
 * Pub/Sub treats any 2xx as ACK. We return 200 even for "no connected mailbox" so Pub/Sub
 * does not redeliver indefinitely for an address we do not track; genuine processing
 * errors are logged and still ACKed (the historyId watermark only advances on success, so
 * the next push re-covers missed mail) to avoid hot redelivery loops.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const env = getServerEnv();

    // Audience is left unverified here (Pub/Sub defaults `aud` to the push endpoint URL,
    // which we do not reliably know server-side behind Vercel proxies); authenticity rests
    // on the signed OIDC JWT (issuer + service-account email) plus the shared secret.
    const verifyPush = createPushVerifier({
      expectedServiceAccountEmail: env.pubsubServiceAccountEmail,
      expectedSharedSecret: env.pubsubPushToken,
    });

    let body: PubSubPushBody;
    try {
      body = (await req.json()) as PubSubPushBody;
    } catch {
      return NextResponse.json({ error: "Malformed push body" }, { status: 400 });
    }

    const verification = await verifyPush({
      authorizationHeader: req.headers.get("authorization"),
      sharedSecretParam: req.nextUrl.searchParams.get("token"),
      body,
    });

    if (!verification.ok || !verification.notification) {
      return NextResponse.json(
        { error: verification.reason ?? "Push verification failed" },
        { status: verification.status ?? 401 },
      );
    }

    const { emailAddress, historyId } = verification.notification;
    const uid = await findUidByEmailAddress(emailAddress);
    if (!uid) {
      // ACK so Pub/Sub stops redelivering for an address we do not monitor.
      return NextResponse.json({ ok: true, processed: false, reason: "No connected mailbox." });
    }

    try {
      const result = await runEmailPipelineForUser({ uid, runType: "email" });
      return NextResponse.json({
        ok: true,
        processed: true,
        notifiedHistoryId: historyId,
        runId: result.runId,
        messagesProcessed: result.messagesProcessed,
        listingsUpserted: result.listingsUpserted,
        alertMatchesCreated: result.alertMatchesCreated,
      });
    } catch (error) {
      // Log but ACK: the historyId watermark only advances on success, so the next push
      // re-covers anything missed. Returning non-2xx would trigger hot redelivery.
      console.error("Gmail push pipeline error:", error);
      return NextResponse.json({ ok: true, processed: false, error: getErrorMessage(error) });
    }
  } catch (error: unknown) {
    console.error("Gmail push handler error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
