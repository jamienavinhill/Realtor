import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface RealtyApiKeyEntry {
  alias: string;
  key: string;
}

export interface ServerEnv {
  geminiApiKey: string;
  realtyApiKeys: RealtyApiKeyEntry[];
  ingestJobToken: string;
  /** Local file path to the Firebase admin service account (Windows/local dev). */
  firebaseAdminCredentialsPath?: string;
  /** Inline Firebase admin service account JSON (Vercel/serverless). */
  firebaseServiceAccountJson?: string;
  googleSearchApiKey?: string;
  googleSearchEngineId?: string;
}

const RT_KEY_PATTERN = /^rt_[A-Za-z0-9]+$/;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
}

function normalizeCredentialsPath(value: string): string {
  const stripped = stripQuotes(value.trim());
  // Dotenv on Windows can turn `\realtor` into a carriage return; recover common paths.
  const repaired = stripped.includes("\r") ? stripped.replace(/\r/g, "\\r") : stripped;
  return resolve(repaired.replace(/\\/g, "/"));
}

function collectRtKeysFromProcessEnv(): RealtyApiKeyEntry[] {
  const entries: RealtyApiKeyEntry[] = [];
  const seen = new Set<string>();

  for (const [alias, rawValue] of Object.entries(process.env)) {
    if (!rawValue) continue;
    const value = stripQuotes(rawValue.trim());
    if (!RT_KEY_PATTERN.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    entries.push({ alias, key: value });
  }

  return entries.sort((a, b) => a.alias.localeCompare(b.alias));
}

function collectRtKeysFromEnvFile(envPath: string): RealtyApiKeyEntry[] {
  if (!existsSync(envPath)) {
    return [];
  }

  const entries: RealtyApiKeyEntry[] = [];
  const seen = new Set<string>();
  const content = readFileSync(envPath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const alias = match[1];
    const value = stripQuotes(match[2].trim());
    if (!RT_KEY_PATTERN.test(value)) continue;
    if (seen.has(value)) continue;

    seen.add(value);
    entries.push({ alias, key: value });
  }

  return entries.sort((a, b) => a.alias.localeCompare(b.alias));
}

export function collectRealtyApiKeys(
  envFilePath = resolve(process.cwd(), ".env"),
): RealtyApiKeyEntry[] {
  const fromCommaSeparated = process.env.REALTY_API_KEYS?.split(",")
    .map((value) => stripQuotes(value.trim()))
    .filter((value) => RT_KEY_PATTERN.test(value));

  if (fromCommaSeparated && fromCommaSeparated.length > 0) {
    return fromCommaSeparated.map((key, index) => ({
      alias: `realty_key_${index + 1}`,
      key,
    }));
  }

  const fromProcess = collectRtKeysFromProcessEnv();
  if (fromProcess.length > 0) {
    return fromProcess;
  }

  return collectRtKeysFromEnvFile(envFilePath);
}

function requireNonEmpty(name: string, value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return stripQuotes(value.trim());
}

function collectServerEnvErrors(options?: { envFilePath?: string }): string[] {
  const envFilePath = options?.envFilePath ?? resolve(process.cwd(), ".env");
  const errors: string[] = [];

  const geminiRaw = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!geminiRaw?.trim()) {
    errors.push("Missing required environment variable: GEMINI_API_KEY");
  }

  if (collectRealtyApiKeys(envFilePath).length === 0) {
    errors.push(
      "Missing RealtyAPI keys. Set REALTY_API_KEYS or provide rt_ values in .env / process env.",
    );
  }

  if (!process.env.INGEST_JOB_TOKEN?.trim()) {
    errors.push("Missing required environment variable: INGEST_JOB_TOKEN");
  }

  const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineServiceAccount) {
    try {
      JSON.parse(inlineServiceAccount);
    } catch (error) {
      errors.push(
        `FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else {
    const pathRaw =
      process.env.PATH_TO_FIREBASE_ADMIN_SDK ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!pathRaw?.trim()) {
      errors.push(
        "Missing Firebase admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON (serverless) " +
          "or PATH_TO_FIREBASE_ADMIN_SDK / GOOGLE_APPLICATION_CREDENTIALS (local file path).",
      );
    } else {
      const credentialsPath = normalizeCredentialsPath(pathRaw);
      if (!existsSync(credentialsPath)) {
        errors.push(`Firebase admin credentials file not found at: ${credentialsPath}`);
      }
    }
  }

  return errors;
}

export function getServerEnv(options?: { envFilePath?: string }): ServerEnv {
  const envFilePath = options?.envFilePath ?? resolve(process.cwd(), ".env");

  const geminiApiKey = requireNonEmpty(
    "GEMINI_API_KEY",
    process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  );

  const realtyApiKeys = collectRealtyApiKeys(envFilePath);
  if (realtyApiKeys.length === 0) {
    throw new Error(
      "Missing RealtyAPI keys. Set REALTY_API_KEYS or provide rt_ values in .env / process env.",
    );
  }

  const ingestJobToken = requireNonEmpty("INGEST_JOB_TOKEN", process.env.INGEST_JOB_TOKEN);

  // Firebase admin credentials: prefer inline JSON (Vercel/serverless),
  // fall back to a local file path (Windows/local dev).
  const inlineServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  let firebaseAdminCredentialsPath: string | undefined;
  let firebaseServiceAccountJson: string | undefined;

  if (inlineServiceAccount) {
    try {
      JSON.parse(inlineServiceAccount);
    } catch (error) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    firebaseServiceAccountJson = inlineServiceAccount;
  } else {
    firebaseAdminCredentialsPath = normalizeCredentialsPath(
      requireNonEmpty(
        "FIREBASE_SERVICE_ACCOUNT_JSON, PATH_TO_FIREBASE_ADMIN_SDK, or GOOGLE_APPLICATION_CREDENTIALS",
        process.env.PATH_TO_FIREBASE_ADMIN_SDK ?? process.env.GOOGLE_APPLICATION_CREDENTIALS,
      ),
    );

    if (!existsSync(firebaseAdminCredentialsPath)) {
      throw new Error(
        `Firebase admin credentials file not found at: ${firebaseAdminCredentialsPath}`,
      );
    }
  }

  return {
    geminiApiKey,
    realtyApiKeys,
    ingestJobToken,
    firebaseAdminCredentialsPath,
    firebaseServiceAccountJson,
    googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY?.trim() || undefined,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || undefined,
  };
}

export function validateServerEnv(options?: { envFilePath?: string }): {
  ok: boolean;
  errors: string[];
  env?: ServerEnv;
} {
  const errors = collectServerEnvErrors(options);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const env = getServerEnv(options);
  return { ok: true, errors: [], env };
}
