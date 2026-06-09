/**
 * REAL monthly RealtyAPI budget accounting (WS5).
 *
 * RealtyAPI's free plan is 250 requests/MONTH per key (verified against the
 * realtyapi.io pricing page, 2026-06-09 — the limit is monthly, not daily). The
 * durable budget is persisted one document per calendar month at
 * `provider_quota/{YYYY-MM}` via the Admin SDK so it survives serverless cold
 * starts (the in-memory QuotaTracker is only a per-run fast path).
 *
 * This collection is server-only: it is never client-readable (see
 * `firestore.rules` — WS3 added the `provider_quota` deny).
 */
export interface ProviderQuotaMonth {
  /** Calendar month this document accounts for, formatted "YYYY-MM". */
  month: string;
  /** keyAlias -> calls spent this month. */
  perKey: Record<string, number>;
  /** Per-key monthly ceiling (250 on the RealtyAPI free plan). */
  monthlyLimitPerKey: number;
  /** Sum of perKey — total calls spent across all keys this month. */
  totalSpent: number;
  /** ISO-8601 timestamp of the last update. */
  updatedAt: string;
}

/** Default per-key monthly ceiling on the RealtyAPI free plan (verified 2026-06-09). */
export const REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY = 250;

/** Formats a Date (or now) as the "YYYY-MM" document id for `provider_quota`. */
export function providerQuotaMonthId(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
