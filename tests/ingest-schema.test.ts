import assert from "node:assert/strict";
import test from "node:test";
import { validateIngestRun } from "@/lib/schemas/ingest";
import type { IngestRun } from "@/types/listings";

const validRun: IngestRun = {
  id: "run_001",
  type: "backfill",
  status: "running",
  startedAt: "2026-06-08T12:00:00.000Z",
  idempotencyKey: "backfill-44224-2026-06-08",
  zipCode: "44224",
  radiusMiles: 10,
  radiusCenter: { lat: 41.1595, lng: -81.4404, zipCode: "44224" },
  keyAliasesUsed: ["realty_key_1"],
  quotaUsed: { realty_key_1: 2 },
  listingsFetched: 88,
  listingsUpserted: 88,
  listingsSkipped: 0,
  alertMatchesCreated: 0,
  alertMatchesUpdated: 0,
  errors: [],
};

test("validateIngestRun accepts a complete backfill run", () => {
  const result = validateIngestRun(validRun);
  assert.equal(result.success, true);
});

test("validateIngestRun rejects invalid status and quotaUsed", () => {
  const badStatus = validateIngestRun({ ...validRun, status: "unknown" });
  assert.equal(badStatus.success, false);

  const badQuota = validateIngestRun({ ...validRun, quotaUsed: { bad_key: -1 } });
  assert.equal(badQuota.success, false);
});
