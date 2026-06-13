/**
 * REAL daily Gemini call-budget accounting — the cost kill-switch.
 *
 * EVERY Gemini call (email extraction, listing analysis, raw-text parse, the generic
 * `/api/gemini` route) reserves one unit here BEFORE the model is invoked. A runaway
 * loop, a replayed Gmail push, or a day that overflows the Developer-API free quota can
 * therefore never silently bill past a hard ceiling — the (N+1)th call of the day is
 * refused in code, not by a surprise invoice.
 *
 * The budget is durable: one document per UTC day at `gemini_quota/{YYYY-MM-DD}` written
 * via the Admin SDK, so the ceiling survives serverless cold starts (an in-memory counter
 * alone resets every invocation and would never actually cap spend — which is exactly how
 * a single day of ingestion ran up the Gemini Developer API bill).
 *
 * Server-only: written via the Admin SDK and never client-readable. Firestore default-deny
 * covers it; add an explicit `gemini_quota` deny alongside `provider_quota` next time the
 * rules file is touched.
 */
export interface GeminiQuotaDay {
  /** UTC calendar day this document accounts for, formatted "YYYY-MM-DD". */
  day: string;
  /** Gemini calls reserved this day across ALL call sites. */
  count: number;
  /** Hard daily ceiling enforced when this document was last written. */
  dailyLimit: number;
  /** ISO-8601 timestamp of the last update. */
  updatedAt: string;
}

/**
 * Default hard daily Gemini call ceiling. Comfortably above normal use (a handful of
 * listing emails + a few analyses per day) but far below a runaway loop. Override with
 * the `GEMINI_DAILY_CALL_CAP` env var.
 */
export const DEFAULT_GEMINI_DAILY_CALL_CAP = 300;

/** Formats a Date (or now) as the "YYYY-MM-DD" UTC document id for `gemini_quota`. */
export function geminiQuotaDayId(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve the daily Gemini call cap from `GEMINI_DAILY_CALL_CAP`, falling back to
 * {@link DEFAULT_GEMINI_DAILY_CALL_CAP}. A missing, non-integer, or non-positive value
 * uses the default — this fails SAFE to a real ceiling, never to "unlimited".
 */
export function resolveGeminiDailyCap(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.GEMINI_DAILY_CALL_CAP?.trim();
  if (!raw) return DEFAULT_GEMINI_DAILY_CALL_CAP;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_GEMINI_DAILY_CALL_CAP;
  return parsed;
}
