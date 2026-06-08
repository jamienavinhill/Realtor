import type { PropertyAlert } from "@/types/listings";
import { validatePropertyAlert } from "@/lib/schemas/alert";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "alerts";

export async function listActiveAlerts(): Promise<PropertyAlert[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(COLLECTION).where("isActive", "==", true).get();

  const alerts: PropertyAlert[] = [];
  for (const doc of snapshot.docs) {
    const candidate = { id: doc.id, ...doc.data() };
    const validation = validatePropertyAlert(candidate);
    if (validation.success) {
      alerts.push(validation.data);
    }
  }

  return alerts;
}

export async function getAlertById(alertId: string): Promise<PropertyAlert | null> {
  const db = getAdminFirestore();
  const doc = await db.collection(COLLECTION).doc(alertId).get();
  if (!doc.exists) {
    return null;
  }

  const validation = validatePropertyAlert({ id: doc.id, ...doc.data() });
  return validation.success ? validation.data : null;
}