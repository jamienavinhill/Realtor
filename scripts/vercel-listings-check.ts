import { appendFileSync } from "node:fs";
import { chromium } from "playwright";

const IMPLEMENTER_DIR =
  "C:\\Users\\james\\AppData\\Local\\Temp\\grok-goal-c79db15364ff\\implementer";
const URL = "https://abode-alerts.vercel.app";

async function main() {
  const browser = await chromium.launch({ headless: true });
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

  await page.screenshot({ path: `${IMPLEMENTER_DIR}\\vercel-listings.png`, fullPage: true });

  const log = [
    "",
    "## Vercel Production Listings Check",
    `Timestamp: ${new Date().toISOString()}`,
    `URL: ${URL}`,
    `Property cards (h3): ${cards}`,
    `Sample card: ${sample}`,
    `Empty state visible: ${empty}`,
    "Screenshot: vercel-listings.png",
    `Result: ${cards >= 3 && !empty ? "PASS" : "FAIL"}`,
  ].join("\n");

  appendFileSync(`${IMPLEMENTER_DIR}\\browser-smoke.log`, `${log}\n`);
  console.log(log);

  await browser.close();
  process.exitCode = cards >= 3 && !empty ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
