import type { RealtyApiKeyEntry } from "@/lib/env";

export const DEFAULT_DAILY_QUOTA_PER_KEY = 250;

export class QuotaTracker {
  private readonly usage = new Map<string, number>();
  private currentIndex = 0;

  constructor(
    private readonly keys: RealtyApiKeyEntry[],
    private readonly dailyLimit = DEFAULT_DAILY_QUOTA_PER_KEY,
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
    return this.keys.some((entry) => (this.usage.get(entry.alias) ?? 0) < this.dailyLimit);
  }

  reserve(alias: string): void {
    const current = this.usage.get(alias) ?? 0;
    if (current >= this.dailyLimit) {
      throw new Error(`Quota exhausted for key alias ${alias}`);
    }
    this.usage.set(alias, current + 1);
  }

  nextAvailableKey(): RealtyApiKeyEntry | null {
    if (this.keys.length === 0) {
      return null;
    }

    for (let offset = 0; offset < this.keys.length; offset += 1) {
      const index = (this.currentIndex + offset) % this.keys.length;
      const entry = this.keys[index];
      const used = this.usage.get(entry.alias) ?? 0;
      if (used < this.dailyLimit) {
        this.currentIndex = (index + 1) % this.keys.length;
        return entry;
      }
    }

    return null;
  }
}