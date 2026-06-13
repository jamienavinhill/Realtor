import assert from "node:assert/strict";
import test from "node:test";
import { validateGeminiQuotaDay } from "@/lib/schemas/gemini-quota";
import {
  createInMemoryGeminiQuotaStore,
  type DailyCallQuotaStore,
} from "@/lib/repositories/gemini-quota";
import {
  DEFAULT_GEMINI_DAILY_CALL_CAP,
  geminiQuotaDayId,
  resolveGeminiDailyCap,
} from "@/types/gemini-quota";

test("geminiQuotaDayId formats the UTC year-month-day", () => {
  assert.equal(geminiQuotaDayId(new Date("2026-06-12T23:30:00.000Z")), "2026-06-12");
  assert.equal(geminiQuotaDayId(new Date("2026-01-01T00:00:00.000Z")), "2026-01-01");
  assert.equal(geminiQuotaDayId(new Date("2026-12-31T12:00:00.000Z")), "2026-12-31");
});

test("resolveGeminiDailyCap reads the env and fails SAFE to a real ceiling", () => {
  assert.equal(resolveGeminiDailyCap({ GEMINI_DAILY_CALL_CAP: "42" }), 42);
  assert.equal(resolveGeminiDailyCap({}), DEFAULT_GEMINI_DAILY_CALL_CAP);
  // Non-positive / non-integer / garbage all fall back to the default — never "unlimited".
  assert.equal(
    resolveGeminiDailyCap({ GEMINI_DAILY_CALL_CAP: "0" }),
    DEFAULT_GEMINI_DAILY_CALL_CAP,
  );
  assert.equal(
    resolveGeminiDailyCap({ GEMINI_DAILY_CALL_CAP: "-5" }),
    DEFAULT_GEMINI_DAILY_CALL_CAP,
  );
  assert.equal(
    resolveGeminiDailyCap({ GEMINI_DAILY_CALL_CAP: "oops" }),
    DEFAULT_GEMINI_DAILY_CALL_CAP,
  );
});

test("validateGeminiQuotaDay accepts a well-formed document", () => {
  const result = validateGeminiQuotaDay({
    day: "2026-06-12",
    count: 5,
    dailyLimit: 300,
    updatedAt: "2026-06-12T00:00:00.000Z",
  });
  assert.equal(result.success, true);
});

test("validateGeminiQuotaDay rejects bad day, negative/over-ceiling count, and bad limit", () => {
  assert.equal(
    validateGeminiQuotaDay({ day: "2026-13-40", count: 5, dailyLimit: 300, updatedAt: "x" })
      .success,
    false,
  );
  assert.equal(
    validateGeminiQuotaDay({
      day: "2026-06-12",
      count: -1,
      dailyLimit: 300,
      updatedAt: "2026-06-12T00:00:00.000Z",
    }).success,
    false,
  );
  // count above the ceiling means the reserve gate was bypassed.
  assert.equal(
    validateGeminiQuotaDay({
      day: "2026-06-12",
      count: 301,
      dailyLimit: 300,
      updatedAt: "2026-06-12T00:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    validateGeminiQuotaDay({
      day: "2026-06-12",
      count: 5,
      dailyLimit: 0,
      updatedAt: "2026-06-12T00:00:00.000Z",
    }).success,
    false,
  );
});

test("in-memory store grants up to the daily ceiling then refuses (stop before ceiling)", async () => {
  const store: DailyCallQuotaStore = createInMemoryGeminiQuotaStore();
  const day = "2026-06-12";
  const dailyLimit = 3;

  let granted = 0;
  let refused = 0;
  for (let i = 0; i < 5; i += 1) {
    const reservation = await store.reserve({ day, dailyLimit });
    if (reservation.granted) granted += 1;
    else refused += 1;
  }

  assert.equal(granted, 3, "must grant exactly the ceiling, never one more");
  assert.equal(refused, 2);

  const doc = await store.read(day);
  assert.ok(doc);
  assert.equal(doc?.count, 3);
});

test("seeded store respects prior daily spend across cold starts", async () => {
  // Simulates a fresh serverless process whose only memory of prior spend is the durable
  // doc — the ceiling must still hold so a redeploy mid-day cannot reset the budget.
  const store = createInMemoryGeminiQuotaStore({ "2026-06-12": 300 });
  const reservation = await store.reserve({ day: "2026-06-12", dailyLimit: 300 });
  assert.equal(reservation.granted, false);
  assert.equal(reservation.spentBefore, 300);
});
