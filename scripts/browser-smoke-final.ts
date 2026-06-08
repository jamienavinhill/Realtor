import { appendFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const IMPLEMENTER_DIR =
  "C:\\Users\\james\\AppData\\Local\\Temp\\grok-goal-c79db15364ff\\implementer";
const LOG = `${IMPLEMENTER_DIR}\\browser-smoke.log`;
const URL = process.env.SMOKE_URL ?? "https://abode-alerts.vercel.app";

function log(lines: string[]) {
  appendFileSync(LOG, `\n${lines.join("\n")}\n`);
}

async function checkBranding(page: import("playwright").Page) {
  const title = await page.title();
  const body = await page.locator("body").innerText();
  return {
    pass:
      title === "Abode Alerts" && body.includes("Abode Alerts") && !body.includes("Realty Monitor"),
    title,
  };
}

async function checkListings(page: import("playwright").Page) {
  await page
    .getByRole("button", { name: /^leads$/i })
    .click()
    .catch(() => undefined);
  await page.waitForTimeout(5_000);
  const cards = await page.locator("h3").count();
  const empty = await page
    .getByText("No listings loaded yet")
    .isVisible()
    .catch(() => false);
  const titles = await page.locator("h3").allTextContents();
  const badLand = titles.filter((t) => t.includes("nullbd") || t.includes("nullba"));
  const pass = (cards >= 3 || empty) && badLand.length === 0;
  return {
    pass,
    cards,
    empty,
    badLand,
    landSample: titles.filter((t) => t.startsWith("Land - ")).slice(0, 4),
  };
}

async function checkAccent(page: import("playwright").Page) {
  await page
    .waitForFunction(
      () => document.querySelector('input[type="color"][aria-label="Accent color"]') !== null,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const picker = page.locator('input[type="color"][aria-label="Accent color"]');
  await picker.waitFor({ timeout: 30_000 });
  const before = await picker.inputValue();
  await picker.fill("#ff5500");
  await page.waitForTimeout(300);
  const afterChange = await page.evaluate(() => ({
    localStorage: localStorage.getItem("app-accent-color"),
    cssVar: getComputedStyle(document.documentElement).getPropertyValue("--primary-500").trim(),
    input: (
      document.querySelector('input[type="color"][aria-label="Accent color"]') as HTMLInputElement
    )?.value,
  }));
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1_500);
  const afterReload = await page.evaluate(() => ({
    localStorage: localStorage.getItem("app-accent-color"),
    cssVar: getComputedStyle(document.documentElement).getPropertyValue("--primary-500").trim(),
    input: (
      document.querySelector('input[type="color"][aria-label="Accent color"]') as HTMLInputElement
    )?.value,
  }));
  const pass =
    afterReload.localStorage === "#ff5500" &&
    afterReload.input === "#ff5500" &&
    afterReload.cssVar.toLowerCase() === "#ff5500";
  return { pass, before, afterChange, afterReload };
}

async function checkSetupWizard(page: import("playwright").Page) {
  await page.getByRole("button", { name: /^setup$/i }).click();
  await page.waitForTimeout(1_000);
  const heading = await page
    .getByText("Email Alerts Setup Wizard")
    .isVisible()
    .catch(() => false);
  const city = page.locator('input[placeholder="e.g. Stow"]');
  await city.fill("Akron");
  const generate = page.getByRole("button", { name: /generate ai setup guide/i });
  const hasGenerate = await generate.isVisible().catch(() => false);
  if (hasGenerate) await generate.click();
  await page.waitForTimeout(3_000);
  const cheat = await page.locator("body").innerText();
  const pass =
    heading && cheat.includes("44224") && (cheat.includes("Zillow") || cheat.includes("Redfin"));
  return { pass, heading, hasGenerate };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(3_000);

  const branding = await checkBranding(page);
  const listings = await checkListings(page);
  const accent = await checkAccent(page);
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(2_000);
  const setup = await checkSetupWizard(page);

  await page.screenshot({ path: `${IMPLEMENTER_DIR}\\browser-smoke-final.png`, fullPage: true });
  await browser.close();

  let oauthExit = 1;
  try {
    execSync(
      "node --env-file=.env --import tsx scripts/browser-google-oauth-check.ts --target=vercel --force-sign-in",
      { stdio: "pipe", cwd: process.cwd(), timeout: 180_000 },
    );
    oauthExit = 0;
  } catch {
    oauthExit = 1;
  }

  const flows = [
    { name: "1. Branding", pass: branding.pass },
    {
      name: "2. Listings/Leads",
      pass: listings.pass,
      detail: `${listings.cards} cards, badLand=${listings.badLand.length}`,
    },
    { name: "3. Accent persistence", pass: accent.pass },
    { name: "4. Setup wizard", pass: setup.pass },
    {
      name: "5. Google OAuth click-through (vercel)",
      pass: oauthExit === 0,
      detail: "browser-google-oauth-check.ts --force-sign-in",
    },
  ];

  log([
    "---",
    "## FINAL Integrated Browser Smoke (OAuth only for sign-in)",
    `Timestamp: ${new Date().toISOString()}`,
    `URL: ${URL}`,
    `Sign-in method: Google OAuth button click (NOT custom-token injection)`,
    "",
    "| Flow | Result | Notes |",
    "|------|--------|-------|",
    ...flows.map((f) => `| ${f.name} | ${f.pass ? "PASS" : "FAIL"} | ${f.detail ?? ""} |`),
    "",
    `Land titles sample: ${JSON.stringify(listings.landSample)}`,
    `OVERALL: ${flows.every((f) => f.pass) ? "ALL PASS" : "FAILURES PRESENT"}`,
  ]);

  console.log(JSON.stringify({ flows, listings, oauthExit }, null, 2));
  process.exitCode = flows.every((f) => f.pass) ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
