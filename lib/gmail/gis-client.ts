"use client";

/**
 * Google Identity Services (GIS) offline authorization-code helper.
 *
 * Firebase's `signInWithPopup` only yields a short-lived access token, so the app would
 * re-prompt for Gmail every session. To make sign-in set-and-forget, we run Google's
 * authorization-CODE flow once: the code is exchanged server-side for a long-lived refresh
 * token (stored encrypted) AND an id_token, which we use to sign into Firebase as the SAME
 * Google identity (so the account/uid is unchanged). One consent covers everything.
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

/** Preload the GIS script so the consent popup opens promptly on the user's click. */
export function preloadGis(): void {
  void loadGis().catch(() => {
    /* best-effort preload; the click handler retries */
  });
}

/**
 * Open Google's offline consent popup and resolve with the one-time authorization code.
 * Must be called from a user gesture (the consent popup is otherwise blocked).
 */
export async function requestOfflineAuthCode(clientId: string, scope: string): Promise<string> {
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services failed to initialize");
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initCodeClient({
      client_id: clientId,
      scope,
      ux_mode: "popup",
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error_description || resp.error));
        else if (resp.code) resolve(resp.code);
        else reject(new Error("No authorization code returned"));
      },
    });
    client.requestCode();
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
