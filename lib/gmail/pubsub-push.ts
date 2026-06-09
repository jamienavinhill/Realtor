import { OAuth2Client } from "google-auth-library";

/**
 * Authenticity verification for Gmail → Cloud Pub/Sub push deliveries (WS7).
 *
 * Verified against official docs (2026-06-09):
 *  - Pub/Sub signs an OIDC JWT and sends it as `Authorization: Bearer <jwt>`.
 *    Subscribers verify: issuer is `https://accounts.google.com` (or
 *    `accounts.google.com`), the `aud` claim matches the configured push-endpoint
 *    audience, the `email` claim is the configured push service account, and
 *    `email_verified` is true. Signature is checked against Google's public certs.
 *    https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions
 *  - The Gmail notification body is `{ message: { data, messageId, ... }, subscription }`
 *    where `message.data` is base64url JSON `{ emailAddress, historyId }`.
 *    https://developers.google.com/workspace/gmail/api/guides/push
 *
 * Defense in depth: the push subscription URL also carries a shared `?token=` secret
 * (`PUBSUB_PUSH_TOKEN`). When configured we require it BEFORE doing any JWT work, so an
 * unauthenticated caller is rejected cheaply. The OIDC JWT is the primary, cryptographic
 * check; the shared secret is a cheap pre-filter, never the sole gate.
 *
 * The OAuth2Client used for verification is injectable so the handler test can reject a
 * forged/absent token with zero live network calls to Google's cert endpoint.
 */
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GmailPushNotification {
  emailAddress: string;
  historyId: string;
}

export interface PubSubPushBody {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
  };
  subscription?: string;
}

export interface PushVerifierConfig {
  /** Expected `aud` claim — the configured push endpoint audience (usually the URL). */
  expectedAudience?: string;
  /** Expected push service-account email (`email` claim). */
  expectedServiceAccountEmail?: string;
  /** Shared secret expected on the `?token=` query param (defense in depth). */
  expectedSharedSecret?: string;
}

export interface PushVerifierOptions {
  /** Injectable OIDC verifier; defaults to a real google-auth-library OAuth2Client. */
  oauthClient?: Pick<OAuth2Client, "verifyIdToken">;
}

export interface VerifyResult {
  ok: boolean;
  /** Set when ok=true. */
  notification?: GmailPushNotification;
  /** HTTP status to return on failure (401 auth, 400 malformed). */
  status?: number;
  reason?: string;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function decodePushNotification(body: PubSubPushBody): GmailPushNotification | null {
  const data = body.message?.data;
  if (!data || typeof data !== "string") return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as Record<string, unknown>).emailAddress !== "string" ||
    (decoded as Record<string, unknown>).historyId === undefined
  ) {
    return null;
  }
  const obj = decoded as Record<string, unknown>;
  return {
    emailAddress: String(obj.emailAddress),
    historyId: String(obj.historyId),
  };
}

/**
 * Build a push verifier. The returned function authenticates one request and decodes the
 * Gmail notification. It NEVER trusts the body before the shared secret + OIDC JWT pass.
 */
export function createPushVerifier(config: PushVerifierConfig, options: PushVerifierOptions = {}) {
  const oauthClient = options.oauthClient ?? new OAuth2Client();

  return async function verifyPush(input: {
    authorizationHeader?: string | null;
    sharedSecretParam?: string | null;
    body: PubSubPushBody;
  }): Promise<VerifyResult> {
    // 1) Cheap shared-secret pre-filter (when configured).
    if (config.expectedSharedSecret) {
      const provided = input.sharedSecretParam ?? "";
      if (!provided || !constantTimeEquals(provided, config.expectedSharedSecret)) {
        return { ok: false, status: 401, reason: "Invalid or missing push shared secret." };
      }
    }

    // 2) Primary OIDC JWT verification.
    const header = input.authorizationHeader ?? "";
    const match = header.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1]?.trim();
    if (!idToken) {
      return { ok: false, status: 401, reason: "Missing Pub/Sub OIDC bearer token." };
    }

    let payload;
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: config.expectedAudience,
      });
      payload = ticket.getPayload();
    } catch (error) {
      return {
        ok: false,
        status: 401,
        reason: `OIDC token verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    if (!payload) {
      return { ok: false, status: 401, reason: "OIDC token had no payload." };
    }
    if (!GOOGLE_ISSUERS.includes(payload.iss)) {
      return { ok: false, status: 401, reason: `Unexpected token issuer: ${payload.iss}.` };
    }
    if (
      config.expectedServiceAccountEmail &&
      (payload.email !== config.expectedServiceAccountEmail || payload.email_verified !== true)
    ) {
      return { ok: false, status: 401, reason: "OIDC token email/service account mismatch." };
    }

    // 3) Decode the Gmail notification only AFTER auth passes.
    const notification = decodePushNotification(input.body);
    if (!notification) {
      return { ok: false, status: 400, reason: "Malformed Gmail push notification body." };
    }

    return { ok: true, notification };
  };
}
