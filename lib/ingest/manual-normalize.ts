import { createHash } from "node:crypto";
import type { ListingMedia, ProviderListingProperty } from "@/types/listings";

/**
 * Normalize a manually-committed listing (the Gemini `parse_raw_text` / `parse_gmail`
 * output the operator reviews in the harvester preview) into a fully-provenanced
 * `ProviderListingProperty` so it can be written through the SAME Admin-SDK repository
 * (`upsertListing`) and pass the SAME strict `validateListingProperty` as the email and
 * RealtyAPI lanes.
 *
 * WS16: the browser no longer writes `properties/*` directly. The manual commit POSTs the
 * reviewed payload to `/api/properties` (action `commit`); this module is the server-side
 * sanitizer that:
 *   - validates the genuinely-present client fields and rejects junk,
 *   - synthesizes provenance the client cannot be trusted to set
 *     (`source`, `sourceProvider`, `sourceListingId`, `dedupeKey`, `rawHash`, timestamps),
 *   - preserves caller-supplied `createdAt` only as a hint (upsert keeps the existing
 *     createdAt on update), and stamps a fresh server `ingestedAt`/`updatedAt`.
 *
 * Honest-data rules mirror `email-normalize.ts`: coordinates default to the {0,0}
 * "location unknown" sentinel rather than an invented position; media is taken only from a
 * real `imageUrl` the source carried; never a stock substitute.
 */

/** The lightweight shape the parse routes return and the harvester preview commits. */
export interface ManualListingInput {
  id?: unknown;
  title?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  zipCode?: unknown;
  price?: unknown;
  beds?: unknown;
  baths?: unknown;
  sqft?: unknown;
  propertyType?: unknown;
  status?: unknown;
  imageUrl?: unknown;
  description?: unknown;
  yearBuilt?: unknown;
  coordinates?: unknown;
  source?: unknown;
  createdAt?: unknown;
  emailSource?: { id?: unknown; subject?: unknown; from?: unknown; date?: unknown } | unknown;
}

export type ManualCommitOrigin = "manual_paste" | "manual_gmail";

export interface ManualNormalizeResult {
  success: true;
  listing: ProviderListingProperty;
}
export interface ManualNormalizeError {
  success: false;
  errors: string[];
}

function sanitizeDocId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128) || "listing";
}

function normalizeToken(value: string | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

function asTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

/** Coerce a numeric field that may arrive as a number or numeric string; clamps to >= 0. */
function asNonNegativeNumber(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num) || num < 0) return null;
  return num;
}

function mapPropertyType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("condo")) return "Condo";
  if (normalized.includes("town")) return "Townhouse";
  if (normalized.includes("multi")) return "Multi-Family";
  if (normalized.includes("land")) return "Land";
  if (normalized.includes("single")) return "Single Family";
  return value || "Single Family";
}

/**
 * Composite dedupe key for a manually-committed listing: normalized address + locality.
 * Mirrors the email lane so the same physical home committed by paste and arriving by
 * email collapses by address. Falls back to the caller's id (or a content hash) when no
 * address is present, so a manual paste without an address still gets a stable key.
 */
function buildManualDedupeKey(
  listing: { address: string; city: string; state: string; zipCode: string },
  fallbackId: string,
): string {
  const addr = normalizeToken(listing.address);
  const locality = normalizeToken(`${listing.city} ${listing.state} ${listing.zipCode}`);
  if (addr) {
    return `manual:addr=${addr} ${locality}`.trim();
  }
  return `manual:id=${sanitizeDocId(fallbackId)}`;
}

/**
 * Validate + normalize one manual listing. Returns a fully-provenanced listing that passes
 * the strict listing validator, or a list of field errors. The `origin` distinguishes the
 * pasted-text vs Gmail-scan lane in the stored `sourceProvider`.
 */
export function normalizeManualListing(
  input: ManualListingInput,
  origin: ManualCommitOrigin,
  options?: { now?: string },
): ManualNormalizeResult | ManualNormalizeError {
  const errors: string[] = [];

  const title = asTrimmedString(input.title, 200);
  if (!title) errors.push("title must be a non-empty string");
  const address = asTrimmedString(input.address, 200);
  if (!address) errors.push("address must be a non-empty string");
  const city = asTrimmedString(input.city, 100);
  if (!city) errors.push("city must be a non-empty string");
  const state = asTrimmedString(input.state, 5);
  if (!state) errors.push("state must be a non-empty string (<= 5 chars)");
  const zipCode = asTrimmedString(input.zipCode, 15);
  if (!zipCode) errors.push("zipCode must be a non-empty string");

  const price = asNonNegativeNumber(input.price);
  if (price === null) errors.push("price must be a number >= 0");
  const beds = asNonNegativeNumber(input.beds);
  if (beds === null) errors.push("beds must be a number >= 0");
  const baths = asNonNegativeNumber(input.baths);
  if (baths === null) errors.push("baths must be a number >= 0");
  const sqft = asNonNegativeNumber(input.sqft);
  if (sqft === null) errors.push("sqft must be a number >= 0");

  const propertyTypeRaw = asTrimmedString(input.propertyType, 50);
  if (!propertyTypeRaw) errors.push("propertyType must be a non-empty string");

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const now = options?.now ?? new Date().toISOString();

  // Optional fields — never required, never invented.
  const description = asTrimmedString(input.description, 5000) ?? undefined;
  const yearBuilt = asNonNegativeNumber(input.yearBuilt);

  const imageUrl = asTrimmedString(input.imageUrl, 1000) ?? "";
  const media: ListingMedia[] = [];
  if (imageUrl) {
    media.push({ url: imageUrl, type: "primary" });
  }

  // Only trust coordinates when both are finite numbers; otherwise the {0,0} sentinel
  // marks "location unknown" (downstream map UI treats {0,0} as no-geo). Never invent geo.
  let coordinates = { lat: 0, lng: 0 };
  const rawCoords = input.coordinates;
  if (
    rawCoords &&
    typeof rawCoords === "object" &&
    !Array.isArray(rawCoords) &&
    typeof (rawCoords as { lat?: unknown }).lat === "number" &&
    typeof (rawCoords as { lng?: unknown }).lng === "number" &&
    Number.isFinite((rawCoords as { lat: number }).lat) &&
    Number.isFinite((rawCoords as { lng: number }).lng)
  ) {
    coordinates = {
      lat: (rawCoords as { lat: number }).lat,
      lng: (rawCoords as { lng: number }).lng,
    };
  }

  const base = {
    title: title as string,
    address: address as string,
    city: city as string,
    state: state as string,
    zipCode: zipCode as string,
  };

  // A client-supplied id is only a hint; we sanitize it and fall back to a content hash so
  // a committed listing always has a deterministic, path-safe id even if the model omitted
  // or malformed it.
  const idHint = asTrimmedString(input.id, 128);
  const contentHash = createHash("sha256")
    .update(`${base.address}|${base.city}|${base.state}|${base.zipCode}|${price}`)
    .digest("hex")
    .slice(0, 24);
  const fallbackId = idHint ?? `manual_${contentHash}`;
  const dedupeKey = buildManualDedupeKey(base, fallbackId);
  const id = sanitizeDocId(idHint ?? dedupeKey.replace(/^manual:/, "manual_"));

  const sourceProvider = origin === "manual_gmail" ? "manual:gmail" : "manual:paste";
  // The reviewer commits a model-extracted listing; rawHash binds the stored doc to the
  // exact committed content so the catalog record is auditable.
  const rawHash = createHash("sha256")
    .update(
      JSON.stringify({
        ...base,
        price,
        beds,
        baths,
        sqft,
        propertyType: propertyTypeRaw,
        imageUrl,
        description,
        yearBuilt: yearBuilt ?? undefined,
      }),
    )
    .digest("hex");

  const listing: ProviderListingProperty = {
    id,
    title: base.title,
    address: base.address,
    city: base.city,
    state: base.state,
    zipCode: base.zipCode,
    price: price as number,
    beds: beds as number,
    baths: baths as number,
    sqft: sqft as number,
    propertyType: mapPropertyType(propertyTypeRaw as string),
    status: "Active",
    imageUrl,
    imageUrls: media.map((m) => m.url),
    coordinates,
    yearBuilt: yearBuilt ?? undefined,
    description,
    source: origin,
    createdAt: asTrimmedString(input.createdAt, 64) ?? now,
    updatedAt: now,
    sourceProvider,
    sourceUrl: sourceProvider,
    sourceListingId: id,
    ingestedAt: now,
    media,
    rawHash,
    dedupeKey,
    history: [
      {
        observedAt: now,
        price: price as number,
        status: "Active",
        source: origin,
      },
    ],
  };

  return { success: true, listing };
}
