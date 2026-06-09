import assert from "node:assert/strict";
import test from "node:test";
import {
  composeGmailQuery,
  DEFAULT_PLATFORM_SELECTION,
  LISTING_EMAIL_PLATFORMS,
  getPlatform,
} from "@/lib/gmail/platforms";

test("the five baseline platforms are present and flagged", () => {
  const baselineIds = LISTING_EMAIL_PLATFORMS.filter((p) => p.baseline).map((p) => p.id);
  assert.deepEqual(baselineIds, ["zillow", "trulia", "homes", "redfin", "realtor"]);
  assert.deepEqual(DEFAULT_PLATFORM_SELECTION, baselineIds);
});

test("composes a single platform clause", () => {
  const query = composeGmailQuery({ platformIds: ["redfin"] });
  assert.equal(query, '(from:redfin.com OR subject:"Redfin")');
});

test("OR-joins multiple platforms in stable catalog order regardless of selection order", () => {
  const a = composeGmailQuery({ platformIds: ["redfin", "zillow"] });
  const b = composeGmailQuery({ platformIds: ["zillow", "redfin"] });
  assert.equal(a, b);
  assert.equal(a, '(from:zillow.com OR subject:"Zillow") OR (from:redfin.com OR subject:"Redfin")');
});

test("dedupes repeated platform ids", () => {
  const query = composeGmailQuery({ platformIds: ["zillow", "zillow"] });
  assert.equal(query, '(from:zillow.com OR subject:"Zillow")');
});

test("ignores unknown platform ids", () => {
  const query = composeGmailQuery({ platformIds: ["zillow", "nope"] });
  assert.equal(query, '(from:zillow.com OR subject:"Zillow")');
  assert.equal(getPlatform("nope"), undefined);
});

test("ANDs a custom fragment onto a single (already-parenthesized) platform clause", () => {
  const query = composeGmailQuery({
    platformIds: ["zillow"],
    customQuery: "newer_than:7d",
  });
  assert.equal(query, '(from:zillow.com OR subject:"Zillow") newer_than:7d');
});

test("wraps a multi-platform OR-group in parens before ANDing the custom fragment", () => {
  const query = composeGmailQuery({
    platformIds: ["zillow", "redfin"],
    customQuery: "newer_than:7d",
  });
  assert.equal(
    query,
    '((from:zillow.com OR subject:"Zillow") OR (from:redfin.com OR subject:"Redfin")) newer_than:7d',
  );
});

test("custom fragment stands alone when no platforms are selected", () => {
  const query = composeGmailQuery({ platformIds: [], customQuery: 'subject:"price drop"' });
  assert.equal(query, 'subject:"price drop"');
});

test("empty selection with no custom fragment yields an empty query", () => {
  assert.equal(composeGmailQuery({ platformIds: [] }), "");
  assert.equal(composeGmailQuery({ platformIds: [], customQuery: "   " }), "");
});
