import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canWriteWorkspace,
  isViewingOtherWorkspace,
  resolveActiveOwnerUid,
} from "@/lib/account/active-workspace";

/**
 * WS18 pass 2: the dashboard routes its per-user listeners/writes through the ACTIVE
 * workspace owner uid (default = own uid; or a workspace the user is a member of) and
 * disables mutation for viewers. These pure helpers carry that decision so the client
 * reads/writes the right owner's data and a viewer stays read-only.
 */
describe("active workspace resolution (WS18 pass 2)", () => {
  it("defaults the active owner to the user's own uid when nothing is selected", () => {
    assert.equal(resolveActiveOwnerUid("me", ""), "me");
    assert.equal(resolveActiveOwnerUid("me", null), "me");
    assert.equal(resolveActiveOwnerUid("me", undefined), "me");
  });

  it("targets the selected workspace owner when a member switches workspaces", () => {
    assert.equal(resolveActiveOwnerUid("me", "owner-123"), "owner-123");
  });

  it("returns an empty string when signed out so listeners stay idle", () => {
    assert.equal(resolveActiveOwnerUid(null, "owner-123"), "");
    assert.equal(resolveActiveOwnerUid(undefined, undefined), "");
  });

  it("permits writes for owner and editor, denies them for viewer", () => {
    assert.equal(canWriteWorkspace("owner"), true);
    assert.equal(canWriteWorkspace("editor"), true);
    assert.equal(canWriteWorkspace("viewer"), false);
  });

  it("detects when the active workspace belongs to someone else", () => {
    assert.equal(isViewingOtherWorkspace("me", "owner-123"), true);
    assert.equal(isViewingOtherWorkspace("me", "me"), false);
    assert.equal(isViewingOtherWorkspace(null, "owner-123"), false);
    assert.equal(isViewingOtherWorkspace("me", ""), false);
  });
});
