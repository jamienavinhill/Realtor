import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import { listActiveListings } from "@/lib/repositories/listings";
import firebaseConfig from "@/config/firebase/client-config.json";

async function main() {
  getFirebaseAdminApp();
  const listings = await listActiveListings();
  const sample = listings.slice(0, 5).map((listing) => ({
    id: listing.id,
    title: listing.title,
    city: listing.city,
    price: listing.price,
    sourceProvider: listing.sourceProvider,
    ingestedAt: listing.ingestedAt,
    dedupeKey: listing.dedupeKey,
  }));

  console.log(
    JSON.stringify(
      {
        databaseId: firebaseConfig.firestoreDatabaseId,
        timestamp: new Date().toISOString(),
        totalActive: listings.length,
        sample,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
