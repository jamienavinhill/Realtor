import { expect, test } from "@playwright/test";
import { E2E_INGEST_JOB_TOKEN } from "../playwright.config";

/**
 * Protected ingest route gate (WS17 release gate / Acceptance Criteria: token-gated
 * ingest). `POST /api/ingest/daily` must return 401 WITHOUT the job token and a
 * NON-401 status WITH it. The webServer sets INGEST_JOB_TOKEN to a throwaway value
 * (see playwright.config.ts) so the gate is exercised end-to-end rather than short-
 * circuiting to 503 "not configured".
 *
 * The unit-level auth logic is covered by tests/ingest-auth.test.ts; this is the
 * HTTP-surface smoke against the running app.
 */
test.describe("protected ingest route", () => {
  test("returns 401 without a token", async ({ request }) => {
    const res = await request.post("/api/ingest/daily?dryRun=true");
    expect(res.status()).toBe(401);
  });

  test("returns a non-401 status with a valid token", async ({ request }) => {
    const res = await request.post("/api/ingest/daily?dryRun=true", {
      headers: { authorization: `Bearer ${E2E_INGEST_JOB_TOKEN}` },
    });
    // Authorized: the request passes the token gate. It may then fail later on
    // missing real provider/admin env (503) or succeed (200) — what matters for the
    // gate smoke is that it is NOT rejected with 401.
    expect(res.status()).not.toBe(401);
  });
});
