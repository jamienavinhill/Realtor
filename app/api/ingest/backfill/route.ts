import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { validateIngestToken } from "@/lib/ingest/auth";
import { runBackfill44224 } from "@/lib/ingest/backfill";

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

    getServerEnv();

    const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
    const result = await runBackfill44224({ dryRun });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("Backfill ingest error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Backfill ingest failed" },
      { status: 500 },
    );
  }
}
