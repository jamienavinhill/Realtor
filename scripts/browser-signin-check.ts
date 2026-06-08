import { appendFileSync } from "node:fs";
import { chromium } from "playwright";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import firebaseConfig from "@/firebase-applet-config.json";

const logPath =
  "C:\\Users\\james\\AppData\\Local\\Temp\\grok-goal-c79db15364ff\\implementer\\browser-smoke.log";
const screenshotPath =
  "C:\\Users\\james\\AppData\\Local\\Temp\\grok-goal-c79db15364ff\\implementer\\signin-avatar.png";

async function main() {
  getFirebaseAdminApp();
  const auth = getAuth();
  const users = await auth.listUsers(10);
  const googleUser = users.users.find(
    (user) =>
      user.photoURL && user.providerData.some((provider) => provider.providerId === "google.com"),
  );

  if (!googleUser) {
    appendFileSync(logPath, "\n## Sign-in check: no Google-linked Firebase user found\n");
    process.exitCode = 1;
    return;
  }

  const customToken = await auth.createCustomToken(googleUser.uid);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "load", timeout: 60_000 });
  await page.getByRole("button", { name: /sign in with google/i }).waitFor({ timeout: 15_000 });

  const signInPayload = JSON.stringify({
    token: customToken,
    config: firebaseConfig,
  });
  const signInResult = await page.evaluate(`(async () => {
    try {
      const { token, config } = ${signInPayload};
      const { initializeApp, getApps } =
        await import("https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js");
      const { getAuth, signInWithCustomToken } =
        await import("https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js");
      const app = getApps().length ? getApps()[0] : initializeApp(config);
      const clientAuth = getAuth(app);
      await signInWithCustomToken(clientAuth, token);
      return { ok: true, uid: clientAuth.currentUser?.uid ?? null };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  })()`);

  await page.waitForFunction(
    () => {
      const header = document.querySelector("header");
      if (!header) return false;
      const avatar =
        header.querySelector("img.h-9.w-9.rounded-full") ??
        header.querySelector("div.h-9.w-9.rounded-full[aria-label]");
      return avatar !== null;
    },
    { timeout: 15_000 },
  );

  const avatarCount = await page
    .locator("header img.h-9.w-9.rounded-full, header div.h-9.w-9.rounded-full[aria-label]")
    .count();
  await page.screenshot({ path: screenshotPath, fullPage: true });

  appendFileSync(
    logPath,
    `\n## Sign-In Avatar Verification (Google-linked Firebase user)\nTimestamp: ${new Date().toISOString()}\nEmail: ${googleUser.email}\nPhotoURL present: ${Boolean(googleUser.photoURL)}\nCustom token sign-in: ${JSON.stringify(signInResult)}\nAvatar elements: ${avatarCount}\nResult: ${avatarCount > 0 ? "PASS" : "FAIL"}\n`,
  );

  await browser.close();
  process.exitCode = avatarCount > 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
