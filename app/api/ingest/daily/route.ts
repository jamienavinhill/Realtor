import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { validateIngestToken } from "@/lib/ingest/auth";
import { runDailyRefresh } from "@/lib/ingest/daily-refresh";

export async function POST(req: NextRequest) {
  try {
    const env = getServerEnv();
    const authorized = validateIngestToken({
      authorizationHeader: req.headers.get("authorization"),
      ingestTokenHeader: req.headers.get("x-ingest-token"),
      expectedToken: env.ingestJobToken,
    });

    if (!authorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
    const result = await runDailyRefresh({ dryRun });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("Daily ingest error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Daily ingest failed" },
      { status: 500 },
    );
  }
}
