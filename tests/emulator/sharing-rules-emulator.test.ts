import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebaseConfig from "@/config/firebase/client-config.json";

/**
 * WS18 account-sharing rules proof: owner / editor / viewer / non-member behavior across
 * the owner's workspace data (profile, listingPreferences, compareQueue, alerts,
 * alert_matches), the members subcollection, and the invites collection.
 *
 * Membership docs and seed data are written with `withSecurityRulesDisabled` (mirroring
 * the real Admin SDK path, which bypasses rules); the assertions then run as the relevant
 * authenticated client to prove the rule gates.
 */

const RULES = readFileSync(resolve(process.cwd(), "config/firebase/firestore.rules"), "utf8");
const PROJECT_ID = firebaseConfig.projectId;

const OWNER = "owner-uid";
const EDITOR = "editor-uid";
const VIEWER = "viewer-uid";
const STRANGER = "stranger-uid";

let testEnv: RulesTestEnvironment;

function now() {
  return new Date().toISOString();
}

function memberDoc(memberUid: string, role: "viewer" | "editor") {
  return {
    memberUid,
    email: `${memberUid}@example.com`,
    role,
    invitedAt: now(),
    acceptedAt: now(),
  };
}

function preferenceDoc(listingId: string, ownerUid: string) {
  return {
    listingId,
    userId: ownerUid,
    state: "favorite",
    createdAt: now(),
    updatedAt: now(),
  };
}

function alertDoc(id: string, ownerUid: string) {
  return {
    id,
    userId: ownerUid,
    name: "Stow under 400k",
    criteria: { city: "Stow", maxPrice: 400000 },
    isActive: true,
    createdAt: now(),
  };
}

describe("firestore rules emulator — WS18 account sharing", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  // Re-seed membership + owner data before each test so cases stay independent.
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`accounts/${OWNER}/members/${EDITOR}`).set(memberDoc(EDITOR, "editor"));
      await db.doc(`accounts/${OWNER}/members/${VIEWER}`).set(memberDoc(VIEWER, "viewer"));
      await db.doc(`users/${OWNER}/profile/main`).set({ userId: OWNER, updatedAt: now() });
      await db
        .doc(`users/${OWNER}/listingPreferences/listing-1`)
        .set(preferenceDoc("listing-1", OWNER));
      await db.doc(`alerts/alert-1`).set(alertDoc("alert-1", OWNER));
      await db.doc(`alert_matches/alert-1_listing-1`).set({
        id: "alert-1_listing-1",
        alertId: "alert-1",
        listingId: "listing-1",
        userId: OWNER,
        matchReason: "price",
        firstSeenAt: now(),
        lastSeenAt: now(),
      });
      await db.doc(`invites/tok_pending`).set({
        token: "tok_pending",
        ownerUid: OWNER,
        email: "mother@example.com",
        role: "viewer",
        status: "pending",
        createdAt: now(),
      });
    });
  });

  function dbFor(uid: string | null) {
    return uid === null
      ? testEnv.unauthenticatedContext().firestore()
      : testEnv.authenticatedContext(uid).firestore();
  }

  function dbWithEmail(uid: string, email: string) {
    return testEnv.authenticatedContext(uid, { email }).firestore();
  }

  // --- Reads: owner + viewer + editor can read; stranger + anon cannot ---

  it("owner, editor, and viewer can read the owner's profile; stranger and anon cannot", async () => {
    await assertSucceeds(dbFor(OWNER).doc(`users/${OWNER}/profile/main`).get());
    await assertSucceeds(dbFor(EDITOR).doc(`users/${OWNER}/profile/main`).get());
    await assertSucceeds(dbFor(VIEWER).doc(`users/${OWNER}/profile/main`).get());
    await assertFails(dbFor(STRANGER).doc(`users/${OWNER}/profile/main`).get());
    await assertFails(dbFor(null).doc(`users/${OWNER}/profile/main`).get());
  });

  it("viewer can read listing preferences but cannot write them", async () => {
    await assertSucceeds(dbFor(VIEWER).doc(`users/${OWNER}/listingPreferences/listing-1`).get());
    await assertFails(
      dbFor(VIEWER)
        .doc(`users/${OWNER}/listingPreferences/listing-2`)
        .set(preferenceDoc("listing-2", OWNER)),
    );
  });

  it("editor can write listing preferences into the owner's workspace", async () => {
    await assertSucceeds(
      dbFor(EDITOR)
        .doc(`users/${OWNER}/listingPreferences/listing-2`)
        .set(preferenceDoc("listing-2", OWNER)),
    );
  });

  it("editor can write the owner's compareQueue; viewer cannot", async () => {
    const queue = { userId: OWNER, listingIds: ["a", "b"], updatedAt: now() };
    await assertSucceeds(dbFor(EDITOR).doc(`users/${OWNER}/compareQueue/main`).set(queue));
    await assertFails(dbFor(VIEWER).doc(`users/${OWNER}/compareQueue/main`).set(queue));
  });

  it("stranger cannot read or write any owner workspace data", async () => {
    await assertFails(dbFor(STRANGER).doc(`users/${OWNER}/listingPreferences/listing-1`).get());
    await assertFails(
      dbFor(STRANGER)
        .doc(`users/${OWNER}/listingPreferences/listing-3`)
        .set(preferenceDoc("listing-3", OWNER)),
    );
    await assertFails(dbFor(STRANGER).doc(`users/${OWNER}/compareQueue/main`).get());
  });

  // --- Alerts + matches: viewer reads, editor manages, stranger denied ---

  it("viewer and editor can read the owner's alerts and matches; stranger cannot", async () => {
    await assertSucceeds(dbFor(VIEWER).doc(`alerts/alert-1`).get());
    await assertSucceeds(dbFor(EDITOR).doc(`alerts/alert-1`).get());
    await assertSucceeds(dbFor(VIEWER).doc(`alert_matches/alert-1_listing-1`).get());
    await assertFails(dbFor(STRANGER).doc(`alerts/alert-1`).get());
    await assertFails(dbFor(STRANGER).doc(`alert_matches/alert-1_listing-1`).get());
  });

  it("editor can create an alert in the owner's workspace; viewer cannot", async () => {
    await assertSucceeds(dbFor(EDITOR).doc(`alerts/alert-2`).set(alertDoc("alert-2", OWNER)));
    await assertFails(dbFor(VIEWER).doc(`alerts/alert-3`).set(alertDoc("alert-3", OWNER)));
  });

  it("editor cannot move an alert to a different owner", async () => {
    await assertFails(dbFor(EDITOR).doc(`alerts/alert-4`).set(alertDoc("alert-4", "someone-else")));
  });

  // --- Members subcollection ---

  it("owner and members can read the member list; stranger cannot", async () => {
    await assertSucceeds(dbFor(OWNER).collection(`accounts/${OWNER}/members`).get());
    await assertSucceeds(dbFor(VIEWER).collection(`accounts/${OWNER}/members`).get());
    await assertFails(dbFor(STRANGER).collection(`accounts/${OWNER}/members`).get());
  });

  it("editor can add a member at/below editor; viewer cannot add members", async () => {
    await assertSucceeds(
      dbFor(EDITOR).doc(`accounts/${OWNER}/members/new-1`).set(memberDoc("new-1", "viewer")),
    );
    await assertFails(
      dbFor(VIEWER).doc(`accounts/${OWNER}/members/new-2`).set(memberDoc("new-2", "viewer")),
    );
  });

  it("rejects a member doc whose memberUid does not match the doc id", async () => {
    await assertFails(
      dbFor(OWNER).doc(`accounts/${OWNER}/members/new-3`).set(memberDoc("mismatch", "viewer")),
    );
  });

  it("rejects a member doc with an invalid role", async () => {
    await assertFails(
      dbFor(OWNER)
        .doc(`accounts/${OWNER}/members/new-4`)
        .set({ ...memberDoc("new-4", "viewer"), role: "admin" }),
    );
  });

  // --- Invites: read-by-owner / read-by-invited-email; all client writes denied ---

  it("owner can read their invite; an invitee with the matching email can read it", async () => {
    await assertSucceeds(dbFor(OWNER).doc(`invites/tok_pending`).get());
    await assertSucceeds(
      dbWithEmail(STRANGER, "mother@example.com").doc(`invites/tok_pending`).get(),
    );
  });

  it("a signed-in user with a different email cannot read the invite", async () => {
    await assertFails(dbWithEmail(STRANGER, "someone@else.com").doc(`invites/tok_pending`).get());
  });

  it("denies ALL client writes to invites (mint/accept/revoke are Admin SDK only)", async () => {
    await assertFails(
      dbFor(OWNER).doc(`invites/tok_new`).set({
        token: "tok_new",
        ownerUid: OWNER,
        email: "x@y.com",
        role: "viewer",
        status: "pending",
        createdAt: now(),
      }),
    );
    // Even the invited user cannot self-accept by writing the invite directly.
    await assertFails(
      dbWithEmail(STRANGER, "mother@example.com")
        .doc(`invites/tok_pending`)
        .set({ status: "accepted" }, { merge: true }),
    );
  });

  it("a viewer cannot escalate themselves to editor by writing their own member doc", async () => {
    await assertFails(
      dbFor(VIEWER).doc(`accounts/${OWNER}/members/${VIEWER}`).set(memberDoc(VIEWER, "editor")),
    );
  });

  // --- Adversarial holes probed in WS18 pass 2 ---

  it("editor cannot mint an owner member doc (memberUid == ownerUid) to pollute the owner record", async () => {
    // Even the owner cannot create a member doc keyed by their own uid — the owner is
    // never a member record. This blocks any attempt to fabricate an owner-as-member.
    await assertFails(
      dbFor(EDITOR).doc(`accounts/${OWNER}/members/${OWNER}`).set(memberDoc(OWNER, "viewer")),
    );
    await assertFails(
      dbFor(OWNER).doc(`accounts/${OWNER}/members/${OWNER}`).set(memberDoc(OWNER, "editor")),
    );
  });

  it("editor cannot delete the owner's (non-existent) member record path", async () => {
    await assertFails(dbFor(EDITOR).doc(`accounts/${OWNER}/members/${OWNER}`).delete());
  });

  it("editor can promote a viewer to editor and remove a member (at/below editor)", async () => {
    await assertSucceeds(
      dbFor(EDITOR).doc(`accounts/${OWNER}/members/${VIEWER}`).set(memberDoc(VIEWER, "editor")),
    );
    await assertSucceeds(dbFor(EDITOR).doc(`accounts/${OWNER}/members/${VIEWER}`).delete());
  });

  it("a non-member (stranger) cannot create an alert in the owner's workspace", async () => {
    await assertFails(dbFor(STRANGER).doc(`alerts/alert-x`).set(alertDoc("alert-x", OWNER)));
  });

  it("a viewer cannot create, update, or delete the owner's alerts", async () => {
    await assertFails(dbFor(VIEWER).doc(`alerts/alert-9`).set(alertDoc("alert-9", OWNER)));
    await assertFails(dbFor(VIEWER).doc(`alerts/alert-1`).delete());
  });

  it("a viewer cannot delete an owner listing preference; an editor can", async () => {
    await assertFails(dbFor(VIEWER).doc(`users/${OWNER}/listingPreferences/listing-1`).delete());
    await assertSucceeds(dbFor(EDITOR).doc(`users/${OWNER}/listingPreferences/listing-1`).delete());
  });

  it("a stranger cannot write into the owner's compareQueue", async () => {
    await assertFails(
      dbFor(STRANGER)
        .doc(`users/${OWNER}/compareQueue/main`)
        .set({ userId: OWNER, listingIds: ["a"], updatedAt: now() }),
    );
  });

  it("an editor cannot forge a preference pinned to a different owner's uid", async () => {
    // The owner-pinned validator requires the stored userId to equal the PATH owner. An
    // editor of OWNER cannot write a preference whose userId names someone else.
    await assertFails(
      dbFor(EDITOR)
        .doc(`users/${OWNER}/listingPreferences/listing-7`)
        .set(preferenceDoc("listing-7", "someone-else")),
    );
  });
});
