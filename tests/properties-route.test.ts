import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { handlePropertiesPost, type PropertiesRouteDeps } from "@/lib/api/properties-handler";
import type { ListingProperty, ProviderListingProperty } from "@/types/listings";

// Route-level integration coverage for POST /api/properties (WS16 pass 2). Every external
// dependency — Firebase ID-token verification and the Admin-SDK listing repository — is
// injected as an in-memory fake, so this suite makes ZERO live Firebase calls and runs
// inside the standard `npm run test` gate (no emulator, no flags). It asserts the auth
// floor (a verified ID token is required) and the normalize→upsert→delete contract.

const VALID_ID_TOKEN = "valid-id-token";

interface Recorder {
  verified: string[];
  upserted: (ListingProperty | ProviderListingProperty)[];
  deleted: string[];
}

function makeDeps(rec: Recorder, opts: { upsertThrows?: boolean } = {}): PropertiesRouteDeps {
  return {
    verifyIdToken: async (idToken: string) => {
      rec.verified.push(idToken);
      // A real Admin SDK rejects any token it cannot verify; the fake mirrors that by
      // only accepting the single known-good token and throwing on everything else.
      if (idToken !== VALID_ID_TOKEN) {
        throw new Error("Firebase ID token has invalid signature");
      }
      return { uid: "user-123" };
    },
    upsertListing: async (listing) => {
      if (opts.upsertThrows) {
        throw new Error("Invalid listing payload: simulated repository rejection");
      }
      rec.upserted.push(listing);
      return { id: listing.id, dedupeKey: listing.dedupeKey ?? "x", created: true };
    },
    deleteListing: async (listingId: string) => {
      rec.deleted.push(listingId);
    },
  };
}

function newRecorder(): Recorder {
  return { verified: [], upserted: [], deleted: [] };
}

function propertiesRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://app.test/api/properties", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** A valid manual-listing payload the server normalizer will accept. */
function validListingInput() {
  return {
    id: "prop_pasted_test",
    title: "Renovated Colonial",
    address: "123 Maple Ave",
    city: "Stow",
    state: "OH",
    zipCode: "44224",
    price: 325000,
    beds: 4,
    baths: 2.5,
    sqft: 2400,
    propertyType: "single family",
    description: "Updated kitchen",
    imageUrl: "https://example.com/photo.jpg",
  };
}

// --- commit: auth required ---------------------------------------------------

test("commit: 401 when no Firebase ID token is supplied", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest({ action: "commit", listings: [validListingInput()] }),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Sign in to commit/i);
  assert.equal(rec.upserted.length, 0, "no upsert may happen without auth");
  assert.equal(rec.verified.length, 0, "no token => verifier is never reached");
});

test("commit: 401 when the Firebase ID token is invalid (verifier throws)", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "commit", listings: [validListingInput()] },
      { Authorization: "Bearer not-a-real-token" },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Invalid Firebase ID token/i);
  assert.deepEqual(rec.verified, ["not-a-real-token"], "the verifier was invoked and rejected");
  assert.equal(rec.upserted.length, 0, "an invalid token must not reach the repository");
});

// --- commit: happy path ------------------------------------------------------

test("commit: normalize -> upsert happy path with a valid ID token", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "commit", origin: "manual_paste", listings: [validListingInput()] },
      { Authorization: `Bearer ${VALID_ID_TOKEN}` },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.committedCount, 1);
  assert.equal(body.rejectedCount, 0);
  assert.equal(rec.upserted.length, 1, "exactly one listing was written");

  // The server re-provenances the listing — the client cannot set these.
  const written = rec.upserted[0] as ProviderListingProperty;
  assert.equal(written.source, "manual_paste");
  assert.equal(written.sourceProvider, "manual:paste");
  assert.ok(written.dedupeKey && written.dedupeKey.startsWith("manual:"));
  assert.ok(written.rawHash && written.rawHash.length === 64);
  // The route returns the server-normalized listing so the client reflects stored shape.
  assert.equal(body.properties[0].source, "manual_paste");
});

test("commit: a junk listing is rejected (400) and never upserted", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      // Missing every required field -> the server normalizer rejects it.
      { action: "commit", listings: [{ title: "x" }] },
      { Authorization: `Bearer ${VALID_ID_TOKEN}` },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /No listings could be committed/i);
  assert.ok(Array.isArray(body.rejected) && body.rejected.length === 1);
  assert.equal(rec.upserted.length, 0);
});

test("commit: 400 when the listings array is empty", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "commit", listings: [] },
      { Authorization: `Bearer ${VALID_ID_TOKEN}` },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /No listings provided/i);
});

// --- delete_listing ----------------------------------------------------------

test("delete_listing: 401 without a Firebase ID token", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest({ action: "delete_listing", listingId: "prop_abc" }),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  assert.equal(rec.deleted.length, 0, "no delete may happen without auth");
});

test("delete_listing: happy path deletes via the Admin-SDK repository", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "delete_listing", listingId: "prop_abc" },
      { Authorization: `Bearer ${VALID_ID_TOKEN}` },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.listingId, "prop_abc");
  assert.deepEqual(rec.deleted, ["prop_abc"]);
});

test("delete_listing: 400 for a malformed listingId (path-injection attempt)", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "delete_listing", listingId: "../../etc/passwd" },
      { Authorization: `Bearer ${VALID_ID_TOKEN}` },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 400);
  assert.equal(rec.deleted.length, 0, "a malformed id must never reach the repository");
});

// --- extraction actions now require a verified ID token (WS16 pass 2) --------

test("parse_raw_text: 401 without a Firebase ID token (extraction is gated)", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest({ action: "parse_raw_text", text: "3bd home in Stow" }),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Sign in to parse listing text/i);
  // The Gemini client must never be constructed for an unauthenticated caller, so the
  // 401 must fire before the GEMINI_API_KEY check (no 500 about a missing key).
  assert.notEqual(res.status, 500);
});

test("parse_gmail: 401 without the X-Firebase-Id-Token header (extraction is gated)", async () => {
  const rec = newRecorder();
  // Even WITH a Google access token in Authorization, the Firebase ID token is required.
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "parse_gmail", query: "subject:Redfin", maxResults: 3 },
      { Authorization: "Bearer google-access-token" },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Sign in to scan Gmail/i);
});

test("parse_gmail: 401 when the X-Firebase-Id-Token is present but invalid", async () => {
  const rec = newRecorder();
  const res = await handlePropertiesPost(
    propertiesRequest(
      { action: "parse_gmail", query: "subject:Redfin" },
      { Authorization: "Bearer google-access-token", "X-Firebase-Id-Token": "forged" },
    ),
    makeDeps(rec),
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /Invalid Firebase ID token/i);
  assert.deepEqual(rec.verified, ["forged"], "the ID-token header was verified and rejected");
});
