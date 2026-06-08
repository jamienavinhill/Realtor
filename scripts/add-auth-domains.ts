import { getFirebaseAdminApp } from "@/lib/firebase-admin";
import firebaseConfig from "@/firebase-applet-config.json";

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
  const config = await current.json();
  const domains = new Set<string>(config.authorizedDomains ?? []);
  domains.add("localhost");
  domains.add("abode-alerts.vercel.app");

  const update = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ authorizedDomains: [...domains] }),
  });

  console.log("status", update.status);
  console.log(await update.text());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
