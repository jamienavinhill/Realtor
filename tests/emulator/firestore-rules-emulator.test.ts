import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebaseConfig from "@/config/firebase/client-config.json";

const RULES = readFileSync(resolve(process.cwd(), "config/firebase/firestore.rules"), "utf8");
const PROJECT_ID = firebaseConfig.projectId;

let testEnv: RulesTestEnvironment;

function propertyDoc(id: string) {
  const now = new Date().toISOString();
  return {
    id,
    title: "Test Listing",
    address: "1 Test St",
    city: "Stow",
    state: "OH",
    zipCode: "44224",
    price: 250000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    propertyType: "Single Family",
    status: "Active",
    imageUrl: "",
    createdAt: now,
    updatedAt: now,
  };
}

describe("firestore rules emulator — properties catalog is server-write-only (WS16)", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("allows public (signed-out) read of a property", async () => {
    // Seed via the privileged context (bypasses rules), then read unauthenticated.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("properties")
        .doc("prop-public")
        .set(propertyDoc("prop-public"));
    });

    const anon = testEnv.unauthenticatedContext();
    await assertSucceeds(anon.firestore().collection("properties").doc("prop-public").get());
  });

  it("allows a signed-in user to read a property", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("properties").doc("prop-read").set(propertyDoc("prop-read"));
    });

    const user = testEnv.authenticatedContext("reader-uid");
    await assertSucceeds(user.firestore().collection("properties").doc("prop-read").get());
  });

  it("DENIES a signed-in client creating a property (server-only write)", async () => {
    const user = testEnv.authenticatedContext("writer-uid");
    await assertFails(
      user.firestore().collection("properties").doc("prop-create").set(propertyDoc("prop-create")),
    );
  });

  it("DENIES a signed-in client updating a property (server-only write)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("properties")
        .doc("prop-update")
        .set(propertyDoc("prop-update"));
    });

    const user = testEnv.authenticatedContext("writer-uid");
    await assertFails(
      user
        .firestore()
        .collection("properties")
        .doc("prop-update")
        .set({ ...propertyDoc("prop-update"), price: 999999 }),
    );
  });

  it("DENIES a signed-in client deleting a property (server-only write)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx
        .firestore()
        .collection("properties")
        .doc("prop-delete")
        .set(propertyDoc("prop-delete"));
    });

    const user = testEnv.authenticatedContext("writer-uid");
    await assertFails(user.firestore().collection("properties").doc("prop-delete").delete());
  });

  it("DENIES an unauthenticated client creating a property", async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(
      anon.firestore().collection("properties").doc("prop-anon").set(propertyDoc("prop-anon")),
    );
  });
});

function preferenceDoc(listingId: string, userId: string) {
  const now = new Date().toISOString();
  return {
    listingId,
    userId,
    state: "favorite",
    createdAt: now,
    updatedAt: now,
  };
}

describe("firestore rules emulator — listing preferences own-only", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { rules: RULES, host: "127.0.0.1", port: 8080 },
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("allows owner read/write on listingPreferences", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const db = owner.firestore();
    const ref = db
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-1");

    await assertSucceeds(ref.set(preferenceDoc("listing-1", "owner-uid")));
    await assertSucceeds(ref.get());
  });

  it("denies other user read/write on listingPreferences", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const other = testEnv.authenticatedContext("other-uid");
    const ownerDb = owner.firestore();
    const otherDb = other.firestore();

    const ownerRef = ownerDb
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-1");
    await assertSucceeds(ownerRef.set(preferenceDoc("listing-1", "owner-uid")));

    const otherRead = otherDb
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-1");
    await assertFails(otherRead.get());

    const otherWrite = otherDb
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-2");
    await assertFails(otherWrite.set(preferenceDoc("listing-2", "other-uid")));
  });

  it("allows an owner note on a listing preference", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const ref = owner
      .firestore()
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-note");

    await assertSucceeds(
      ref.set({ ...preferenceDoc("listing-note", "owner-uid"), note: "Great backyard" }),
    );
  });

  it("denies a listing preference whose userId does not match the path/auth", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const ref = owner
      .firestore()
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-spoof");

    await assertFails(ref.set(preferenceDoc("listing-spoof", "someone-else")));
  });

  it("denies a listing preference whose body listingId does not match the doc id", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const ref = owner
      .firestore()
      .collection("users")
      .doc("owner-uid")
      .collection("listingPreferences")
      .doc("listing-path");

    await assertFails(ref.set(preferenceDoc("listing-different", "owner-uid")));
  });

  it("allows owner compareQueue and denies cross-user access", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const other = testEnv.authenticatedContext("other-uid");
    const ownerDb = owner.firestore();
    const otherDb = other.firestore();

    const queueRef = ownerDb
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("main");
    await assertSucceeds(
      queueRef.set({
        userId: "owner-uid",
        listingIds: ["a", "b", "c", "d"],
        updatedAt: new Date().toISOString(),
      }),
    );
    await assertSucceeds(queueRef.get());

    const otherRead = otherDb
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("main");
    await assertFails(otherRead.get());

    const otherWrite = otherDb
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("main");
    await assertFails(
      otherWrite.set({
        userId: "owner-uid",
        listingIds: ["a"],
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it("denies a compareQueue write over the max of 4 listings", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const queueRef = owner
      .firestore()
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("main");

    await assertFails(
      queueRef.set({
        userId: "owner-uid",
        listingIds: ["a", "b", "c", "d", "e"],
        updatedAt: new Date().toISOString(),
      }),
    );
  });

  it("denies ALL client access to gmailSync — even the owner (server-only; protects the encrypted refresh token)", async () => {
    // WS7 invariant: `users/{uid}/gmailSync/main` holds the AES-GCM-encrypted Google
    // refresh token + watch cursor. The pipeline reads/writes it ONLY via the Admin SDK
    // (which bypasses rules). The owner's own authenticated client must be denied read
    // AND write, so the refresh token can never reach the browser.
    const owner = testEnv.authenticatedContext("owner-uid");
    const ref = owner
      .firestore()
      .collection("users")
      .doc("owner-uid")
      .collection("gmailSync")
      .doc("main");

    await assertFails(ref.get());
    await assertFails(
      ref.set({
        uid: "owner-uid",
        platformSelection: ["zillow"],
        updatedAt: new Date().toISOString(),
      }),
    );
  });
});
