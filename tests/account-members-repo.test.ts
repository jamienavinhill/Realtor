import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roleAtOrBelow } from "@/lib/repositories/account-members";

/**
 * Pure-logic coverage for the account-members repository. The Firestore-touching paths
 * (createInvite/acceptInvite transaction, changeMemberRole, revokeInvite) are proven
 * end-to-end against the emulator in `tests/emulator/sharing-rules-emulator.test.ts` and
 * via the `/api/account/*` routes; this file covers the role-hierarchy helper used by the
 * "editor may manage at/below editor" gate.
 */
describe("account-members — roleAtOrBelow", () => {
  it("viewer is at or below viewer and editor", () => {
    assert.equal(roleAtOrBelow("viewer", "viewer"), true);
    assert.equal(roleAtOrBelow("viewer", "editor"), true);
  });

  it("editor is at or below editor but NOT below viewer", () => {
    assert.equal(roleAtOrBelow("editor", "editor"), true);
    assert.equal(roleAtOrBelow("editor", "viewer"), false);
  });
});
