import type { IngestRun } from "@/types/listings";
import { validateIngestRun } from "@/lib/schemas/ingest";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "ingest_runs";

export async function createIngestRun(run: IngestRun): Promise<void> {
  const validation = validateIngestRun(run);
  if (!validation.success) {
    throw new Error(`Invalid ingest run: ${validation.errors.join("; ")}`);
  }

  const db = getAdminFirestore();
  await db.collection(COLLECTION).doc(validation.data.id).set(validation.data);
}

export async function updateIngestRun(
  runId: string,
  patch: Partial<IngestRun>,
  baseRun?: IngestRun,
): Promise<void> {
  const db = getAdminFirestore();
  let merged: IngestRun;

  if (baseRun) {
    merged = { ...baseRun, ...patch, id: runId };
  } else {
    const doc = await db.collection(COLLECTION).doc(runId).get();
    if (!doc.exists) {
      throw new Error(`Ingest run ${runId} not found`);
    }
    merged = { id: runId, ...doc.data(), ...patch } as IngestRun;
  }
  const validation = validateIngestRun(merged);
  if (!validation.success) {
    throw new Error(`Invalid ingest run update: ${validation.errors.join("; ")}`);
  }

  await db.collection(COLLECTION).doc(runId).set(patch, { merge: true });
}

export async function getIngestRun(runId: string): Promise<IngestRun | null> {
  const db = getAdminFirestore();
  const doc = await db.collection(COLLECTION).doc(runId).get();
  if (!doc.exists) {
    return null;
  }

  const validation = validateIngestRun({ id: doc.id, ...doc.data() });
  return validation.success ? validation.data : null;
}
