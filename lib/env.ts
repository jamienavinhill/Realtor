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
  firebaseAdminCredentialsPath: string;
  googleSearchApiKey?: string;
  googleSearchEngineId?: string;
}

const RT_KEY_PATTERN = /^rt_[A-Za-z0-9]+$/;

function stripQuotes(value: string): string {
  return value.replace(/^["']|["']$/g, "");
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

export function collectRealtyApiKeys(envFilePath = resolve(process.cwd(), ".env")): RealtyApiKeyEntry[] {
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

  const firebaseAdminCredentialsPath = requireNonEmpty(
    "PATH_TO_FIREBASE_ADMIN_SDK or GOOGLE_APPLICATION_CREDENTIALS",
    process.env.PATH_TO_FIREBASE_ADMIN_SDK ?? process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );

  if (!existsSync(firebaseAdminCredentialsPath)) {
    throw new Error(
      `Firebase admin credentials file not found at: ${firebaseAdminCredentialsPath}`,
    );
  }

  return {
    geminiApiKey,
    realtyApiKeys,
    ingestJobToken,
    firebaseAdminCredentialsPath,
    googleSearchApiKey: process.env.GOOGLE_SEARCH_API_KEY?.trim() || undefined,
    googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || undefined,
  };
}

export function validateServerEnv(options?: { envFilePath?: string }): {
  ok: boolean;
  errors: string[];
  env?: ServerEnv;
} {
  try {
    const env = getServerEnv(options);
    return { ok: true, errors: [], env };
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}