import { expect, test } from "@playwright/test";

/**
 * Toast non-shift (WS17 / Acceptance Criteria: toasts cause zero layout shift).
 *
 * Driven by the SHIPPED `abode:toast` window CustomEvent that the ToastProvider
 * listens for (components/ui/toast.tsx, TOAST_EVENT) — the same non-React entry
 * point real server/global handlers use. This is NOT a test-only hook, so the smoke
 * runs without OAuth and without weakening any production path.
 *
 * Assertion: when a toast appears, the header and main content bounding boxes and
 * the document width are unchanged (the toast is a fixed, pointer-events overlay).
 */
type Box = { x: number; y: number; width: number; height: number } | null;

function boxesEqual(a: Box, b: Box): boolean {
  if (!a || !b) return false;
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.5;
  return eq(a.x, b.x) && eq(a.y, b.y) && eq(a.width, b.width) && eq(a.height, b.height);
}

test.describe("toast layout shift", () => {
  test("raising a toast causes zero layout shift", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    await page.waitForTimeout(500);

    const measure = () =>
      page.evaluate(() => {
        const header = document.querySelector("header");
        const main = document.querySelector("main");
        const hr = header?.getBoundingClientRect() ?? null;
        const mr = main?.getBoundingClientRect() ?? null;
        return {
          header: hr ? { x: hr.x, y: hr.y, width: hr.width, height: hr.height } : null,
          main: mr ? { x: mr.x, y: mr.y, width: mr.width, height: mr.height } : null,
          scrollWidth: document.documentElement.scrollWidth,
          bodyClientWidth: document.body.clientWidth,
        };
      });

    const before = await measure();

    // Raise a toast via the shipped CustomEvent.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("abode:toast", {
          detail: {
            variant: "success",
            title: "Smoke toast",
            description: "Layout-shift assertion toast.",
            duration: 4000,
          },
        }),
      );
    });

    // The toast is visible (role=status for the success variant).
    const toast = page.getByRole("status").filter({ hasText: "Smoke toast" });
    await expect(toast).toBeVisible();

    const during = await measure();

    expect(boxesEqual(before.header, during.header)).toBe(true);
    expect(boxesEqual(before.main, during.main)).toBe(true);
    expect(during.scrollWidth).toBe(before.scrollWidth);
    expect(during.bodyClientWidth).toBe(before.bodyClientWidth);

    // It is dismissible (close button is labelled).
    await toast.getByRole("button", { name: /dismiss notification/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Smoke toast" })).toHaveCount(0);
  });
});
