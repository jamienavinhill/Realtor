import { test } from "@playwright/test";

/**
 * Auth-gated critical paths (WS17). These require a real authenticated session
 * (Firebase Auth + Google OAuth with Workspace scopes), which is UNAVAILABLE in a
 * headless/local/CI run — Google blocks automated OAuth, and there is intentionally
 * NO production auth backdoor in this app. Faking a signed-in session here would
 * either ship a backdoor or assert against fixtures that do not exercise the real
 * rules/UI, so these are documented MANUAL runbook steps instead (see
 * docs/operations/release-runbook.md) and are SKIPPED here — never faked.
 *
 * Decision: option (b) from the WS17 brief — documented manual runbook — was chosen
 * over wiring a test-only Firebase Auth emulator sign-in, because (1) the signed-in
 * dashboard reads the live `properties`/workspace data and the WS18 share flow sends
 * a real Gmail invite + OAuth consent that the emulator cannot stand in for end to
 * end, and (2) keeping zero auth bypass in shipped code is the stronger safety
 * posture. The signed-OUT half of the auth-chrome invariant IS covered for real in
 * auth-chrome.spec.ts; the rules half is covered by `npm run test:rules` (42 cases,
 * incl. 24 WS18 owner/editor/viewer/non-member cases).
 */

test.describe("auth-gated critical paths (manual runbook — OAuth required)", () => {
  test.skip("listings compact dialog + one listing action (interested/favorite/hide/compare)", () => {
    // MANUAL: sign in with Google, open a listing card -> compact floating dialog,
    // trigger one action, confirm a toast + persisted Firestore state. See
    // docs/operations/release-runbook.md step "Listings + one action".
  });

  test.skip("WS18 share/invite flow (owner -> viewer/editor -> accept -> scoped access)", () => {
    // MANUAL (two Google accounts): owner Profile menu -> Share workspace -> invite
    // mother as viewer -> she accepts the /invite/[token] link -> she sees his
    // listings/alerts/CMA read-only; editor invite can edit. See
    // docs/operations/release-runbook.md step "WS18 two-account sharing".
  });
});
