import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAuth } from "firebase-admin/auth";
import { chromium, type BrowserContext, type Page } from "playwright";
import { getFirebaseAdminApp } from "@/lib/firebase-admin";

const IMPLEMENTER_DIR = join(tmpdir(), "abode-alerts-oauth-check");
const LOG_PATH = `${IMPLEMENTER_DIR}\\browser-smoke.log`;
const PROFILE_DIR = `${IMPLEMENTER_DIR}\\playwright-google-profile`;

type TargetName = "localhost" | "vercel";

type TargetConfig = {
  name: TargetName;
  url: string;
  screenshot: string;
};

type AvatarEvidence = {
  avatarCount: number;
  googlePhoto: boolean;
  fallbackInitial: boolean;
  signInButtonVisible: boolean;
  signedInChrome: boolean;
};

type RunResult = {
  target: TargetName;
  url: string;
  pass: boolean;
  skipped: boolean;
  skipReason?: string;
  oauthAttempted: boolean;
  oauthCompleted: boolean;
  usedSavedSession: boolean;
  blockers: string[];
  avatar: AvatarEvidence;
  popupUrl?: string;
};

const TARGETS: Record<TargetName, TargetConfig> = {
  localhost: {
    name: "localhost",
    url: "http://localhost:3000",
    screenshot: `${IMPLEMENTER_DIR}\\oauth-localhost.png`,
  },
  vercel: {
    name: "vercel",
    url: "https://abode-alerts.vercel.app",
    screenshot: `${IMPLEMENTER_DIR}\\oauth-vercel.png`,
  },
};

function logSection(lines: string[]) {
  appendFileSync(LOG_PATH, `\n${lines.join("\n")}\n`);
}

function parseTargetArg(): TargetName | "all" {
  const arg = process.argv.find((value) => value.startsWith("--target="));
  if (!arg) return "all";
  const value = arg.split("=")[1]?.trim().toLowerCase();
  if (value === "localhost" || value === "vercel" || value === "all") return value;
  return "all";
}

function parseForceSignIn(): boolean {
  return process.argv.includes("--force-sign-in");
}

function clearChromiumOriginStorage(profileDir: string, host: string): void {
  const hostVariants = [host, host.replace(/[.:]/g, "_")];
  const prefixes = hostVariants.flatMap((variant) => [`http_${variant}`, `https_${variant}`]);
  const idbDir = join(profileDir, "Default", "IndexedDB");
  if (!existsSync(idbDir)) return;
  for (const entry of readdirSync(idbDir)) {
    if (prefixes.some((prefix) => entry.startsWith(prefix))) {
      rmSync(join(idbDir, entry), { recursive: true, force: true });
    }
  }
}

async function isServerUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForAuthSettled(page: Page): Promise<string | undefined> {
  await page.locator("header").waitFor({ timeout: 60_000 });

  const settled = await page
    .waitForFunction(
      () => {
        const header = document.querySelector("header");
        if (!header) return false;
        const spinner = header.querySelector(".animate-spin");
        const signIn = Array.from(header.querySelectorAll("button")).some((button) =>
          /^sign in$/i.test((button.textContent ?? "").trim()),
        );
        const avatar =
          header.querySelector('img.h-9.w-9.rounded-full[src*="googleusercontent"]') ??
          header.querySelector("div.h-9.w-9.rounded-full");
        return !spinner && (signIn || avatar !== null);
      },
      { timeout: 60_000 },
    )
    .then(() => undefined)
    .catch(
      () =>
        "Firebase auth chrome did not settle within 60s (spinner stuck or sign-in/avatar never rendered)",
    );

  await page.waitForTimeout(500).catch(() => undefined);
  return settled;
}

async function collectAvatarEvidence(page: Page): Promise<AvatarEvidence> {
  const googlePhotoCount = await page
    .locator('header img.h-9.w-9.rounded-full[src*="googleusercontent"]')
    .count();
  const anyAvatarImgCount = await page.locator("header img.h-9.w-9.rounded-full").count();
  const fallbackCount = await page.locator("header div.h-9.w-9.rounded-full").count();
  const signInButtonVisible = await page
    .getByRole("button", { name: /^sign in$/i })
    .isVisible()
    .catch(() => false);

  const signedInChrome = googlePhotoCount > 0 || fallbackCount > 0;

  return {
    avatarCount: Math.max(anyAvatarImgCount, fallbackCount),
    googlePhoto: googlePhotoCount > 0,
    fallbackInitial: fallbackCount > 0 && googlePhotoCount === 0,
    signInButtonVisible,
    signedInChrome,
  };
}

async function clickIfVisible(page: Page, selector: string): Promise<boolean> {
  const locator = page.locator(selector).first();
  if ((await locator.count()) === 0) return false;
  if (!(await locator.isVisible().catch(() => false))) return false;
  await locator.click({ timeout: 5_000 }).catch(() => undefined);
  return true;
}

async function completeGoogleOAuthPopup(
  popup: Page,
  email: string | undefined,
  password: string | undefined,
  accountEmail?: string,
): Promise<{ completed: boolean; blockers: string[]; lastUrl: string }> {
  const blockers: string[] = [];
  const deadline = Date.now() + 120_000;

  while (!popup.isClosed() && Date.now() < deadline) {
    await popup.waitForLoadState("domcontentloaded").catch(() => undefined);
    const url = popup.url();

    if (url.includes("accounts.google.com") || url.includes("google.com")) {
      const accountChooser = popup.locator(
        '[data-email], div[data-identifier], div[role="link"][data-identifier]',
      );
      if ((await accountChooser.count()) > 0) {
        await accountChooser
          .first()
          .click({ timeout: 5_000 })
          .catch(() => undefined);
        await popup.waitForTimeout(1_500);
        continue;
      }

      const emailInput = popup.locator('input[type="email"], input#identifierId');
      if (
        email &&
        (await emailInput.count()) > 0 &&
        (await emailInput
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await emailInput.first().fill(email);
        await popup.getByRole("button", { name: /^next$/i }).click({ timeout: 5_000 });
        await popup.waitForTimeout(1_500);
        continue;
      }

      const passwordInput = popup.locator('input[type="password"], input[name="Passwd"]');
      if (
        password &&
        (await passwordInput.count()) > 0 &&
        (await passwordInput
          .first()
          .isVisible()
          .catch(() => false))
      ) {
        await passwordInput.first().fill(password);
        await popup.getByRole("button", { name: /^next$/i }).click({ timeout: 5_000 });
        await popup.waitForTimeout(1_500);
        continue;
      }

      if (!email && !password) {
        if (accountEmail) {
          const accountTile = popup.locator(
            `[data-email="${accountEmail}"], div[data-identifier="${accountEmail}"]`,
          );
          if ((await accountTile.count()) > 0) {
            await accountTile
              .first()
              .click({ timeout: 5_000 })
              .catch(() => undefined);
            await popup.waitForTimeout(1_500);
            continue;
          }
        }

        const needsEmail = (await emailInput.count()) > 0;
        const needsPassword = (await passwordInput.count()) > 0;
        if (needsEmail || needsPassword) {
          blockers.push(
            "Google login form requires credentials but GOOGLE_TEST_EMAIL/GOOGLE_TEST_PASSWORD are not set",
          );
          break;
        }
      }
    }

    const consentButton = popup.getByRole("button", {
      name: /^(continue|allow|accept|next)$/i,
    });
    if ((await consentButton.count()) > 0) {
      await consentButton
        .first()
        .click({ timeout: 5_000 })
        .catch(() => undefined);
      await popup.waitForTimeout(1_500);
      continue;
    }

    await clickIfVisible(popup, 'button:has-text("Continue")');
    await clickIfVisible(popup, 'button:has-text("Allow")');
    await popup.waitForTimeout(1_000);
  }

  if (!popup.isClosed()) {
    blockers.push(`OAuth popup still open after timeout (${popup.url()})`);
  }

  return {
    completed: popup.isClosed(),
    blockers,
    lastUrl: popup.isClosed() ? "closed" : popup.url(),
  };
}

async function runOAuthCheck(
  context: BrowserContext,
  target: TargetConfig,
  credentials: { email?: string; password?: string; accountEmail?: string },
  options: { forceSignIn: boolean },
): Promise<RunResult> {
  const blockers: string[] = [];
  const page = await context.newPage();

  let oauthAttempted = false;
  let oauthCompleted = false;
  let usedSavedSession = false;
  let popupUrl: string | undefined;

  try {
    await page.goto(target.url, { waitUntil: "load", timeout: 60_000 });
    const authBlocker = await waitForAuthSettled(page);
    if (authBlocker) blockers.push(authBlocker);

    let avatar = await collectAvatarEvidence(page);

    if (avatar.signedInChrome && !options.forceSignIn) {
      usedSavedSession = true;
    } else if (options.forceSignIn && avatar.signedInChrome) {
      blockers.push(
        "Force sign-in requested but Firebase session still present after origin storage clear",
      );
    } else if (avatar.signInButtonVisible) {
      const signInButton = page.getByRole("button", { name: /^sign in$/i });
      oauthAttempted = true;

      const popupPromise = page.waitForEvent("popup", { timeout: 20_000 });
      await signInButton.click();

      let popup: Page | null = null;
      try {
        popup = await popupPromise;
      } catch {
        blockers.push(
          "No OAuth popup opened after clicking Sign in (check Firebase authorized domains / popup blockers)",
        );
      }

      if (popup) {
        popupUrl = popup.url();
        await popup
          .waitForLoadState("domcontentloaded", { timeout: 30_000 })
          .catch(() => undefined);

        const oauthResult = await completeGoogleOAuthPopup(
          popup,
          credentials.email,
          credentials.password,
          credentials.accountEmail,
        );
        oauthCompleted = oauthResult.completed;
        blockers.push(...oauthResult.blockers);
        popupUrl = oauthResult.lastUrl === "closed" ? popupUrl : oauthResult.lastUrl;
      }

      await waitForAuthSettled(page);
      await page
        .waitForFunction(
          () => {
            const header = document.querySelector("header");
            if (!header) return false;
            const googlePhoto = header.querySelector(
              'img.h-9.w-9.rounded-full[src*="googleusercontent"]',
            );
            const fallback = header.querySelector("div.h-9.w-9.rounded-full");
            return googlePhoto !== null || fallback !== null;
          },
          { timeout: 20_000 },
        )
        .catch(() => undefined);

      avatar = await collectAvatarEvidence(page);
    } else if (!authBlocker) {
      blockers.push("Sign in button not visible after auth settled (unexpected header state)");
    }

    await page.screenshot({ path: target.screenshot, fullPage: true }).catch(() => undefined);

    if (avatar.signedInChrome && oauthAttempted) {
      oauthCompleted = true;
    }

    const pass = options.forceSignIn
      ? avatar.signedInChrome && oauthAttempted
      : avatar.signedInChrome && (oauthAttempted || usedSavedSession);

    return {
      target: target.name,
      url: target.url,
      pass,
      skipped: false,
      oauthAttempted,
      oauthCompleted,
      usedSavedSession,
      blockers,
      avatar,
      popupUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    blockers.push(message);
    await page.screenshot({ path: target.screenshot, fullPage: true }).catch(() => undefined);
    const avatar = await collectAvatarEvidence(page).catch(() => ({
      avatarCount: 0,
      googlePhoto: false,
      fallbackInitial: false,
      signInButtonVisible: true,
      signedInChrome: false,
    }));

    if (avatar.signedInChrome && oauthAttempted) {
      oauthCompleted = true;
    }

    return {
      target: target.name,
      url: target.url,
      pass: options.forceSignIn
        ? avatar.signedInChrome && oauthAttempted
        : avatar.signedInChrome && (oauthAttempted || usedSavedSession),
      skipped: false,
      oauthAttempted,
      oauthCompleted,
      usedSavedSession,
      blockers,
      avatar,
      popupUrl,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

function formatRunLog(result: RunResult, credentialsAvailable: boolean): string[] {
  const lines = [
    `## Google OAuth Check (${result.target})`,
    `Timestamp: ${new Date().toISOString()}`,
    `URL: ${result.url}`,
    `Screenshot: ${TARGETS[result.target].screenshot}`,
    `Credentials available: ${credentialsAvailable}`,
    `Force sign-in click flow: ${process.argv.includes("--force-sign-in")}`,
    `Skipped: ${result.skipped}${result.skipReason ? ` (${result.skipReason})` : ""}`,
    `Used saved session: ${result.usedSavedSession}`,
    `OAuth attempted: ${result.oauthAttempted}`,
    `OAuth popup completed: ${result.oauthCompleted}`,
    `Popup URL: ${result.popupUrl ?? "n/a"}`,
    `Avatar evidence: ${JSON.stringify(result.avatar)}`,
  ];

  if (result.blockers.length > 0) {
    lines.push("Blockers:");
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  lines.push(
    `Signed-in chrome verified: ${result.avatar.signedInChrome} (googlePhoto=${result.avatar.googlePhoto})`,
  );
  lines.push(`Result: ${result.skipped ? "SKIP" : result.pass ? "PASS" : "FAIL"}`);
  return lines;
}

async function main() {
  mkdirSync(IMPLEMENTER_DIR, { recursive: true });
  mkdirSync(PROFILE_DIR, { recursive: true });

  const targetArg = parseTargetArg();
  const forceSignIn = parseForceSignIn();
  getFirebaseAdminApp();
  const auth = getAuth();
  const users = await auth.listUsers(10);
  const googleUser = users.users.find((user) =>
    user.providerData.some((provider) => provider.providerId === "google.com"),
  );
  const accountEmail = googleUser?.email ?? undefined;

  const email = process.env.GOOGLE_TEST_EMAIL?.trim() ?? accountEmail;
  const password = process.env.GOOGLE_TEST_PASSWORD?.trim();
  const credentialsAvailable = Boolean(email && password);
  const headless = false;

  const selectedTargets: TargetConfig[] = [];
  if (targetArg === "all" || targetArg === "localhost") selectedTargets.push(TARGETS.localhost);
  if (targetArg === "all" || targetArg === "vercel") selectedTargets.push(TARGETS.vercel);

  const launchContext = async () =>
    chromium.launchPersistentContext(PROFILE_DIR, {
      headless,
      channel: process.platform === "win32" ? "chrome" : undefined,
      viewport: { width: 1366, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
    });

  let context = await launchContext();
  const results: RunResult[] = [];

  try {
    for (const target of selectedTargets) {
      if (forceSignIn) {
        await context.close().catch(() => undefined);
        clearChromiumOriginStorage(PROFILE_DIR, new URL(target.url).host);
        context = await launchContext();
      }

      if (target.name === "localhost") {
        const up = await isServerUp(target.url);
        if (!up) {
          const skipped: RunResult = {
            target: target.name,
            url: target.url,
            pass: false,
            skipped: true,
            skipReason: "dev server not responding on :3000",
            oauthAttempted: false,
            oauthCompleted: false,
            usedSavedSession: false,
            blockers: ["http://localhost:3000 did not respond"],
            avatar: {
              avatarCount: 0,
              googlePhoto: false,
              fallbackInitial: false,
              signInButtonVisible: false,
              signedInChrome: false,
            },
          };
          results.push(skipped);
          logSection(formatRunLog(skipped, credentialsAvailable));
          continue;
        }
      }

      const result = await runOAuthCheck(
        context,
        target,
        { email, password, accountEmail },
        { forceSignIn },
      );
      results.push(result);
      logSection(formatRunLog(result, credentialsAvailable));
    }
  } finally {
    await context.close().catch(() => undefined);
  }

  const ran = results.filter((result) => !result.skipped);
  const allPass = ran.length > 0 && ran.every((result) => result.pass);
  const anyFail = ran.some((result) => !result.pass);

  logSection([
    "## Google OAuth Summary",
    `Timestamp: ${new Date().toISOString()}`,
    `Profile: ${PROFILE_DIR}`,
    `Targets: ${results.map((result) => `${result.target}=${result.skipped ? "SKIP" : result.pass ? "PASS" : "FAIL"}`).join(", ")}`,
    `Overall: ${ran.length === 0 ? "SKIP" : allPass ? "PASS" : "FAIL"}`,
  ]);

  if (anyFail || ran.length === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  logSection(["## Google OAuth Check — script error", message, "Result: FAIL"]);
  console.error(error);
  process.exitCode = 1;
});
