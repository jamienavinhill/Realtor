import type { ProviderQuotaMonth } from "@/types/provider-quota";
import {
  providerQuotaMonthId,
  REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY,
} from "@/types/provider-quota";
import { validateProviderQuotaMonth } from "@/lib/schemas/provider-quota";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "provider_quota";

/**
 * Durable monthly-budget store. The RealtyAPI adapter spends through this so the
 * ~250 req/MONTH-per-key ceiling survives serverless cold starts (an in-memory
 * tracker alone would reset every invocation and silently overspend).
 *
 * The interface is the injection seam: production uses
 * `firestoreMonthlyQuotaStore`; unit tests inject an in-memory fake so quota
 * behavior is verifiable WITHOUT live Firestore.
 */
export interface MonthlyQuotaStore {
  /**
   * Atomically reserve one call against `keyAlias` for the given month, refusing
   * to exceed the per-key monthly ceiling. Returns the outcome so the caller can
   * degrade to PARTIAL results rather than crash.
   */
  reserve(
    keyAlias: string,
    options?: { month?: string; monthlyLimitPerKey?: number },
  ): Promise<MonthlyQuotaReservation>;
  /** Read the current month document (or null when none has been written yet). */
  read(month?: string): Promise<ProviderQuotaMonth | null>;
}

export interface MonthlyQuotaReservation {
  granted: boolean;
  keyAlias: string;
  month: string;
  /** Calls already spent on this key this month BEFORE this reservation. */
  spentBefore: number;
  monthlyLimitPerKey: number;
}

function quotaDocPath(month: string): string {
  return `${COLLECTION}/${month}`;
}

/**
 * Firestore-backed monthly quota store using the Admin SDK. Reserves are run in a
 * transaction so concurrent serverless invocations cannot both slip past the
 * ceiling on the same key.
 */
export const firestoreMonthlyQuotaStore: MonthlyQuotaStore = {
  async reserve(keyAlias, options) {
    const month = options?.month ?? providerQuotaMonthId();
    const monthlyLimitPerKey = options?.monthlyLimitPerKey ?? REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY;
    const db = getAdminFirestore();
    const ref = db.doc(quotaDocPath(month));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as Partial<ProviderQuotaMonth>) : undefined;
      const perKey: Record<string, number> = { ...(existing?.perKey ?? {}) };
      const spentBefore = perKey[keyAlias] ?? 0;

      const reservation: MonthlyQuotaReservation = {
        granted: spentBefore < monthlyLimitPerKey,
        keyAlias,
        month,
        spentBefore,
        monthlyLimitPerKey,
      };

      if (!reservation.granted) {
        return reservation;
      }

      perKey[keyAlias] = spentBefore + 1;
      const totalSpent = Object.values(perKey).reduce((sum, count) => sum + count, 0);
      const next: ProviderQuotaMonth = {
        month,
        perKey,
        monthlyLimitPerKey,
        totalSpent,
        updatedAt: new Date().toISOString(),
      };

      const validation = validateProviderQuotaMonth(next);
      if (!validation.success) {
        throw new Error(`Invalid provider quota document: ${validation.errors.join("; ")}`);
      }

      tx.set(ref, validation.data);
      return reservation;
    });
  },

  async read(month) {
    const id = month ?? providerQuotaMonthId();
    const db = getAdminFirestore();
    const snap = await db.doc(quotaDocPath(id)).get();
    if (!snap.exists) {
      return null;
    }
    const validation = validateProviderQuotaMonth({ month: id, ...snap.data() });
    return validation.success ? validation.data : null;
  },
};

/**
 * In-memory monthly quota store. Intended for unit tests (and as a documented,
 * NON-durable fallback). It enforces the same ceiling but does not survive across
 * processes, so production must use {@link firestoreMonthlyQuotaStore}.
 */
export function createInMemoryMonthlyQuotaStore(
  seed?: Record<string, Record<string, number>>,
): MonthlyQuotaStore {
  const months = new Map<string, Record<string, number>>();
  for (const [month, perKey] of Object.entries(seed ?? {})) {
    months.set(month, { ...perKey });
  }

  return {
    async reserve(keyAlias, options) {
      const month = options?.month ?? providerQuotaMonthId();
      const monthlyLimitPerKey =
        options?.monthlyLimitPerKey ?? REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY;
      const perKey = months.get(month) ?? {};
      const spentBefore = perKey[keyAlias] ?? 0;
      const granted = spentBefore < monthlyLimitPerKey;
      if (granted) {
        perKey[keyAlias] = spentBefore + 1;
        months.set(month, perKey);
      }
      return { granted, keyAlias, month, spentBefore, monthlyLimitPerKey };
    },
    async read(month) {
      const id = month ?? providerQuotaMonthId();
      const perKey = months.get(id);
      if (!perKey) {
        return null;
      }
      const totalSpent = Object.values(perKey).reduce((sum, count) => sum + count, 0);
      return {
        month: id,
        perKey: { ...perKey },
        monthlyLimitPerKey: REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY,
        totalSpent,
        updatedAt: new Date().toISOString(),
      };
    },
  };
}
