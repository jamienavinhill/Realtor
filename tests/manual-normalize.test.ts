import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeManualListing } from "@/lib/ingest/manual-normalize";
import { validateListingProperty } from "@/lib/schemas/listing";

const NOW = "2026-06-10T00:00:00.000Z";

function baseInput() {
  return {
    id: "prop_pasted_abc",
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

describe("normalizeManualListing", () => {
  it("produces a listing that passes the strict listing validator", () => {
    const result = normalizeManualListing(baseInput(), "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;

    const validation = validateListingProperty(result.listing);
    assert.equal(validation.success, true, validation.success ? "" : validation.errors.join("; "));
  });

  it("synthesizes server provenance the client cannot set", () => {
    const result = normalizeManualListing(baseInput(), "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;

    const l = result.listing;
    assert.equal(l.source, "manual_paste");
    assert.equal(l.sourceProvider, "manual:paste");
    assert.equal(l.ingestedAt, NOW);
    assert.equal(l.updatedAt, NOW);
    assert.ok(l.dedupeKey && l.dedupeKey.startsWith("manual:"));
    assert.ok(l.rawHash && l.rawHash.length === 64);
    assert.equal(l.status, "Active");
    assert.equal(l.history?.[0]?.price, 325000);
  });

  it("tags the gmail origin distinctly", () => {
    const result = normalizeManualListing(baseInput(), "manual_gmail", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.listing.source, "manual_gmail");
    assert.equal(result.listing.sourceProvider, "manual:gmail");
  });

  it("never invents coordinates — defaults to the {0,0} no-geo sentinel", () => {
    const result = normalizeManualListing(baseInput(), "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.listing.coordinates, { lat: 0, lng: 0 });
  });

  it("preserves real coordinates when present", () => {
    const result = normalizeManualListing(
      { ...baseInput(), coordinates: { lat: 41.1, lng: -81.4 } },
      "manual_paste",
      { now: NOW },
    );
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.deepEqual(result.listing.coordinates, { lat: 41.1, lng: -81.4 });
  });

  it("never substitutes media when no imageUrl is present", () => {
    const input = { ...baseInput(), imageUrl: "" };
    const result = normalizeManualListing(input, "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.listing.imageUrl, "");
    assert.deepEqual(result.listing.media, []);
  });

  it("coerces numeric strings from the model", () => {
    const input = { ...baseInput(), price: "299000", beds: "3", baths: "2", sqft: "1500" };
    const result = normalizeManualListing(input, "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.listing.price, 299000);
    assert.equal(result.listing.beds, 3);
  });

  it("rejects a payload missing required fields", () => {
    const result = normalizeManualListing(
      { title: "x", address: "", city: "", state: "", zipCode: "", price: -1 },
      "manual_paste",
      { now: NOW },
    );
    assert.equal(result.success, false);
    if (result.success) return;
    assert.ok(result.errors.length > 0);
  });

  it("falls back to a content-derived dedupe key + id when address is absent", () => {
    const input = { ...baseInput(), id: undefined, address: "Listing with no street" };
    const result = normalizeManualListing(input, "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.ok(result.listing.id.length > 0);
    assert.ok(/^[a-zA-Z0-9_-]+$/.test(result.listing.id));
  });

  it("sanitizes a malicious id into a path-safe document id", () => {
    const input = { ...baseInput(), id: "../../etc/passwd" };
    const result = normalizeManualListing(input, "manual_paste", { now: NOW });
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.ok(/^[a-zA-Z0-9_-]+$/.test(result.listing.id));
  });
});
