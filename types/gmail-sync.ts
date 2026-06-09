/**
 * Per-user Gmail watch + ingestion cursor state (WS7). Owner-scoped, but stored in a
 * SERVER-ONLY subcollection: `users/{uid}/gmailSync/main`. It carries the encrypted
 * Google OAuth refresh token so the email pipeline can run without a browser session.
 *
 * The refresh token is stored ENCRYPTED at rest (AES-256-GCM, see
 * `lib/crypto/token-cipher.ts`) and is NEVER returned to the client — `config/firebase/firestore.rules`
 * denies all client read/write of `gmailSync`, and the repository only ever decrypts
 * server-side inside the pipeline.
 */
export interface GmailSync {
  uid: string;
  /**
   * The connected Gmail address. Gmail push notifications carry `emailAddress` (not the
   * Firebase uid), so the push handler maps `emailAddress -> uid` via this field.
   */
  emailAddress?: string;
  /** Gmail mailbox `historyId` watermark; the push handler fetches changes since this. */
  historyId?: string;
  /** ISO-8601 expiry of the current Gmail `watch` (Gmail expires it within ~7 days). */
  watchExpiresAt?: string;
  /** ISO-8601 timestamp of the last successfully processed push/poll. */
  lastProcessedAt?: string;
  /** Selected listing-email platform ids (see lib/gmail/platforms). */
  platformSelection: string[];
  /** Optional advanced free-text query fragment appended to the composed query. */
  customQuery?: string;
  /** Encrypted Google OAuth refresh token (v1.<iv>.<tag>.<ct>); never sent to client. */
  refreshTokenEnc?: string;
  updatedAt: string;
}

/** Fixed document id for the single per-user gmailSync doc. */
export const GMAIL_SYNC_DOC_ID = "main";
