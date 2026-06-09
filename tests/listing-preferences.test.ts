import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCompareQueue,
  validateListingUserPreference,
} from "@/lib/schemas/listing-preferences";
import { MAX_COMPARE_LISTINGS } from "@/types/listings";

describe("listing preference schemas", () => {
  it("accepts a valid listing preference", () => {
    const result = validateListingUserPreference({
      listingId: "listing-1",
      userId: "user-1",
      state: "favorite",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.state, "favorite");
    }
  });

  it("accepts an optional note and round-trips it", () => {
    const result = validateListingUserPreference({
      listingId: "listing-1",
      userId: "user-1",
      state: "interested",
      note: "Walk-through scheduled",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.note, "Walk-through scheduled");
    }
  });

  it("rejects a non-string note", () => {
    const result = validateListingUserPreference({
      listingId: "listing-1",
      userId: "user-1",
      state: "interested",
      note: 42,
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("rejects invalid listing preference state", () => {
    const result = validateListingUserPreference({
      listingId: "listing-1",
      userId: "user-1",
      state: "maybe",
      createdAt: "2026-06-09T00:00:00.000Z",
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });

  it("accepts compare queue up to max listings", () => {
    const listingIds = Array.from({ length: MAX_COMPARE_LISTINGS }, (_, i) => `id-${i}`);
    const result = validateCompareQueue({
      userId: "user-1",
      listingIds,
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, true);
  });

  it("rejects compare queue over max listings", () => {
    const listingIds = Array.from({ length: MAX_COMPARE_LISTINGS + 1 }, (_, i) => `id-${i}`);
    const result = validateCompareQueue({
      userId: "user-1",
      listingIds,
      updatedAt: "2026-06-09T00:00:00.000Z",
    });
    assert.equal(result.success, false);
  });
});
