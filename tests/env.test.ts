import assert from "node:assert/strict";
import test from "node:test";
import { collectRealtyApiKeys, validateServerEnv } from "@/lib/env";

test("collectRealtyApiKeys accepts comma-separated REALTY_API_KEYS", () => {
  const original = process.env.REALTY_API_KEYS;
  process.env.REALTY_API_KEYS = "rt_alpha123, rt_beta456";

  try {
    const keys = collectRealtyApiKeys("/nonexistent/.env");
    assert.equal(keys.length, 2);
    assert.equal(keys[0].key, "rt_alpha123");
    assert.equal(keys[1].key, "rt_beta456");
  } finally {
    if (original === undefined) {
      delete process.env.REALTY_API_KEYS;
    } else {
      process.env.REALTY_API_KEYS = original;
    }
  }
});

test("validateServerEnv returns actionable errors when required vars are missing", () => {
  const savedEnv = { ...process.env };
  const rtAliases = Object.keys(process.env).filter((key) => {
    const value = process.env[key];
    return typeof value === "string" && /^rt_[A-Za-z0-9]+$/.test(value.trim());
  });

  for (const key of [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "REALTY_API_KEYS",
    "INGEST_JOB_TOKEN",
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "PATH_TO_FIREBASE_ADMIN_SDK",
    "GOOGLE_APPLICATION_CREDENTIALS",
    ...rtAliases,
  ]) {
    delete process.env[key];
  }

  try {
    const result = validateServerEnv({ envFilePath: "/nonexistent/.env" });
    assert.equal(result.ok, false);
    assert.ok(result.errors.length >= 4);
    const combined = result.errors.join(" ");
    assert.match(combined, /GEMINI_API_KEY/);
    assert.match(combined, /RealtyAPI keys/);
    assert.match(combined, /INGEST_JOB_TOKEN/);
    assert.match(combined, /Firebase admin credentials/);
  } finally {
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
  }
});
