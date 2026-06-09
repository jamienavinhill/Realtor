import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const RULES_PATH = resolve(process.cwd(), "firestore.rules");

describe("firestore rules structure", () => {
  const rules = readFileSync(RULES_PATH, "utf8");

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
