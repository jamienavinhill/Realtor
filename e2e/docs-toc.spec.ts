import { expect, test } from "@playwright/test";

/**
 * Docs TOC pinned (WS17 / Acceptance Criteria: docs TOC pinned, main scrolls
 * independently). Reachable without OAuth — the Docs tab renders for everyone.
 *
 * The DocsView's inner `main` is the SOLE scroll container; the TOC `nav` is fixed
 * in the layout. Asserting: scrolling the docs main column moves its content but
 * leaves the TOC's viewport box unchanged.
 */
test.describe("docs TOC", () => {
  test("stays pinned while the main docs column scrolls", async ({ page }) => {
    await page.goto("/");

    // Navigate to the Docs tab (desktop nav button).
    await page.getByRole("button", { name: "Docs", exact: true }).click();

    const toc = page.getByRole("navigation", { name: /documentation sections/i });
    await expect(toc).toBeVisible();

    // The DocsView's inner <main> is the SOLE scroll container (overflow-y-auto);
    // it holds the section headings. The page nests it inside two outer <main>
    // wrappers, so target the scrollable one directly.
    const docsMain = page.locator("main.overflow-y-auto").filter({ has: page.locator("#intro") });
    await expect(docsMain).toBeVisible();

    const tocBefore = await toc.boundingBox();
    expect(tocBefore).not.toBeNull();

    // Scroll the docs main column to the bottom; the window itself must not scroll.
    const scrolled = await docsMain.evaluate((el) => {
      const before = el.scrollTop;
      el.scrollTop = el.scrollHeight;
      return { before, after: el.scrollTop, scrollHeight: el.scrollHeight };
    });
    // The column actually scrolled (content overflows and moved).
    expect(scrolled.after).toBeGreaterThan(scrolled.before);

    // Give layout a beat, then re-measure the TOC.
    await page.waitForTimeout(200);
    const tocAfter = await toc.boundingBox();
    expect(tocAfter).not.toBeNull();

    // The TOC's viewport position is unchanged (pinned) despite the main scroll.
    expect(Math.abs(tocAfter!.y - tocBefore!.y)).toBeLessThan(1);
    expect(Math.abs(tocAfter!.x - tocBefore!.x)).toBeLessThan(1);
  });
});
