import { getIngestRun } from "@/lib/repositories/runs";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

async function main() {
  getFirebaseAdminApp();
  const runId = process.argv[2];
  if (!runId) {
    throw new Error("Usage: read-ingest-run.ts <runId>");
  }

  const run = await getIngestRun(runId);
  if (!run) {
    throw new Error(`Ingest run ${runId} not found`);
  }

  console.log(JSON.stringify(run, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
