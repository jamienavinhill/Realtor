import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright critical-path smokes (WS17).
 *
 * Scope: the HONEST, reachable surface of Abode Alerts without live Google OAuth.
 * The signed-out app renders the full chrome, the Docs tab, and the CMA/listings
 * built from the PUBLIC `properties` Firestore catalog (client config is public,
 * `properties` is world-readable per the Firestore rules). Those smokes run for
 * real. Auth-gated flows (listing actions, WS18 share/invite) require Firebase
 * Auth + Google OAuth, which is unavailable headless/in CI — their specs are
 * `test.skip`-tagged and documented as MANUAL runbook steps, never faked.
 *
 * The web server is the app's own `npm run dev`. `INGEST_JOB_TOKEN` is set to a
 * throwaway value so the protected-route smoke exercises the 401-vs-authorized
 * gate (without it the route returns 503 "not configured"); it is a server-side
 * gating value, NOT a real secret, and is only present in this local test process.
 */

const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Throwaway token for the protected-route gate smoke. Not a secret: it only proves
// the 401-without / non-401-with branching of the ingest auth check. Never a real
// production token.
const E2E_INGEST_JOB_TOKEN = "e2e-smoke-token-not-a-secret";

export default defineConfig({
  testDir: "./e2e",
  // Each spec self-contains its assertions; keep runs deterministic and serial-ish.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Desktop viewport: the Docs TOC and the lg: nav only render at md/lg widths.
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Call next directly (the `dev` npm script hardcodes -p 3000); a dedicated test
    // port avoids colliding with a dev server the operator may already be running.
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      INGEST_JOB_TOKEN: E2E_INGEST_JOB_TOKEN,
    },
  },
  metadata: {
    e2eIngestJobToken: E2E_INGEST_JOB_TOKEN,
  },
});

export { BASE_URL, E2E_INGEST_JOB_TOKEN };
