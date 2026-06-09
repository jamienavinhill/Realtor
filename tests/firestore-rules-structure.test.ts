import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const RULES_PATH = resolve(process.cwd(), "config/firebase/firestore.rules");

describe("firestore rules structure", () => {
  const rules = readFileSync(RULES_PATH, "utf8");

  it("denies by default with a global catch-all", () => {
    assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });

  it("keeps properties public for read", () => {
    assert.match(rules, /match \/properties\/\{propertyId\} \{\s*allow list, get: if true;/);
  });

  it("scopes alerts and alert_matches to the owner", () => {
    assert.match(rules, /match \/alerts\/\{alertId\}/);
    assert.match(rules, /match \/alert_matches\/\{matchId\}/);
    assert.match(rules, /existing\(\)\.userId == request\.auth\.uid/);
  });

  it("keeps ingest_runs and provider_quota server-only", () => {
    assert.match(
      rules,
      /match \/ingest_runs\/\{runId\} \{\s*\/\/[^\n]*\n\s*allow read, write: if false;/,
    );
    assert.match(
      rules,
      /match \/provider_quota\/\{month\} \{\s*\/\/[^\n]*\n\s*allow read, write: if false;/,
    );
  });

  it("defines own-only listing preference paths", () => {
    assert.match(rules, /match \/users\/\{userId\}\/listingPreferences\/\{listingId\}/);
    assert.match(rules, /isOwner\(userId\)/);
    assert.match(rules, /isValidListingPreference/);
  });

  it("defines own-only compare queue path with max 4 listings", () => {
    assert.match(rules, /match \/users\/\{userId\}\/compareQueue/);
    assert.match(rules, /isValidCompareQueue/);
    assert.match(rules, /listingIds\.size\(\) <= 4/);
  });

  it("requires preference userId to match auth uid", () => {
    assert.match(rules, /data\.userId == request\.auth\.uid/);
  });
});
