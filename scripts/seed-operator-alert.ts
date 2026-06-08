import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { PropertyAlert } from "@/types/listings";

async function main() {
  getFirebaseAdminApp();
  const auth = getAuth();
  const users = await auth.listUsers(10);
  const googleUser = users.users.find((user) =>
    user.providerData.some((provider) => provider.providerId === "google.com"),
  );

  if (!googleUser) {
    throw new Error("No Google-linked Firebase user found to attach alert");
  }

  const alert: PropertyAlert = {
    id: `alert-${googleUser.uid}-44224-stow`,
    userId: googleUser.uid,
    name: "44224 Stow Monitor",
    isActive: true,
    criteria: {
      city: "Stow",
      maxPrice: 450_000,
      beds: 3,
      baths: 2,
    },
    createdAt: new Date().toISOString(),
  };

  const db = getAdminFirestore();
  await db.collection("alerts").doc(alert.id).set(alert);
  console.log(JSON.stringify({ seeded: true, alertId: alert.id, userId: googleUser.uid }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
