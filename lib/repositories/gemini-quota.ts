import type { GeminiQuotaDay } from "@/types/gemini-quota";
import { geminiQuotaDayId, resolveGeminiDailyCap } from "@/types/gemini-quota";
import { validateGeminiQuotaDay } from "@/lib/schemas/gemini-quota";
import { getAdminFirestore } from "@/lib/firebase-admin";

const COLLECTION = "gemini_quota";

/**
 * Durable daily Gemini call-budget store. Every Gemini call site reserves one unit
 * through this BEFORE invoking the model so the hard daily ceiling survives serverless
 * cold starts (an in-memory tracker alone resets every invocation and silently
 * overspends — the failure mode that produced the original bill).
 *
 * The interface is the injection seam: production uses {@link firestoreGeminiQuotaStore};
 * unit tests inject {@link createInMemoryGeminiQuotaStore} so cap behavior is verifiable
 * WITHOUT live Firestore.
 */
export interface DailyCallQuotaStore {
  /**
   * Atomically reserve one Gemini call against the given UTC day, refusing to exceed the
   * daily ceiling. Returns the outcome so the caller can fail closed (throw / surface a
   * "budget reached" state) rather than spend.
   */
  reserve(options?: { day?: string; dailyLimit?: number }): Promise<GeminiQuotaReservation>;
  /** Read the current day document (or null when none has been written yet). */
  read(day?: string): Promise<GeminiQuotaDay | null>;
}

export interface GeminiQuotaReservation {
  granted: boolean;
  day: string;
  /** Calls already spent this day BEFORE this reservation. */
  spentBefore: number;
  dailyLimit: number;
}

function quotaDocPath(day: string): string {
  return `${COLLECTION}/${day}`;
}

/**
 * Firestore-backed daily quota store using the Admin SDK. Reserves run in a transaction
 * so concurrent serverless invocations cannot both slip past the ceiling on the same day.
 */
export const firestoreGeminiQuotaStore: DailyCallQuotaStore = {
  async reserve(options) {
    const day = options?.day ?? geminiQuotaDayId();
    const dailyLimit = options?.dailyLimit ?? resolveGeminiDailyCap();
    const db = getAdminFirestore();
    const ref = db.doc(quotaDocPath(day));

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const existing = snap.exists ? (snap.data() as Partial<GeminiQuotaDay>) : undefined;
      const spentBefore = existing?.count ?? 0;

      const reservation: GeminiQuotaReservation = {
        granted: spentBefore < dailyLimit,
        day,
        spentBefore,
        dailyLimit,
      };

      if (!reservation.granted) {
        return reservation;
      }

      const next: GeminiQuotaDay = {
        day,
        count: spentBefore + 1,
        dailyLimit,
        updatedAt: new Date().toISOString(),
      };

      const validation = validateGeminiQuotaDay(next);
      if (!validation.success) {
        throw new Error(`Invalid gemini quota document: ${validation.errors.join("; ")}`);
      }

      tx.set(ref, validation.data);
      return reservation;
    });
  },

  async read(day) {
    const id = day ?? geminiQuotaDayId();
    const db = getAdminFirestore();
    const snap = await db.doc(quotaDocPath(id)).get();
    if (!snap.exists) {
      return null;
    }
    const validation = validateGeminiQuotaDay({ day: id, ...snap.data() });
    return validation.success ? validation.data : null;
  },
};

/**
 * In-memory daily quota store. Intended for unit tests (and as a documented, NON-durable
 * fallback). It enforces the same ceiling but does not survive across processes, so
 * production must use {@link firestoreGeminiQuotaStore}.
 */
export function createInMemoryGeminiQuotaStore(seed?: Record<string, number>): DailyCallQuotaStore {
  const days = new Map<string, number>(Object.entries(seed ?? {}));

  return {
    async reserve(options) {
      const day = options?.day ?? geminiQuotaDayId();
      const dailyLimit = options?.dailyLimit ?? resolveGeminiDailyCap();
      const spentBefore = days.get(day) ?? 0;
      const granted = spentBefore < dailyLimit;
      if (granted) {
        days.set(day, spentBefore + 1);
      }
      return { granted, day, spentBefore, dailyLimit };
    },
    async read(day) {
      const id = day ?? geminiQuotaDayId();
      const count = days.get(id);
      if (count === undefined) {
        return null;
      }
      return {
        day: id,
        count,
        dailyLimit: resolveGeminiDailyCap(),
        updatedAt: new Date().toISOString(),
      };
    },
  };
}
