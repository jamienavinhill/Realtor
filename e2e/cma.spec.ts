import { expect, test } from "@playwright/test";

/**
 * CMA pagination + sort (WS17 / Acceptance Criteria: CMA tables paginate and sort).
 *
 * Reachability: the CMA renders from the PUBLIC `properties` Firestore catalog
 * (client config is public; `properties` is world-readable per the rules), so it is
 * reachable WITHOUT sign-in. It does, however, require the live catalog to be
 * populated (the real ~88-listing 44224 baseline). When the running app can reach
 * Firestore and the catalog has rows, this exercises the real pagination + sort
 * controls. If the catalog is empty/unreachable from the test host (no network to
 * the Firebase project), the CMA shows its honest "data not loaded" empty state and
 * the pagination/sort assertions are SKIPPED with that reason — never faked.
 */
test.describe("CMA pagination and sort", () => {
  test("paginates and sorts the data table when the catalog is populated", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "CMA", exact: true }).click();

    await expect(page.getByRole("heading", { name: /comparative market analysis/i })).toBeVisible();

    // The "Data" view tab only renders when there are active listings. Wait briefly
    // for the Firestore snapshot; if it never arrives, the catalog is empty here.
    const dataTab = page.getByRole("tab", { name: "Data" });
    const populated = await dataTab
      .waitFor({ state: "visible", timeout: 12_000 })
      .then(() => true)
      .catch(() => false);

    test.skip(
      !populated,
      "Public `properties` catalog is empty or unreachable from this test host; " +
        "CMA shows its honest empty state. Run against a deployment/host that can " +
        "reach the populated Firebase project to exercise pagination/sort.",
    );

    await dataTab.click();

    const pagination = page.getByRole("navigation", { name: /table pagination/i });
    await expect(pagination).toBeVisible();

    // Pagination: default 10 rows/page, with a "Page X of Y" indicator.
    await expect(pagination.getByText(/Page \d+ of \d+/)).toBeVisible();

    // Change rows per page (10 -> 30) and confirm the page indicator recomputes.
    const rowsPerPage = pagination.getByLabel(/rows per page/i);
    const pageInfoBefore = await pagination.getByText(/Page \d+ of \d+/).innerText();
    await rowsPerPage.selectOption("30");
    await expect(async () => {
      const after = await pagination.getByText(/Page \d+ of \d+/).innerText();
      expect(after).not.toBe(pageInfoBefore);
    }).toPass({ timeout: 8_000 });

    // Sort: clicking the Price column header (a "Sort by Price" button inside the
    // <th>) sorts and sets aria-sort on that columnheader.
    const priceSortButton = page.getByRole("button", { name: /sort by price/i }).first();
    await priceSortButton.click();
    const priceColumnHeader = page.getByRole("columnheader", { name: /sort by price/i }).first();
    await expect(priceColumnHeader).toHaveAttribute("aria-sort", /ascending|descending/);
  });
});
