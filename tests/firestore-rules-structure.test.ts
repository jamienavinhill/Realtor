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

  it("makes the shared properties catalog server-write-only (WS16)", () => {
    // The browser must not create/update/delete shared listing state; all writes go
    // through the Admin SDK (ingestion + /api/properties commit/delete routes).
    assert.match(
      rules,
      /match \/properties\/\{propertyId\} \{[\s\S]*?allow create, update, delete: if false;/,
    );
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

  // --- WS18: account sharing ---

  it("defines the account members and invites collections", () => {
    assert.match(rules, /match \/accounts\/\{ownerUid\}\/members\/\{memberUid\}/);
    assert.match(rules, /match \/invites\/\{token\}/);
  });

  it("defines membership helpers (read/edit workspace gates)", () => {
    assert.match(rules, /function canReadWorkspace\(ownerUid\)/);
    assert.match(rules, /function canEditWorkspace\(ownerUid\)/);
    assert.match(rules, /function memberRole\(ownerUid\)/);
    assert.match(rules, /memberRole\(ownerUid\) == 'editor'/);
  });

  it("keeps invite client-writes denied (server/Admin SDK mints/accepts/revokes)", () => {
    assert.match(
      rules,
      /match \/invites\/\{token\} \{[\s\S]*?allow create, update, delete: if false;/,
    );
  });

  it("gates the owner profile, preferences, and compare queue on workspace membership", () => {
    assert.match(rules, /match \/users\/\{userId\}\/profile\/\{profileId\}/);
    assert.match(rules, /allow list, get: if canReadWorkspace\(userId\);/);
    assert.match(rules, /allow create, update: if canEditWorkspace\(userId\)/);
  });

  it("lets only the owner delete the profile", () => {
    assert.match(
      rules,
      /match \/users\/\{userId\}\/profile\/\{profileId\} \{[\s\S]*?allow delete: if isOwner\(userId\)/,
    );
  });

  it("opens alert/alert_matches reads to workspace members", () => {
    assert.match(rules, /canReadWorkspace\(existing\(\)\.userId\)/);
  });

  it("keeps gmailSync and provider_quota server-only after the sharing rewrite", () => {
    assert.match(
      rules,
      /match \/users\/\{userId\}\/gmailSync\/\{docId\} \{[\s\S]*?allow read, write: if false;/,
    );
    assert.match(rules, /match \/provider_quota\/\{month\} \{[\s\S]*?allow read, write: if false;/);
  });
});
