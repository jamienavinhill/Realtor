import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isAccountInviteStatus,
  isMemberRole,
  validateAccountInvite,
  validateAccountMember,
} from "@/lib/schemas/sharing";

describe("sharing schemas — AccountMember", () => {
  it("accepts a valid member and lower-cases the email", () => {
    const result = validateAccountMember({
      memberUid: "member-1",
      email: "Mother@Example.COM",
      role: "viewer",
      invitedAt: "2026-06-10T00:00:00.000Z",
      acceptedAt: "2026-06-10T00:05:00.000Z",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.email, "mother@example.com");
      assert.equal(result.data.role, "viewer");
      assert.equal(result.data.acceptedAt, "2026-06-10T00:05:00.000Z");
    }
  });

  it("rejects an invalid role", () => {
    const result = validateAccountMember({
      memberUid: "member-1",
      email: "a@b.co",
      role: "admin",
      invitedAt: "2026-06-10T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("rejects a malformed email", () => {
    const result = validateAccountMember({
      memberUid: "member-1",
      email: "not-an-email",
      role: "editor",
      invitedAt: "2026-06-10T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("rejects a missing memberUid", () => {
    const result = validateAccountMember({
      email: "a@b.co",
      role: "viewer",
      invitedAt: "2026-06-10T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });
});

describe("sharing schemas — AccountInvite", () => {
  const base = {
    token: "abc-DEF_123",
    ownerUid: "owner-1",
    email: "mother@example.com",
    role: "viewer" as const,
    status: "pending" as const,
    createdAt: "2026-06-10T00:00:00.000Z",
  };

  it("accepts a valid pending invite", () => {
    const result = validateAccountInvite(base);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.status, "pending");
    }
  });

  it("accepts an accepted invite with acceptedByUid", () => {
    const result = validateAccountInvite({
      ...base,
      status: "accepted",
      acceptedAt: "2026-06-10T01:00:00.000Z",
      acceptedByUid: "member-1",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.acceptedByUid, "member-1");
    }
  });

  it("rejects a token with whitespace / non-url-safe characters", () => {
    const result = validateAccountInvite({ ...base, token: "bad token!" });
    assert.equal(result.success, false);
  });

  it("rejects an invalid status", () => {
    const result = validateAccountInvite({ ...base, status: "expired" });
    assert.equal(result.success, false);
  });

  it("rejects an invalid role", () => {
    const result = validateAccountInvite({ ...base, role: "superuser" });
    assert.equal(result.success, false);
  });
});

describe("sharing schemas — type guards", () => {
  it("isMemberRole accepts viewer/editor only", () => {
    assert.equal(isMemberRole("viewer"), true);
    assert.equal(isMemberRole("editor"), true);
    assert.equal(isMemberRole("owner"), false);
    assert.equal(isMemberRole(2), false);
  });

  it("isAccountInviteStatus accepts the three statuses only", () => {
    assert.equal(isAccountInviteStatus("pending"), true);
    assert.equal(isAccountInviteStatus("accepted"), true);
    assert.equal(isAccountInviteStatus("revoked"), true);
    assert.equal(isAccountInviteStatus("cancelled"), false);
  });
});
