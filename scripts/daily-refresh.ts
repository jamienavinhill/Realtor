import { runDailyRefresh } from "@/lib/ingest/daily-refresh";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(`Starting daily refresh${dryRun ? " (dry run)" : ""}...`);

  const result = await runDailyRefresh({ dryRun });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        dryRun: result.dryRun,
        listingsFetched: result.listingsFetched,
        listingsUpserted: result.listingsUpserted,
        alertMatchesCreated: result.alertMatchesCreated,
        alertMatchesUpdated: result.alertMatchesUpdated,
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