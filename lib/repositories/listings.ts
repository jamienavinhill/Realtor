import type { ListingProperty, ProviderListingProperty } from "@/types/listings";
import { validateListingProperty } from "@/lib/schemas/listing";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "properties";

export interface ListingUpsertResult {
  id: string;
  dedupeKey: string;
  created: boolean;
}

export async function findListingByDedupeKey(
  dedupeKey: string,
): Promise<ListingProperty | null> {
  const db = getAdminFirestore();
  const snapshot = await db
    .collection(COLLECTION)
    .where("dedupeKey", "==", dedupeKey)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() } as ListingProperty;
}

export async function upsertListing(
  listing: ListingProperty | ProviderListingProperty,
  options?: { dryRun?: boolean },
): Promise<ListingUpsertResult> {
  const validation = validateListingProperty(listing);
  if (!validation.success) {
    throw new Error(`Invalid listing payload: ${validation.errors.join("; ")}`);
  }

  const validated = validation.data;
  if (!validated.dedupeKey) {
    throw new Error(`Listing ${validated.id} is missing dedupeKey`);
  }

  const db = getAdminFirestore();
  const existing = await findListingByDedupeKey(validated.dedupeKey);
  const docId = existing?.id ?? validated.id;
  const now = new Date().toISOString();

  const payload: ListingProperty = {
    ...validated,
    id: docId,
    createdAt: existing?.createdAt ?? validated.createdAt ?? now,
    updatedAt: now,
    ingestedAt: validated.ingestedAt ?? now,
  };

  if (!options?.dryRun) {
    await db.collection(COLLECTION).doc(docId).set(payload, { merge: true });
  }

  return {
    id: docId,
    dedupeKey: validated.dedupeKey,
    created: !existing,
  };
}

export async function upsertListings(
  listings: ListingProperty[],
  options?: { dryRun?: boolean },
): Promise<{ upserted: number; created: number; skipped: number; errors: string[] }> {
  let upserted = 0;
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const listing of listings) {
    try {
      const result = await upsertListing(listing, options);
      upserted += 1;
      if (result.created) {
        created += 1;
      }
    } catch (error) {
      skipped += 1;
      errors.push(
        error instanceof Error
          ? `Listing ${listing.dedupeKey}: ${error.message}`
          : `Listing ${listing.dedupeKey}: unknown error`,
      );
    }
  }

  return { upserted, created, skipped, errors };
}

export async function listActiveListings(): Promise<ListingProperty[]> {
  const db = getAdminFirestore();
  const snapshot = await db
    .collection(COLLECTION)
    .where("status", "==", "Active")
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ListingProperty);
}