# Environment & Deployment

The env canon and deployment model for Abode Alerts. This is a durable operations
doc; the live `lib/env.ts`, `lib/firebase-admin.ts`, `.env.example`, and `package.json`
remain authoritative. No secret values appear here or in any tracked file.

## Hosting

- **One Vercel project, ever:** `realtor` (Next.js) under the `jamie-navin`
  (`jamienavinhill`) account, serving `https://abode-alerts.vercel.app/`. Do not
  create, fork, or re-link another project.
- **Deploys are automatic on `git push`.** Vercel's Git integration builds and
  deploys every push to the connected branch. There is **no deploy cron and no
  deploy GitHub Action** — "redeploy" means "push to git."
- Project link lives in the operator's local `.env`:
  `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_PAT`. These are operator-only and
  must never be added to the project's runtime envs.

## Env Canon

The single source of truth for names is `.env.example` (tracked, names only) and the
validation in `lib/env.ts`. There are two distinct lanes:

### App-runtime secrets (read by the app via `lib/env.ts`)

These must be set **both** locally (in gitignored `.env`) **and** on Vercel
(production + preview + development):

| Variable                        | Purpose                                                        | Notes                                                             |
| ------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `GEMINI_API_KEY`                | Server-side Gemini extraction (Gemini Developer API)           | `GOOGLE_API_KEY` accepted as a fallback alias; server-side only.  |
| `REALTY_API_KEYS`               | All RealtyAPI keys, comma-separated (`rt_` prefix)             | Adapter rotates across them; free plan ≈ 250 req/**MONTH** / key. |
| `INGEST_JOB_TOKEN`              | Bearer token gating `POST /api/ingest/*` and operator scripts  | Server-side only; never exposed to the browser.                   |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Inline Firebase Admin service-account JSON (Vercel/serverless) | Set on Vercel only; never committed.                              |

Locally, instead of `FIREBASE_SERVICE_ACCOUNT_JSON`, provide a **file path** to the
service account (see Credential Resolution):

| Variable                         | Purpose                                              |
| -------------------------------- | ---------------------------------------------------- |
| `PATH_TO_FIREBASE_ADMIN_SDK`     | Local path to the service-account JSON file.         |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternate path var (must point at the same SA file). |

Optional (unset = feature disabled):

| Variable                  | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `GOOGLE_SEARCH_API_KEY`   | Permitted public-search enrichment.     |
| `GOOGLE_SEARCH_ENGINE_ID` | Custom Search engine id for enrichment. |

### Operator-only (local `.env` only — NEVER on Vercel runtime)

`VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_PAT`, `USER_ID`, and the optional
script inputs `AUTH_DOMAINS`, `PROD_URL`, `SMOKE_URL`, `GOOGLE_TEST_EMAIL`,
`GOOGLE_TEST_PASSWORD`. These configure operator tooling and would be a privilege
escalation if pushed to the deployed app.

`firebase-applet-config.json` is **public** Firebase web-client config (apiKey,
authDomain, projectId, `firestoreDatabaseId: "abode-alerts"`, etc.) — it is not a
secret. Security comes from Firestore rules and the server-side admin credential.

## Firebase Admin Credential Resolution

`lib/firebase-admin.ts` and `lib/env.ts` resolve the admin credential in this order:

1. **`FIREBASE_SERVICE_ACCOUNT_JSON`** (inline JSON) — used on Vercel/serverless,
   where there is no writable, persistent file path. Parsed with `cert(...)`.
2. **`PATH_TO_FIREBASE_ADMIN_SDK`** → **`GOOGLE_APPLICATION_CREDENTIALS`** (file
   path) — used for Windows/local dev; the JSON file is read from disk.

If neither source is present, initialization throws a clear, actionable error and
the service-account contents are never logged. Initialization is **idempotent**:
`getApps()` is checked before `initializeApp`, and the Firestore handle is created
once against the named database id `abode-alerts`
(`getFirestore(app, "abode-alerts")`, per firebase-admin v13).

## Pushing Runtime Envs to Vercel (operator)

Use the project-scoped REST API with the operator PAT. The CLI is not installed; do
**not** run `vercel login` (a machine-global login would collide with other accounts
in use). The token is the account — pass it via the `Authorization` header.

Endpoint (verified against Vercel REST API docs, 2026-06-09):

```
POST https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env?teamId=$VERCEL_TEAM_ID&upsert=true
Authorization: Bearer $VERCEL_PAT
Content-Type: application/json

{
  "key": "INGEST_JOB_TOKEN",
  "value": "<value — never echoed into logs or tracked files>",
  "type": "encrypted",
  "target": ["production", "preview", "development"]
}
```

- `type: "encrypted"` stores the value encrypted at rest.
- `target` must include all three environments so preview and dev builds work too.
- `upsert=true` updates an existing variable instead of failing on conflict.
- Read back with `GET https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env`
  to confirm the **keys** exist (values stay encrypted/decrypt-on-demand) — never
  print decrypted values.
- For `FIREBASE_SERVICE_ACCOUNT_JSON`, the value is the **entire** service-account
  JSON as one inline string.

> Secrets must never be written into shell history files, tracked files, command
> descriptions, or logs. Read the value from the local `.env` / key file at call
> time; do not paste it.

## Authorized Domains (Firebase Auth)

Firebase Auth only completes sign-in from authorized domains. Required:
`localhost`, `127.0.0.1` (local dev), and `abode-alerts.vercel.app` (production).

`scripts/add-auth-domains.ts` reconciles these via the Identity Toolkit Admin API,
authenticating with the resolved Firebase Admin credential. It is additive (never
removes existing domains) and accepts extra domains via CLI args or `AUTH_DOMAINS`:

```bash
node --env-file=.env --import tsx scripts/add-auth-domains.ts
```

## Production Smoke

`scripts/vercel-listings-check.ts` (operator, intentional) verifies the live
deployment and writes artifacts to an OS temp directory (never the repo):

```bash
node --env-file=.env --import tsx scripts/vercel-listings-check.ts
```

It checks: (a) the production page renders the real listing baseline, and (b) the
protected route `POST /api/ingest/daily` returns **401/403 without a token** and a
**non-auth status with a valid token** (token read from `INGEST_JOB_TOKEN`, never
printed). The local auth-gate logic is covered by `tests/ingest-auth.test.ts` under
`npm run test`.

## Verified vs Operator-Pending (as of 2026-06-09)

Verified in code / local readback:

- Firebase Admin initializes from inline env JSON (Vercel) or a local file path
  (dev); a local readback returned the 88-listing baseline.
- `lib/env.ts` validates every app-runtime var with actionable, per-variable errors.
- The protected routes gate on `INGEST_JOB_TOKEN` with a constant-time compare;
  `tests/ingest-auth.test.ts` covers accept/reject, length-mismatch, and header
  precedence.
- Runtime envs were pushed to Vercel (production/preview/development, encrypted) and
  confirmed present by key readback in a prior WS2 pass.

Operator-pending (needs live credentials / a deployed build — not done in code):

- Run `scripts/add-auth-domains.ts` against the live project and confirm
  `localhost`, `127.0.0.1`, and `abode-alerts.vercel.app` are all authorized.
- Run `scripts/vercel-listings-check.ts` against production to confirm the
  protected-route gate (401 without token, non-auth with token) on the deployed URL.
- Set a billing/budget alert in Google Cloud if any genuinely-billable Blaze/paid
  service is enabled (currently within free quotas).
