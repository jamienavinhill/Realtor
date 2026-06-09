/**
 * WS9 toast smoke: verifies the toast system causes ZERO layout shift and that a
 * toast auto-times-out and can be manually closed.
 *
 * Run against a local dev server (default) or a deployed URL:
 *   npm run dev                       # in one terminal
 *   node --import tsx scripts/browser-toast-noshift-check.ts
 *   SMOKE_URL=https://abode-alerts.vercel.app node --import tsx scripts/browser-toast-noshift-check.ts
 *
 * No credentials are required — the toast is raised via the shipped `abode:toast`
 * window CustomEvent that the ToastProvider listens for. This is the same
 * non-React entry point real server/global handlers use; it is not a test-only hook.
 *
 * Exit code 0 = all assertions passed, 1 = a failure or the dev server was unreachable.
 */
import { chromium, type Page } from "playwright";

const URL = process.env.SMOKE_URL ?? "http://localhost:3000";

type Box = { x: number; y: number; width: number; height: number };

function boxesEqual(a: Box | null, b: Box | null): boolean {
  if (!a || !b) return false;
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.5;
  return eq(a.x, b.x) && eq(a.y, b.y) && eq(a.width, b.width) && eq(a.height, b.height);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header");
    const main = document.querySelector("main");
    const hr = header ? header.getBoundingClientRect() : null;
    const mr = main ? main.getBoundingClientRect() : null;
    return {
      header: hr ? { x: hr.x, y: hr.y, width: hr.width, height: hr.height } : null,
      main: mr ? { x: mr.x, y: mr.y, width: mr.width, height: mr.height } : null,
      scrollWidth: document.documentElement.scrollWidth,
      bodyClientWidth: document.body.clientWidth,
    };
  });
}

async function raiseToast(page: Page, durationMs: number) {
  await page.evaluate((duration) => {
    window.dispatchEvent(
      new CustomEvent("abode:toast", {
        detail: {
          variant: "success",
          title: "Smoke toast",
          description: "Layout-shift assertion toast.",
          duration,
        },
      }),
    );
  }, durationMs);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const results: { name: string; pass: boolean; detail?: string }[] = [];

  try {
    await page.goto(URL, { waitUntil: "load", timeout: 60_000 });
    await page.waitForSelector("header", { timeout: 30_000 });
    await page.waitForTimeout(1_000);

    const before = await measure(page);

    // Raise a toast that auto-dismisses quickly so the smoke stays fast.
    await raiseToast(page, 1_500);
    const toast = page.getByRole("status").filter({ hasText: "Smoke toast" });
    await toast.waitFor({ state: "visible", timeout: 5_000 });

    const during = await measure(page);
    const headerStable = boxesEqual(before.header, during.header);
    const mainStable = boxesEqual(before.main, during.main);
    const noScrollbarShift =
      before.scrollWidth === during.scrollWidth &&
      before.bodyClientWidth === during.bodyClientWidth;

    results.push({
      name: "Header bounding box unchanged while toast visible",
      pass: headerStable,
      detail: `${JSON.stringify(before.header)} -> ${JSON.stringify(during.header)}`,
    });
    results.push({
      name: "Main/listings bounding box unchanged while toast visible",
      pass: mainStable,
      detail: `${JSON.stringify(before.main)} -> ${JSON.stringify(during.main)}`,
    });
    results.push({
      name: "No scrollbar-gutter / document width shift",
      pass: noScrollbarShift,
      detail: `scrollWidth ${before.scrollWidth}->${during.scrollWidth}, bodyWidth ${before.bodyClientWidth}->${during.bodyClientWidth}`,
    });

    // Auto-timeout: the 1.5s toast should disappear on its own.
    await toast.waitFor({ state: "detached", timeout: 6_000 }).catch(async () => {
      await toast.waitFor({ state: "hidden", timeout: 1_000 });
    });
    const autoGone = (await toast.count()) === 0;
    results.push({ name: "Toast auto-times-out", pass: autoGone });

    // Manual close: raise a sticky toast (no auto-dismiss) and click its close button.
    await raiseToast(page, 0);
    const toast2 = page.getByRole("status").filter({ hasText: "Smoke toast" });
    await toast2.waitFor({ state: "visible", timeout: 5_000 });
    await toast2.getByRole("button", { name: /dismiss notification/i }).click();
    await toast2.waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    const manualGone =
      (await page.getByRole("status").filter({ hasText: "Smoke toast" }).count()) === 0;
    results.push({ name: "Toast can be manually closed", pass: manualGone });
  } catch (error) {
    results.push({
      name: "Smoke executed",
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    await browser.close();
  }

  const allPass = results.length > 0 && results.every((r) => r.pass);
  console.log(`# WS9 toast no-shift smoke @ ${URL}`);
  for (const r of results) {
    console.log(`- [${r.pass ? "PASS" : "FAIL"}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(allPass ? "OVERALL: PASS" : "OVERALL: FAIL");
  process.exitCode = allPass ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
