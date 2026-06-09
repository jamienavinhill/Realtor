import type { RealtyApiKeyEntry } from "@/lib/env";

/**
 * RealtyAPI free-plan ceiling: 250 requests/MONTH per key (verified against the
 * realtyapi.io pricing page, 2026-06-09 — monthly, NOT daily). With 8 keys the
 * effective budget is ~2,000 calls/month.
 *
 * The durable, cross-invocation budget lives in Firestore via
 * `lib/repositories/provider-quota.ts` (`MonthlyQuotaStore`). `QuotaTracker` below
 * is only a per-run in-memory fast path: it rotates keys and prevents a single run
 * from hammering one key past the monthly ceiling, but it does not persist. The
 * adapter reserves against the durable store before each live call so the budget
 * survives serverless cold starts.
 */
export const REALTY_API_MONTHLY_QUOTA_PER_KEY = 250;

/**
 * @deprecated Use {@link REALTY_API_MONTHLY_QUOTA_PER_KEY}. Retained as an alias so
 * existing imports keep compiling; the value is the monthly per-key ceiling, not a
 * daily one.
 */
export const DEFAULT_DAILY_QUOTA_PER_KEY = REALTY_API_MONTHLY_QUOTA_PER_KEY;

/**
 * Per-run, in-memory rotation + spend tracker. Not durable on its own; see the
 * module doc. `monthlyLimitPerKey` caps how many calls a single run may make on one
 * key (defensive — the durable store is the real authority across runs).
 */
export class QuotaTracker {
  private readonly usage = new Map<string, number>();
  private currentIndex = 0;

  constructor(
    private readonly keys: RealtyApiKeyEntry[],
    private readonly monthlyLimitPerKey = REALTY_API_MONTHLY_QUOTA_PER_KEY,
  ) {}

  getUsage(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [alias, count] of this.usage.entries()) {
      result[alias] = count;
    }
    return result;
  }

  getUsedAliases(): string[] {
    return Array.from(this.usage.keys()).sort();
  }

  hasAvailableKey(): boolean {
    return this.keys.some((entry) => (this.usage.get(entry.alias) ?? 0) < this.monthlyLimitPerKey);
  }

  reserve(alias: string): void {
    const current = this.usage.get(alias) ?? 0;
    if (current >= this.monthlyLimitPerKey) {
      throw new Error(`Quota exhausted for key alias ${alias}`);
    }
    this.usage.set(alias, current + 1);
  }

  /** Record a spend that the durable store granted (keeps in-run usage in sync). */
  recordSpend(alias: string): void {
    this.usage.set(alias, (this.usage.get(alias) ?? 0) + 1);
  }

  /** Mark a key locally exhausted (durable budget already at/over ceiling). */
  markExhausted(alias: string): void {
    this.usage.set(alias, this.monthlyLimitPerKey);
  }

  nextAvailableKey(): RealtyApiKeyEntry | null {
    if (this.keys.length === 0) {
      return null;
    }

    for (let offset = 0; offset < this.keys.length; offset += 1) {
      const index = (this.currentIndex + offset) % this.keys.length;
      const entry = this.keys[index];
      const used = this.usage.get(entry.alias) ?? 0;
      if (used < this.monthlyLimitPerKey) {
        this.currentIndex = (index + 1) % this.keys.length;
        return entry;
      }
    }

    return null;
  }

  /** Advance rotation to the key after `alias` without reserving it. */
  rotatePast(alias: string): void {
    const index = this.keys.findIndex((entry) => entry.alias === alias);
    if (index >= 0) {
      this.currentIndex = (index + 1) % this.keys.length;
    }
  }
}
