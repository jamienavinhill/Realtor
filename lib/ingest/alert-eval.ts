import type { AlertMatch, ListingProperty, PropertyAlert } from "@/types/listings";
import { buildAlertMatchId } from "@/lib/repositories/matches";

export interface AlertEvaluationResult {
  matches: AlertMatch[];
  reasons: Record<string, string>;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateAlertAgainstListing(
  alert: PropertyAlert,
  listing: ListingProperty,
  _seenAt = new Date().toISOString(),
): { isMatch: boolean; reason: string } {
  const reasons: string[] = [];

  if (alert.criteria.city && normalize(listing.city) !== normalize(alert.criteria.city)) {
    return { isMatch: false, reason: "city mismatch" };
  }

  if (alert.criteria.minPrice !== undefined && listing.price < alert.criteria.minPrice) {
    return { isMatch: false, reason: "below minPrice" };
  }

  if (alert.criteria.maxPrice !== undefined && listing.price > alert.criteria.maxPrice) {
    return { isMatch: false, reason: "above maxPrice" };
  }

  if (alert.criteria.beds !== undefined && listing.beds < alert.criteria.beds) {
    return { isMatch: false, reason: "insufficient beds" };
  }

  if (alert.criteria.baths !== undefined && listing.baths < alert.criteria.baths) {
    return { isMatch: false, reason: "insufficient baths" };
  }

  if (
    alert.criteria.propertyType &&
    normalize(listing.propertyType) !== normalize(alert.criteria.propertyType)
  ) {
    return { isMatch: false, reason: "propertyType mismatch" };
  }

  if (alert.criteria.city) reasons.push(`city=${listing.city}`);
  if (alert.criteria.minPrice !== undefined) reasons.push(`minPrice<=${listing.price}`);
  if (alert.criteria.maxPrice !== undefined) reasons.push(`maxPrice>=${listing.price}`);
  if (alert.criteria.beds !== undefined) reasons.push(`beds>=${listing.beds}`);
  if (alert.criteria.baths !== undefined) reasons.push(`baths>=${listing.baths}`);
  if (alert.criteria.propertyType) reasons.push(`propertyType=${listing.propertyType}`);

  return {
    isMatch: true,
    reason: reasons.length > 0 ? reasons.join(", ") : `matched alert ${alert.name}`,
  };
}

export function evaluateAlertsForListings(
  alerts: PropertyAlert[],
  listings: ListingProperty[],
  seenAt = new Date().toISOString(),
): AlertEvaluationResult {
  const matches: AlertMatch[] = [];
  const reasons: Record<string, string> = {};

  for (const alert of alerts) {
    if (!alert.isActive) continue;

    for (const listing of listings) {
      const evaluation = evaluateAlertAgainstListing(alert, listing, seenAt);
      if (!evaluation.isMatch) continue;

      const id = buildAlertMatchId(alert.id, listing.id);
      reasons[id] = evaluation.reason;
      matches.push({
        id,
        alertId: alert.id,
        listingId: listing.id,
        userId: alert.userId,
        matchReason: evaluation.reason,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      });
    }
  }

  return { matches, reasons };
}