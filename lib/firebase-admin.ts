import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import firebaseConfig from "@/firebase-applet-config.json";

let adminApp: App | undefined;
let adminDb: Firestore | undefined;
let adminDbSettingsApplied = false;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function resolveCredentialsPath(): string {
  const raw = process.env.PATH_TO_FIREBASE_ADMIN_SDK ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (serverless) " +
        "or PATH_TO_FIREBASE_ADMIN_SDK / GOOGLE_APPLICATION_CREDENTIALS (local file path).",
    );
  }
  const stripped = stripQuotes(raw.trim());
  const repaired = stripped.includes("\r") ? stripped.replace(/\r/g, "\\r") : stripped;
  return resolve(repaired.replace(/\\/g, "/"));
}

// Prefer inline JSON (Vercel/serverless, where there is no writable file path);
// fall back to a local credentials file for Windows/local development.
function loadServiceAccount(): Record<string, unknown> {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    try {
      return JSON.parse(inlineJson) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const credentialsPath = resolveCredentialsPath();
  return JSON.parse(readFileSync(credentialsPath, "utf8")) as Record<string, unknown>;
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

  const serviceAccount = loadServiceAccount();

  adminApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });

  return adminApp;
}

export function getAdminFirestore(): Firestore {
  if (adminDb) {
    return adminDb;
  }

  const app = getFirebaseAdminApp();
  adminDb = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  if (!adminDbSettingsApplied) {
    adminDb.settings({ ignoreUndefinedProperties: true });
    adminDbSettingsApplied = true;
  }
  return adminDb;
}
