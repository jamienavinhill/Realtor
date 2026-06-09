import { appendFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

// Production smoke for the live Vercel deployment. Writes artifacts to an OS temp
// directory (never the repo, never a parent path). Optionally token-checks the
// protected ingest route when INGEST_JOB_TOKEN is present in the environment.
//
// Usage (operator, intentional):
//   node --env-file=.env --import tsx scripts/vercel-listings-check.ts
//
// Env:
//   PROD_URL          override the production URL (default https://abode-alerts.vercel.app)
//   INGEST_JOB_TOKEN  if set, the script verifies the daily ingest route gates on it
const URL = process.env.PROD_URL ?? "https://abode-alerts.vercel.app";
const OUT_DIR = mkdtempSync(join(tmpdir(), "abode-vercel-check-"));

async function checkListings(): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: "load", timeout: 60_000 });
    await page.waitForTimeout(8_000);

    const cards = await page.locator("h3").count();
    const sample = await page
      .locator("h3")
      .first()
      .innerText()
      .catch(() => "");
    const empty = await page
      .getByText("No listings loaded yet")
      .isVisible()
      .catch(() => false);

    await page.screenshot({ path: join(OUT_DIR, "vercel-listings.png"), fullPage: true });

    const pass = cards >= 3 && !empty;
    const log = [
      "## Vercel Production Listings Check",
      `Timestamp: ${new Date().toISOString()}`,
      `URL: ${URL}`,
      `Property cards (h3): ${cards}`,
      `Sample card: ${sample}`,
      `Empty state visible: ${empty}`,
      "Screenshot: vercel-listings.png",
      `Result: ${pass ? "PASS" : "FAIL"}`,
      "",
    ].join("\n");

    appendFileSync(join(OUT_DIR, "browser-smoke.log"), `${log}\n`);
    console.log(log);
    return pass;
  } finally {
    await browser.close();
  }
}

/**
 * Confirms the protected daily ingest route rejects an unauthenticated request
 * (expects 401 without a token) and accepts an authenticated one (expects a
 * non-auth status with the token). This never prints the token value.
 */
async function checkProtectedRoute(): Promise<boolean> {
  const token = process.env.INGEST_JOB_TOKEN?.trim();
  const endpoint = `${URL.replace(/\/$/, "")}/api/ingest/daily?dryRun=true`;

  const noTokenRes = await fetch(endpoint, { method: "POST" });
  const unauthorizedRejected = noTokenRes.status === 401 || noTokenRes.status === 403;

  const lines = [
    "## Protected Ingest Route Check",
    `Endpoint: ${endpoint}`,
    `No-token status: ${noTokenRes.status} (expect 401/403) → ${unauthorizedRejected ? "PASS" : "FAIL"}`,
  ];

  let authorizedOk = true;
  if (token) {
    const authedRes = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    // With a valid token the route must NOT return an auth error. It may still
    // return 200 (ran) or 503 (env not ready on that deploy) — both prove the gate
    // let an authenticated caller through.
    authorizedOk = authedRes.status !== 401 && authedRes.status !== 403;
    lines.push(
      `With-token status: ${authedRes.status} (expect not 401/403) → ${authorizedOk ? "PASS" : "FAIL"}`,
    );
  } else {
    lines.push("With-token check: SKIPPED (INGEST_JOB_TOKEN not set in this environment)");
  }

  const log = `${lines.join("\n")}\n`;
  appendFileSync(join(OUT_DIR, "browser-smoke.log"), `${log}\n`);
  console.log(log);
  return unauthorizedRejected && authorizedOk;
}

async function main() {
  console.log("Artifacts:", OUT_DIR);
  const listingsPass = await checkListings();
  const routePass = await checkProtectedRoute();
  process.exitCode = listingsPass && routePass ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
