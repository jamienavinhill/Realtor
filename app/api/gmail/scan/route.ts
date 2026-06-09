import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { runEmailPipelineForUser } from "@/lib/ingest/email-pipeline-runner";

/**
 * Manual "Scan Gmail" — the SAME email pipeline as the automatic Pub/Sub push, exposed as
 * a secondary/advanced action (WS7). It scans by the user's composed platform query
 * instead of advancing the history watermark, so a user can pull recent matching mail on
 * demand. Runs server-side from the stored encrypted refresh token (no client access
 * token), so it shares the automatic flow's provenance/dedupe/enrichment exactly.
 *
 * Auth: Firebase ID token as `Authorization: Bearer <idToken>`; the uid is derived
 * server-side. Requires the user to have connected Gmail first (POST /api/gmail/connect).
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
      const decoded = await getAdminAuth().verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    let maxResults = 10;
    try {
      const body = (await req.json()) as { maxResults?: number };
      if (typeof body.maxResults === "number" && body.maxResults > 0) {
        maxResults = Math.min(body.maxResults, 25);
      }
    } catch {
      // Optional body.
    }

    const result = await runEmailPipelineForUser({
      uid,
      runType: "email",
      useQueryScan: true,
      maxResults,
    });

    return NextResponse.json({
      ok: true,
      runId: result.runId,
      messagesProcessed: result.messagesProcessed,
      listingsUpserted: result.listingsUpserted,
      listingsCreated: result.listingsCreated,
      listingsSkipped: result.listingsSkipped,
      alertMatchesCreated: result.alertMatchesCreated,
      errors: result.errors.slice(0, 20),
    });
  } catch (error: unknown) {
    console.error("Gmail manual scan error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
