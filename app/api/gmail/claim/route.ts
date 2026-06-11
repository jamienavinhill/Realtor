import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { decryptToken } from "@/lib/crypto/token-cipher";
import { upsertGmailSync } from "@/lib/repositories/gmail-sync";

/**
 * After the browser signs into Firebase (via the offline auth-code flow), it calls this with
 * its Firebase ID token to move the refresh token stashed in `pendingGmailTokens/{sub}` into
 * `users/{uid}/gmailSync` — completing the one-consent "connect Gmail" so ingestion and invite
 * emails can run without re-prompting. Best-effort: if nothing is pending (e.g. Google didn't
 * re-issue a refresh token), it simply reports `connected:false` and the existing token (if
 * any) is left intact.
 */
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const idToken = extractBearerToken(req.headers.get("authorization"));
    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token" }, { status: 401 });
    }

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
      email = decoded.email?.toLowerCase();
    } catch {
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    // The pending token is keyed by the Google account id (sub), which is the uid on the
    // user's google.com provider entry.
    const userRecord = await getAdminAuth().getUser(uid);
    const sub = userRecord.providerData.find((p) => p.providerId === "google.com")?.uid;
    if (!sub) {
      return NextResponse.json({ ok: true, connected: false });
    }

    const pendingRef = getAdminFirestore().collection("pendingGmailTokens").doc(sub);
    const snap = await pendingRef.get();
    if (!snap.exists) {
      return NextResponse.json({ ok: true, connected: false });
    }

    const enc = snap.data()?.refreshTokenEnc as string | undefined;
    if (enc) {
      await upsertGmailSync(uid, {
        plaintextRefreshToken: decryptToken(enc),
        emailAddress: email,
      });
    }
    await pendingRef.delete();

    return NextResponse.json({ ok: true, connected: Boolean(enc) });
  } catch (error: unknown) {
    console.error("gmail claim error:", getErrorMessage(error));
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
