import { expect, test } from "@playwright/test";

/**
 * Auth chrome — signed-out state (WS17 / Acceptance Criteria: auth chrome).
 *
 * Fully reachable without OAuth: the header renders the "Sign in" control and NO
 * avatar / profile menu when no user is authenticated. Sign-in and avatar are
 * mutually exclusive. This asserts the signed-out half of that invariant (the
 * signed-in half requires a real Google session — see auth-gated.spec.ts).
 */
test.describe("auth chrome (signed out)", () => {
  test("shows the Sign in control and no avatar/profile menu", async ({ page }) => {
    await page.goto("/");

    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Auth resolves from a loading spinner to the signed-out control.
    const signIn = header.getByRole("button", { name: /sign in/i });
    await expect(signIn).toBeVisible();

    // No profile menu trigger and no avatar image while signed out.
    await expect(header.getByRole("button", { name: /open profile menu/i })).toHaveCount(0);
    await expect(header.locator("img.h-9.w-9.rounded-full")).toHaveCount(0);

    // Sign-in and avatar are mutually exclusive: exactly one Sign in control, no avatar.
    await expect(signIn).toHaveCount(1);
  });
});
