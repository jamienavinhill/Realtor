import type { GmailSync } from "@/types/gmail-sync";
import { GMAIL_SYNC_DOC_ID } from "@/types/gmail-sync";
import { validateGmailSync } from "@/lib/schemas/gmail-sync";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { decryptToken, encryptToken } from "@/lib/crypto/token-cipher";

/**
 * Server-only repository for `users/{uid}/gmailSync/main`. The Admin SDK bypasses
 * `config/firebase/firestore.rules`, which deny all client access to this subcollection. The Google
 * OAuth refresh token is encrypted (AES-256-GCM) before write and only decrypted here,
 * server-side, when the pipeline needs to mint an access token.
 */
function gmailSyncDocRef(uid: string) {
  const db = getAdminFirestore();
  return db.collection("users").doc(uid).collection("gmailSync").doc(GMAIL_SYNC_DOC_ID);
}

export async function getGmailSync(uid: string): Promise<GmailSync | null> {
  const snap = await gmailSyncDocRef(uid).get();
  if (!snap.exists) {
    return null;
  }
  const validation = validateGmailSync({ uid, ...snap.data() });
  return validation.success ? validation.data : null;
}

/**
 * Persist (merge) gmailSync fields. The refresh token must be passed via
 * `plaintextRefreshToken` and is encrypted here; callers never write
 * `refreshTokenEnc` directly. Other fields merge so a watch update does not clobber
 * the stored token or platform selection.
 */
export async function upsertGmailSync(
  uid: string,
  patch: Partial<Omit<GmailSync, "uid" | "updatedAt" | "refreshTokenEnc">> & {
    plaintextRefreshToken?: string;
  },
): Promise<void> {
  const { plaintextRefreshToken, ...rest } = patch;
  const now = new Date().toISOString();

  const fields: Record<string, unknown> = {
    uid,
    updatedAt: now,
  };

  if (rest.emailAddress !== undefined) fields.emailAddress = rest.emailAddress;
  if (rest.historyId !== undefined) fields.historyId = rest.historyId;
  if (rest.watchExpiresAt !== undefined) fields.watchExpiresAt = rest.watchExpiresAt;
  if (rest.lastProcessedAt !== undefined) fields.lastProcessedAt = rest.lastProcessedAt;
  if (rest.platformSelection !== undefined) fields.platformSelection = rest.platformSelection;
  if (rest.customQuery !== undefined) fields.customQuery = rest.customQuery;

  if (plaintextRefreshToken !== undefined && plaintextRefreshToken.trim().length > 0) {
    fields.refreshTokenEnc = encryptToken(plaintextRefreshToken.trim());
  }

  await gmailSyncDocRef(uid).set(fields, { merge: true });
}

/**
 * Decrypt and return the stored Google refresh token for `uid`, or null when none is
 * stored. Server-side only. The plaintext token never leaves the server boundary.
 */
export async function getDecryptedRefreshToken(uid: string): Promise<string | null> {
  const sync = await getGmailSync(uid);
  if (!sync?.refreshTokenEnc) {
    return null;
  }
  return decryptToken(sync.refreshTokenEnc);
}

/**
 * Map a connected Gmail address to its owning uid. Used by the push handler, which
 * receives `emailAddress` (not a uid) in the Pub/Sub notification. Returns null when no
 * connected mailbox matches. Reads via a collectionGroup over the per-user gmailSync docs.
 */
export async function findUidByEmailAddress(emailAddress: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snapshot = await db
    .collectionGroup("gmailSync")
    .where("emailAddress", "==", emailAddress.trim().toLowerCase())
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const data = snapshot.docs[0].data() as Partial<GmailSync>;
  return data.uid ?? null;
}

/**
 * List every uid that has a stored refresh token. Used by the watch-renewal job to
 * re-register `users.watch` for all connected mailboxes. Reads only the existence of
 * `refreshTokenEnc`; never returns the token itself.
 */
export async function listConnectedGmailUids(): Promise<string[]> {
  const db = getAdminFirestore();
  // collectionGroup over the per-user gmailSync subcollection.
  const snapshot = await db.collectionGroup("gmailSync").get();
  const uids: string[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() as Partial<GmailSync>;
    if (data.uid && data.refreshTokenEnc) {
      uids.push(data.uid);
    }
  }
  return uids;
}
