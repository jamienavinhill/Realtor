import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import firebaseConfig from "@/config/firebase/client-config.json";

// Domains that must be authorized for Firebase Auth sign-in to work:
//   - localhost / 127.0.0.1  → local Windows dev (next dev on :3000)
//   - the production Vercel URL → live app
// Extra domains (preview URLs, custom domains) can be passed as CLI args or in
// AUTH_DOMAINS (comma-separated). No secrets are read or printed here.
const REQUIRED_DOMAINS = ["localhost", "127.0.0.1", "abode-alerts.vercel.app"];

function extraDomains(): string[] {
  const fromArgs = process.argv.slice(2);
  const fromEnv = (process.env.AUTH_DOMAINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...fromArgs, ...fromEnv];
}

async function main() {
  const app = getFirebaseAdminApp();
  const credential = app.options.credential;
  if (!credential) {
    throw new Error("Firebase admin credential unavailable");
  }

  const { access_token: accessToken } = await credential.getAccessToken();
  const projectId = firebaseConfig.projectId;
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains`;

  const current = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!current.ok) {
    throw new Error(`Failed to read auth config: ${current.status} ${await current.text()}`);
  }
  const config = await current.json();
  const before = new Set<string>(config.authorizedDomains ?? []);
  const domains = new Set<string>(before);
  for (const domain of [...REQUIRED_DOMAINS, ...extraDomains()]) {
    domains.add(domain);
  }

  const added = [...domains].filter((domain) => !before.has(domain));
  if (added.length === 0) {
    console.log("Authorized domains already up to date:", [...domains].join(", "));
    return;
  }

  const update = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authorizedDomains: [...domains] }),
  });

  console.log("status", update.status);
  console.log("added", added.join(", "));
  console.log(await update.text());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
