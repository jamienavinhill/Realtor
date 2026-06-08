import type { ListingProperty, ProviderListingProperty } from "@/types/listings";
import { validateListingProperty } from "@/lib/schemas/listing";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "properties";

export interface ListingUpsertResult {
  id: string;
  dedupeKey: string;
  created: boolean;
}

export async function findListingByDedupeKey(dedupeKey: string): Promise<ListingProperty | null> {
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
  options?: { dryRun?: boolean; skipDedupeLookup?: boolean },
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
  const docId = validated.id;
  const now = new Date().toISOString();

  let existing: ListingProperty | null = null;
  if (!options?.skipDedupeLookup) {
    existing = await findListingByDedupeKey(validated.dedupeKey);
  }

  const payload: ListingProperty = {
    ...validated,
    id: existing?.id ?? docId,
    createdAt: existing?.createdAt ?? validated.createdAt ?? now,
    updatedAt: now,
    ingestedAt: validated.ingestedAt ?? now,
  };

  if (!options?.dryRun) {
    const docRef = db.collection(COLLECTION).doc(payload.id);
    const { createdAt, ...mergeFields } = payload;
    await docRef.set(mergeFields, { merge: true });
    if (!existing) {
      await docRef.set({ createdAt }, { merge: true });
    }
  }

  return {
    id: payload.id,
    dedupeKey: validated.dedupeKey,
    created: !existing,
  };
}

export async function upsertListings(
  listings: ListingProperty[],
  options?: { dryRun?: boolean; skipDedupeLookup?: boolean },
): Promise<{ upserted: number; created: number; skipped: number; errors: string[] }> {
  if (!options?.skipDedupeLookup || options?.dryRun) {
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

  const db = getAdminFirestore();
  const errors: string[] = [];
  let upserted = 0;
  const now = new Date().toISOString();
  const batchSize = 400;

  for (let index = 0; index < listings.length; index += batchSize) {
    const chunk = listings.slice(index, index + batchSize);
    const batch = db.batch();

    for (const listing of chunk) {
      try {
        const validation = validateListingProperty(listing);
        if (!validation.success) {
          throw new Error(validation.errors.join("; "));
        }

        const validated = validation.data;
        const docRef = db.collection(COLLECTION).doc(validated.id);
        const mergeFields = {
          ...validated,
          updatedAt: now,
          ingestedAt: validated.ingestedAt ?? now,
        };

        batch.set(docRef, mergeFields, { merge: true });
        if (validated.createdAt) {
          batch.set(docRef, { createdAt: validated.createdAt }, { merge: true });
        }
        upserted += 1;
      } catch (error) {
        errors.push(
          error instanceof Error
            ? `Listing ${listing.dedupeKey ?? listing.id}: ${error.message}`
            : `Listing ${listing.dedupeKey ?? listing.id}: unknown error`,
        );
      }
    }

    try {
      await batch.commit();
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Batch commit failed: ${error.message}`
          : "Batch commit failed: unknown error",
      );
    }
  }

  return { upserted, created: 0, skipped: listings.length - upserted, errors };
}

export async function listActiveListings(): Promise<ListingProperty[]> {
  const db = getAdminFirestore();
  const snapshot = await db.collection(COLLECTION).where("status", "==", "Active").get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ListingProperty);
}
