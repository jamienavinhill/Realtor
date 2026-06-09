import type { CompareQueue, ListingUserPreference, ListingUserState } from "@/types/listings";
import { COMPARE_QUEUE_DOC_ID, MAX_COMPARE_LISTINGS } from "@/types/listings";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  validateCompareQueue,
  validateListingUserPreference,
} from "@/lib/schemas/listing-preferences";

function preferencesPath(userId: string, listingId: string): string {
  return `users/${userId}/listingPreferences/${listingId}`;
}

function compareQueuePath(userId: string): string {
  return `users/${userId}/compareQueue/${COMPARE_QUEUE_DOC_ID}`;
}

export async function getListingPreference(
  userId: string,
  listingId: string,
): Promise<ListingUserPreference | null> {
  const db = getAdminFirestore();
  const doc = await db.doc(preferencesPath(userId, listingId)).get();
  if (!doc.exists) {
    return null;
  }

  const validation = validateListingUserPreference({ listingId, ...doc.data() });
  return validation.success ? validation.data : null;
}

export async function listListingPreferences(userId: string): Promise<ListingUserPreference[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(`users/${userId}/listingPreferences`).get();
  const preferences: ListingUserPreference[] = [];

  for (const doc of snapshot.docs) {
    const validation = validateListingUserPreference({ listingId: doc.id, ...doc.data() });
    if (validation.success) {
      preferences.push(validation.data);
    }
  }

  return preferences;
}

export async function upsertListingPreference(
  userId: string,
  listingId: string,
  state: ListingUserState,
  note?: string,
): Promise<ListingUserPreference> {
  const db = getAdminFirestore();
  const ref = db.doc(preferencesPath(userId, listingId));
  const existing = await ref.get();
  const now = new Date().toISOString();

  const record: ListingUserPreference = {
    listingId,
    userId,
    state,
    createdAt: existing.exists ? ((existing.data()?.createdAt as string) ?? now) : now,
    updatedAt: now,
  };
  if (typeof note === "string") {
    record.note = note;
  }

  const validation = validateListingUserPreference(record);
  if (!validation.success) {
    throw new Error(validation.errors.join("; "));
  }

  await ref.set(validation.data);
  return validation.data;
}

export async function deleteListingPreference(userId: string, listingId: string): Promise<void> {
  const db = getAdminFirestore();
  await db.doc(preferencesPath(userId, listingId)).delete();
}

export async function getCompareQueue(userId: string): Promise<CompareQueue> {
  const db = getAdminFirestore();
  const doc = await db.doc(compareQueuePath(userId)).get();
  if (!doc.exists) {
    return { userId, listingIds: [], updatedAt: new Date().toISOString() };
  }

  const validation = validateCompareQueue({ userId, ...doc.data() });
  return validation.success
    ? validation.data
    : { userId, listingIds: [], updatedAt: new Date().toISOString() };
}

export async function setCompareQueue(userId: string, listingIds: string[]): Promise<CompareQueue> {
  if (listingIds.length > MAX_COMPARE_LISTINGS) {
    throw new Error(`Compare queue supports at most ${MAX_COMPARE_LISTINGS} listings`);
  }

  const record: CompareQueue = {
    userId,
    listingIds,
    updatedAt: new Date().toISOString(),
  };

  const validation = validateCompareQueue(record);
  if (!validation.success) {
    throw new Error(validation.errors.join("; "));
  }

  const db = getAdminFirestore();
  await db.doc(compareQueuePath(userId)).set(validation.data);
  return validation.data;
}

export async function addToCompareQueue(userId: string, listingId: string): Promise<CompareQueue> {
  const current = await getCompareQueue(userId);
  if (current.listingIds.includes(listingId)) {
    return current;
  }
  if (current.listingIds.length >= MAX_COMPARE_LISTINGS) {
    throw new Error(`Compare queue is full (max ${MAX_COMPARE_LISTINGS})`);
  }
  return setCompareQueue(userId, [...current.listingIds, listingId]);
}

export async function removeFromCompareQueue(
  userId: string,
  listingId: string,
): Promise<CompareQueue> {
  const current = await getCompareQueue(userId);
  return setCompareQueue(
    userId,
    current.listingIds.filter((id) => id !== listingId),
  );
}
