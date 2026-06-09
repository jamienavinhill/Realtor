import { createHash } from "node:crypto";
import type { ListingMedia, ListingProperty, ProviderListingProperty } from "@/types/listings";
import type { ExtractedListingDraft } from "@/lib/enrich/extractor";
import type { ParsedGmailMessage } from "@/lib/gmail/client";

/**
 * Normalize a Gemini-extracted listing draft (from an email) into a validated-shaped
 * `ProviderListingProperty`. Mirrors the RealtyAPI normalizer's contract (provenance,
 * dedupe key, media, rawHash) so the email lane writes the SAME catalog shape — but it
 * is a separate module so we do not modify the WS5 adapter.
 *
 * Honest-data rules:
 *   - Coordinates are only set when the draft actually carried them; otherwise the
 *     sentinel {0,0} marks "location unknown" rather than inventing a position. The
 *     listing still validates (coordinates are required numbers) and downstream map UI
 *     treats {0,0} as no-geo.
 *   - Media is taken from the draft's real imageUrl only; never a stock substitute.
 *   - propertyType is mapped to the canonical set when recognizable, else passed through.
 */
function sanitizeDocId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128) || "listing";
}

function normalizeAddressToken(value: string | undefined): string {
  if (!value) return "";
  return value.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalizeSourceUrl(href: string | undefined): string {
  if (!href) return "";
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.host.toLowerCase()}${path.toLowerCase()}`;
  } catch {
    return href.trim().toLowerCase();
  }
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
 * Build a composite dedupe key for an email-sourced listing: normalized address +
 * locality + canonical source URL. The `email:` prefix distinguishes the lane; the same
 * physical home arriving from multiple platforms still collapses by address. When the
 * draft has neither address nor URL, the message id is the stable fallback.
 */
export function buildEmailDedupeKey(draft: ExtractedListingDraft, messageId: string): string {
  const addr = normalizeAddressToken(draft.address);
  const locality = normalizeAddressToken(`${draft.city} ${draft.state} ${draft.zipCode}`);
  const url = canonicalizeSourceUrl(draft.sourceUrl);

  const parts: string[] = [];
  if (addr) parts.push(`addr=${addr} ${locality}`.trim());
  if (url) parts.push(`url=${url}`);

  if (parts.length === 0) {
    return `email:msg=${sanitizeDocId(messageId)}`;
  }
  return `email:${parts.join("|")}`;
}

export function hashDraft(draft: ExtractedListingDraft): string {
  return createHash("sha256").update(JSON.stringify(draft)).digest("hex");
}

export interface EmailNormalizeOptions {
  message: ParsedGmailMessage;
  /** Platform id the email matched (provenance), e.g. "redfin". */
  platformId?: string;
  ingestedAt?: string;
  providerRunId?: string;
}

export function normalizeEmailListing(
  draft: ExtractedListingDraft,
  options: EmailNormalizeOptions,
): ProviderListingProperty {
  const ingestedAt = options.ingestedAt ?? new Date().toISOString();
  const dedupeKey = buildEmailDedupeKey(draft, options.message.id);
  const sourceUrl = draft.sourceUrl?.trim() || options.message.from || "gmail";

  const media: ListingMedia[] = [];
  if (draft.imageUrl && draft.imageUrl.trim().length > 0) {
    media.push({ url: draft.imageUrl.trim(), type: "primary", sourceUrl });
  }
  const imageUrls = media.map((m) => m.url);
  const imageUrl = media[0]?.url ?? "";

  const propertyType = mapPropertyType(draft.propertyType);
  const coordinates =
    draft.coordinates &&
    Number.isFinite(draft.coordinates.lat) &&
    Number.isFinite(draft.coordinates.lng)
      ? { lat: draft.coordinates.lat, lng: draft.coordinates.lng }
      : { lat: 0, lng: 0 };

  const id = sanitizeDocId(dedupeKey.replace(/^email:/, "email_"));

  const listing: ListingProperty = {
    id,
    title: draft.title,
    address: draft.address,
    city: draft.city,
    state: draft.state,
    zipCode: draft.zipCode,
    price: draft.price,
    beds: draft.beds,
    baths: draft.baths,
    sqft: draft.sqft,
    propertyType,
    status: "Active",
    imageUrl,
    imageUrls,
    coordinates,
    yearBuilt: draft.yearBuilt,
    description: draft.description,
    source: "gmail",
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
    sourceProvider: options.platformId ? `gmail:${options.platformId}` : "gmail",
    sourceUrl,
    sourceListingId: options.message.id,
    sourceUpdatedAt: options.message.date,
    ingestedAt,
    provenance: {
      providerRunId: options.providerRunId,
    },
    media,
    rawHash: hashDraft(draft),
    dedupeKey,
    history: [
      {
        observedAt: ingestedAt,
        price: draft.price,
        status: "Active",
        source: "gmail",
      },
    ],
  };

  return listing as ProviderListingProperty;
}
