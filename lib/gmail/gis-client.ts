"use client";

/**
 * Google Identity Services (GIS) offline authorization-code helper.
 *
 * Firebase's `signInWithPopup` only yields a short-lived access token, so the app would
 * re-prompt for Gmail every session. To make sign-in set-and-forget, we run Google's
 * authorization-CODE flow once: the code is exchanged server-side for a long-lived refresh
 * token (stored encrypted) AND an id_token, which we use to sign into Firebase as the SAME
 * Google identity (so the account/uid is unchanged). One consent covers everything.
 *
 * CRITICAL: browsers block popups not opened directly inside a click. So we build the code
 * client AHEAD of time (`initSignIn` on mount) and open the consent popup SYNCHRONOUSLY in
 * the click handler (`requestOfflineAuthCode` — no awaits before `requestCode()`).
 */

interface CodeClient {
  requestCode: () => void;
}
interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: "popup";
  callback: (resp: { code?: string; error?: string; error_description?: string }) => void;
}
interface GoogleGsi {
  accounts: { oauth2: { initCodeClient: (config: CodeClientConfig) => CodeClient } };
}
declare global {
  interface Window {
    google?: GoogleGsi;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisPromise: Promise<void> | null = null;
let codeClient: CodeClient | null = null;
let resolver: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null;

function loadGis(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Identity Services only loads in the browser"));
  }
  if (gisPromise) return gisPromise;
  gisPromise = new Promise<void>((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * Load GIS and build the code client up front (call on mount), so the consent popup can be
 * opened synchronously on click without an intervening await that would break the gesture.
 */
export function initSignIn(clientId: string, scope: string): void {
  if (!clientId) return;
  void loadGis()
    .then(() => {
      if (codeClient || !window.google?.accounts?.oauth2) return;
      codeClient = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope,
        ux_mode: "popup",
        callback: (resp) => {
          const r = resolver;
          resolver = null;
          if (!r) return;
          if (resp.error) r.reject(new Error(resp.error_description || resp.error));
          else if (resp.code) r.resolve(resp.code);
          else r.reject(new Error("No authorization code returned"));
        },
      });
    })
    .catch(() => {
      /* best-effort; isSignInReady() stays false and the caller uses the popup fallback */
    });
}

/** True once the offline code client is built and the consent popup can open in-gesture. */
export function isSignInReady(): boolean {
  return codeClient !== null;
}

/**
 * Open Google's offline consent popup and resolve with the one-time code. MUST be called
 * directly inside a click handler with no preceding await. Requires `initSignIn` to have
 * finished (guard with `isSignInReady()` and fall back to the Firebase popup otherwise).
 */
export function requestOfflineAuthCode(): Promise<string> {
  if (!codeClient) return Promise.reject(new Error("sign-in-not-ready"));
  return new Promise<string>((resolve, reject) => {
    resolver = { resolve, reject };
    codeClient!.requestCode();
  });
}

/** All scopes requested in the single sign-in consent: identity + Gmail + Workspace. */
export const SIGNIN_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");
