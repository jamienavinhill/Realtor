import type { AlertMatch } from "@/types/listings";
import { validateAlertMatch } from "@/lib/schemas/alert";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "alert_matches";

export function buildAlertMatchId(alertId: string, listingId: string): string {
  return `${alertId}_${listingId}`;
}

export async function upsertAlertMatch(
  match: AlertMatch,
  options?: { dryRun?: boolean },
): Promise<{ created: boolean }> {
  const validation = validateAlertMatch(match);
  if (!validation.success) {
    throw new Error(`Invalid alert match: ${validation.errors.join("; ")}`);
  }

  const db = getAdminFirestore();
  const docRef = db.collection(COLLECTION).doc(validation.data.id);
  const existing = await docRef.get();
  const now = new Date().toISOString();

  const payload: AlertMatch = {
    ...validation.data,
    firstSeenAt: existing.exists
      ? ((existing.data()?.firstSeenAt as string) ?? validation.data.firstSeenAt)
      : validation.data.firstSeenAt,
    lastSeenAt: now,
  };

  if (!options?.dryRun) {
    await docRef.set(payload, { merge: true });
  }

  return { created: !existing.exists };
}

export async function listAlertMatchesForUser(userId: string): Promise<AlertMatch[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(COLLECTION).where("userId", "==", userId).get();

  const matches: AlertMatch[] = [];
  for (const doc of snapshot.docs) {
    const validation = validateAlertMatch({ id: doc.id, ...doc.data() });
    if (validation.success) {
      matches.push(validation.data);
    }
  }

  return matches;
}