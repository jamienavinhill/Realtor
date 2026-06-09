import assert from "node:assert/strict";
import test from "node:test";
import { validateProviderQuotaMonth } from "@/lib/schemas/provider-quota";
import {
  createInMemoryMonthlyQuotaStore,
  type MonthlyQuotaStore,
} from "@/lib/repositories/provider-quota";
import {
  providerQuotaMonthId,
  REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY,
} from "@/types/provider-quota";

test("providerQuotaMonthId formats UTC year-month", () => {
  assert.equal(providerQuotaMonthId(new Date("2026-06-09T23:00:00.000Z")), "2026-06");
  assert.equal(providerQuotaMonthId(new Date("2026-01-01T00:00:00.000Z")), "2026-01");
  assert.equal(providerQuotaMonthId(new Date("2026-12-31T12:00:00.000Z")), "2026-12");
});

test("validateProviderQuotaMonth accepts a well-formed document", () => {
  const result = validateProviderQuotaMonth({
    month: "2026-06",
    perKey: { realty_key_1: 12, realty_key_2: 5 },
    monthlyLimitPerKey: 250,
    totalSpent: 17,
    updatedAt: "2026-06-09T00:00:00.000Z",
  });
  assert.equal(result.success, true);
});

test("validateProviderQuotaMonth rejects bad month, negative counts, and bad limit", () => {
  assert.equal(
    validateProviderQuotaMonth({
      month: "2026-13",
      perKey: {},
      monthlyLimitPerKey: 250,
      totalSpent: 0,
      updatedAt: "x",
    }).success,
    false,
  );
  assert.equal(
    validateProviderQuotaMonth({
      month: "2026-06",
      perKey: { realty_key_1: -1 },
      monthlyLimitPerKey: 250,
      totalSpent: 0,
      updatedAt: "2026-06-09T00:00:00.000Z",
    }).success,
    false,
  );
  assert.equal(
    validateProviderQuotaMonth({
      month: "2026-06",
      perKey: {},
      monthlyLimitPerKey: 0,
      totalSpent: 0,
      updatedAt: "2026-06-09T00:00:00.000Z",
    }).success,
    false,
  );
});

test("in-memory store grants up to the per-key ceiling then refuses (stop before ceiling)", async () => {
  const store: MonthlyQuotaStore = createInMemoryMonthlyQuotaStore();
  const month = "2026-06";
  const limit = 3;

  let granted = 0;
  let refused = 0;
  for (let i = 0; i < 5; i += 1) {
    const reservation = await store.reserve("realty_key_1", { month, monthlyLimitPerKey: limit });
    if (reservation.granted) granted += 1;
    else refused += 1;
  }

  assert.equal(granted, 3, "must grant exactly the ceiling, never one more");
  assert.equal(refused, 2);

  const doc = await store.read(month);
  assert.ok(doc);
  assert.equal(doc?.perKey.realty_key_1, 3);
  assert.equal(doc?.totalSpent, 3);
});

test("in-memory store tracks per-key budgets independently and sums totalSpent", async () => {
  const store = createInMemoryMonthlyQuotaStore();
  const month = "2026-06";

  await store.reserve("realty_key_1", { month, monthlyLimitPerKey: 250 });
  await store.reserve("realty_key_1", { month, monthlyLimitPerKey: 250 });
  await store.reserve("realty_key_2", { month, monthlyLimitPerKey: 250 });

  const doc = await store.read(month);
  assert.equal(doc?.perKey.realty_key_1, 2);
  assert.equal(doc?.perKey.realty_key_2, 1);
  assert.equal(doc?.totalSpent, 3);
});

test("seeded store respects prior monthly spend across cold starts", async () => {
  // Simulates a fresh serverless process whose only memory of prior spend comes from
  // the durable doc — the ceiling must still hold.
  const store = createInMemoryMonthlyQuotaStore({ "2026-06": { realty_key_1: 250 } });
  const reservation = await store.reserve("realty_key_1", {
    month: "2026-06",
    monthlyLimitPerKey: REALTY_API_FREE_MONTHLY_LIMIT_PER_KEY,
  });
  assert.equal(reservation.granted, false);
  assert.equal(reservation.spentBefore, 250);
});
