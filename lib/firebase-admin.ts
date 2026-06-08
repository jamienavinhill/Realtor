import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

let adminApp: App | undefined;
let adminDb: Firestore | undefined;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function resolveCredentialsPath(): string {
  const raw = process.env.PATH_TO_FIREBASE_ADMIN_SDK ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) {
    throw new Error(
      "Missing Firebase admin credentials path. Set PATH_TO_FIREBASE_ADMIN_SDK or GOOGLE_APPLICATION_CREDENTIALS.",
    );
  }
  const stripped = stripQuotes(raw.trim());
  const repaired = stripped.includes("\r") ? stripped.replace(/\r/g, "\\r") : stripped;
  return resolve(repaired.replace(/\\/g, "/"));
}

export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = JSON.parse(readFileSync(credentialsPath, "utf8"));

  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });

  return adminApp;
}

export function getAdminFirestore(): Firestore {
  if (adminDb) {
    return adminDb;
  }

  const app = getFirebaseAdminApp();
  adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  adminDb.settings({ ignoreUndefinedProperties: true });
  return adminDb;
}
