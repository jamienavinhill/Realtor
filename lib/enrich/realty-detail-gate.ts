import type { ListingProperty } from "@/types/listings";

/**
 * RealtyAPI property-detail spend gate (WS7).
 *
 * RealtyAPI is the scarcest budget (~250 req/MONTH per key — see the Locked Decision).
 * Discovery is FREE from the email alerts, so we NEVER spend RealtyAPI to find a
 * listing. We spend a property-detail call ONLY when:
 *   (a) the listing is still missing an authoritative field/photo a free lane can't
 *       supply (no media, or missing core structured facts), AND
 *   (b) we have NOT already spent a detail call on this listing
 *       (`enrichment.realtyApiDetailFetchedAt` is the persisted guard), AND
 *   (c) the monthly budget allows (checked by the caller via the WS5 quota store).
 *
 * This module is the pure DECISION. It does not perform any HTTP or budget reservation
 * itself — the pipeline composes it with the WS5 quota repository so the call is only
 * made when justified AND affordable. Keeping it pure makes the gate unit-testable with
 * no live RealtyAPI calls.
 */
export interface RealtyDetailGateResult {
  shouldFetch: boolean;
  /** Human-readable reason (for run logs / provenance), regardless of outcome. */
  reason: string;
}

/** True when a listing already had a RealtyAPI detail call spent on it. */
export function hasSpentRealtyDetail(listing: Pick<ListingProperty, "enrichment">): boolean {
  return Boolean(listing.enrichment?.realtyApiDetailFetchedAt);
}

/**
 * Decide whether an emailed listing warrants a RealtyAPI property-detail call, BEFORE
 * consulting the budget. `budgetAvailable` is passed in (computed from the WS5 monthly
 * quota store) so this stays pure and testable.
 */
export function evaluateRealtyDetailGate(
  listing: Pick<
    ListingProperty,
    "media" | "imageUrl" | "price" | "beds" | "baths" | "sqft" | "yearBuilt" | "enrichment"
  >,
  budgetAvailable: boolean,
): RealtyDetailGateResult {
  if (hasSpentRealtyDetail(listing)) {
    return {
      shouldFetch: false,
      reason: "RealtyAPI detail already spent on this listing (persisted guard).",
    };
  }

  const missingMedia = (listing.media?.length ?? 0) === 0 && !listing.imageUrl;
  // Core authoritative facts that, when absent, a free lane cannot reliably supply.
  const missingCoreFacts =
    listing.price <= 0 || listing.sqft <= 0 || (listing.beds <= 0 && listing.baths <= 0);
  const missingYear = listing.yearBuilt === undefined;

  const authoritativeGapExists = missingMedia || missingCoreFacts || missingYear;

  if (!authoritativeGapExists) {
    return {
      shouldFetch: false,
      reason: "No authoritative gap — listing has media and core facts; free lanes suffice.",
    };
  }

  if (!budgetAvailable) {
    return {
      shouldFetch: false,
      reason: "Authoritative gap exists but monthly RealtyAPI budget is exhausted; skipping spend.",
    };
  }

  const gaps: string[] = [];
  if (missingMedia) gaps.push("media");
  if (missingCoreFacts) gaps.push("core-facts");
  if (missingYear) gaps.push("year-built");

  return {
    shouldFetch: true,
    reason: `Authoritative gap (${gaps.join(", ")}) and budget available — spend property-detail.`,
  };
}
