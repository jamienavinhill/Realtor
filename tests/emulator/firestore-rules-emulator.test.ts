import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import firebaseConfig from "@/firebase-applet-config.json";

const RULES = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");
const PROJECT_ID = firebaseConfig.projectId;

let testEnv: RulesTestEnvironment;

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

  it("allows owner compareQueue and denies cross-user access", async () => {
    const owner = testEnv.authenticatedContext("owner-uid");
    const other = testEnv.authenticatedContext("other-uid");
    const ownerDb = owner.firestore();
    const otherDb = other.firestore();

    const queueRef = ownerDb
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("default");
    await assertSucceeds(
      queueRef.set({
        userId: "owner-uid",
        listingIds: ["a", "b"],
        updatedAt: new Date().toISOString(),
      }),
    );

    const otherRead = otherDb
      .collection("users")
      .doc("owner-uid")
      .collection("compareQueue")
      .doc("default");
    await assertFails(otherRead.get());
  });
});
