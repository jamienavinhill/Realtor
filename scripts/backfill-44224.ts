import { runBackfill44224 } from "@/lib/ingest/backfill";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Starting 44224 backfill${dryRun ? " (dry run)" : ""}...`);

  const result = await runBackfill44224({ dryRun });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
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

  if (result.errors.length > 0 && result.listingsUpserted === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});