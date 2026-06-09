import { validateServerEnv } from "@/lib/env";
import { runBackfill44224 } from "@/lib/ingest/backfill";

async function main() {
  const envCheck = validateServerEnv();
  if (!envCheck.ok) {
    console.error("Server environment not ready:");
    for (const error of envCheck.errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  const dryRun = process.argv.includes("--dry-run");

  if (dryRun) {
    console.log(
      "Starting 44224 backfill (dry run): env validated, no Firestore writes and no live " +
        "RealtyAPI calls (preserves the scarce monthly provider budget).",
    );
  } else {
    console.log("Starting 44224 backfill...");
  }

  const result = await runBackfill44224({ dryRun });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        status: result.status,
        dryRun: result.dryRun,
        listingsFetched: result.listingsFetched,
        listingsUpserted: result.listingsUpserted,
        listingsSkipped: result.listingsSkipped,
        errorCount: result.errors.length,
        errors: result.errors,
      },
      null,
      2,
    ),
  );

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
