# Auth & Secrets

The authentication, authorization, and secret-handling model for Abode Alerts. This is a
durable architecture doc. The live `config/firebase/firestore.rules`, `lib/env.ts`,
`lib/firebase-admin.ts`, `lib/crypto/token-cipher.ts`, the `app/api/*` routes, and
`.env.example` remain authoritative; this doc explains the trust boundaries they enforce.
No secret values appear here or in any tracked file.

Companion docs: `docs/operations/env-and-deploy.md` (env canon, Vercel push, authorized
domains, operator smoke) and `docs/architecture/data-model.md` (collection contracts and
the full Firestore access table).

## Identity (Firebase Auth)

- **Sign-in:** Google via Firebase Authentication (`signInWithPopup`, `GoogleAuthProvider`).
  The browser holds a short-lived Firebase **ID token** and a Google OAuth **access token**
  (for Gmail/Sheets/Calendar calls). It never holds a long-lived Google refresh token.
- **Authorized domains:** Firebase Auth only completes sign-in from authorized domains —
  `localhost`, `127.0.0.1`, and `abode-alerts.vercel.app`. Reconciled by
  `scripts/add-auth-domains.ts` (see `env-and-deploy.md`). Operator-pending to confirm live.
- **Server identity check:** privileged API routes verify the caller's Firebase ID token
  with the Admin SDK (`getAdminAuth().verifyIdToken`) and derive the uid server-side. A
  client-supplied uid is never trusted. Pattern: `extractBearerToken` →
  `verifyIdToken` (see `lib/account/route-helpers.ts`, `app/api/gmail/connect/route.ts`,
  `lib/api/properties-handler.ts`).

## Two secret lanes

Per `AGENTS.md`, secrets are split into two lanes that never mix. Names (not values) are
canonized in `.env.example` and validated by `lib/env.ts`. The full tables live in
`docs/operations/env-and-deploy.md`; the summary:

- **Operator scope** — credentials the operator/agent uses to deploy and inspect
  dashboards: `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_PAT`, and operator script
  inputs. **Local `.env` only — never pushed to the Vercel runtime** (that would be a
  privilege escalation).
- **App-runtime secrets** — values the deployed app reads at runtime via `lib/env.ts`:
  `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`
  (or a local file path), `TOKEN_ENCRYPTION_KEY`, the Google OAuth client id/secret, the
  Gmail Pub/Sub vars, and the optional search keys. Set both locally and on Vercel.

`config/firebase/client-config.json` is **public** Firebase web-client config, not a
secret. Security comes from Firestore rules and the server-side admin credential.

## Encrypted OAuth refresh-token persistence (finalized — WS7, re-confirmed WS16)

The email pipeline (and the best-effort invite email) must call Gmail **without a browser
session**, which requires a durable Google OAuth refresh token. The decision, confirmed
against the WS16 bar (encrypted, user-scoped, server-side, rules-hardened):

- **Acquisition is server-side.** The browser performs the Google offline/code flow and
  sends only the one-time authorization `code` to `POST /api/gmail/connect`. The route
  exchanges it for a refresh token server-side (`google-auth-library`). The browser never
  holds the refresh token.
- **Encrypted at rest.** The token is encrypted with **AES-256-GCM** before write
  (`lib/crypto/token-cipher.ts`): a fresh 12-byte IV per encryption, a 16-byte auth tag
  for tamper detection, wire format `v1.<iv>.<tag>.<ciphertext>` (base64url). The key is
  `TOKEN_ENCRYPTION_KEY`, a base64 32-byte server-only value. Covered by
  `tests/token-cipher.test.ts`.
- **User-scoped & server-only.** Stored at `users/{uid}/gmailSync/main` as `refreshTokenEnc`.
  Firestore rules **deny all client read and write** to `gmailSync` — even the owner's own
  authenticated client (proven in the emulator test). Only the Admin SDK reads/decrypts it,
  server-side, when minting an access token (`lib/repositories/gmail-sync.ts` →
  `getDecryptedRefreshToken`). The plaintext token never crosses the server boundary and is
  never logged.

This meets the bar; no weakness was found in the WS16 re-audit.

## Firestore rules posture

Global **deny-by-default** (`match /{document=**} { allow read, write: if false }`); every
collection opens explicitly. Roles come from `accounts/{ownerUid}/members/{memberUid}`
(WS18): **owner** (the path uid), **editor**, **viewer**, resolved by `canReadWorkspace`
(viewer+) / `canEditWorkspace` (editor+). Full per-path table: `data-model.md`.

| Collection                                                  | Read                            | Write                                                                          |
| ----------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `properties/{id}`                                           | **public** (`list, get: true`)  | **server-only** — client create/update/delete denied (WS16)                    |
| `alerts/{id}`                                               | owner or workspace member       | owner/editor; cannot re-owner; viewer denied                                   |
| `alert_matches/{id}`                                        | owner or workspace member       | server-only (Admin SDK)                                                        |
| `ingest_runs`, `provider_quota`                             | denied to clients               | server-only (Admin SDK)                                                        |
| `users/{uid}/gmailSync/*`                                   | **denied (even owner)**         | **denied (even owner)** — server-only                                          |
| `users/{uid}/profile`, `listingPreferences`, `compareQueue` | viewer+                         | editor+; profile delete owner-only                                             |
| `accounts/{owner}/members/{m}`                              | owner or member                 | owner/editor at/below editor; never the owner record (`memberUid != ownerUid`) |
| `invites/{token}`                                           | owner or the invited-email user | server-only (mint/accept/revoke via Admin SDK)                                 |

Invariants enforced and tested (`tests/emulator/*`, 42 cases): a non-member reads/writes
nothing; a viewer cannot write; an editor cannot remove/demote the owner or delete the
account; `gmailSync`/`provider_quota`/`ingest_runs` are never client-readable or
client-writable; `alert_matches` reject all client writes (signed-in and anon); the shared
catalog cannot be mutated from the browser. The WS16-pass-2 adversarial re-audit
re-derived every invariant with fresh eyes and found no hole; the four server-only
collections (`alert_matches`, `ingest_runs`, `provider_quota`, plus the existing
`properties`/`gmailSync` cases) now have explicit deny proofs.

### Shared-catalog hardening (WS16 — the key change)

Previously any signed-in client could create/update/delete `properties/{id}`, letting a
browser write arbitrary shared listing state. WS16 closes this:

- **Rules:** `properties` writes are now `if false`. Reads stay public.
- **Server commit path:** the manual scan/paste → review → commit flow POSTs the reviewed
  listings to `POST /api/properties` with `action: "commit"` and the user's Firebase ID
  token. The route verifies the token (Admin SDK), re-validates and re-provenances each
  listing server-side (`lib/ingest/manual-normalize.ts` — synthesizes `source`,
  `sourceProvider`, `dedupeKey`, `rawHash`, `ingestedAt`/`updatedAt`; never invents geo or
  media), and writes via the Admin SDK repository (`upsertListing`). A `delete_listing`
  action mirrors this for the listing delete button.
- **Extraction actions gated (WS16 pass 2):** the upstream Gemini-extraction actions on the
  same route — `parse_gmail` and `parse_raw_text` — now also require a verified Firebase ID
  token (defense-in-depth / cost protection: Gemini is a billable surface that previously
  accepted an unauthenticated `parse_raw_text` call, and only a Google access token on
  `parse_gmail`). `parse_raw_text` carries the ID token as the `Authorization: Bearer`
  value; `parse_gmail` carries the Google OAuth **access** token in `Authorization` (used
  for the Gmail REST calls) and the Firebase **ID** token in a separate
  `X-Firebase-Id-Token` header — the two token types never share a header. An
  unauthenticated caller now gets an honest 401 before any Gemini client is constructed.
- **Testable seam:** the route logic lives in `lib/api/properties-handler.ts`
  (`handlePropertiesPost(req, deps)`) with injected dependencies (ID-token verification +
  the listing repository), mirroring the `runDailyRefresh({ deps })` pattern. The thin
  `app/api/properties/route.ts` wires the real Admin-SDK deps; `tests/properties-route.test.ts`
  drives the handler with in-memory fakes — covering 401-without-token, 401-on-invalid-token,
  the normalize→upsert happy path, delete, and the extraction-action gates — inside the
  standard `npm run test` suite (no live Firebase).
- **Result:** the manual UX is unchanged end-to-end, but the browser can no longer write
  shared catalog state, the billable extraction surface is no longer reachable
  unauthenticated, and every committed listing carries audited provenance identical in
  shape to the email/RealtyAPI lanes.

## Server-job auth (`INGEST_JOB_TOKEN`)

Scheduled/automation routes are gated by a bearer token, not a user session:

- `POST /api/ingest/backfill` and `POST /api/ingest/daily` require `INGEST_JOB_TOKEN` via
  `Authorization: Bearer` or `x-ingest-token`, checked with a **constant-time compare**
  (`lib/ingest/auth.ts`). Missing token → 401; unconfigured server → 503. Covered by
  `tests/ingest-auth.test.ts`.
- The Gmail Pub/Sub push handler (`/api/gmail/push`) is additionally gated by a
  `?token=` shared secret (`PUBSUB_PUSH_TOKEN`) and the expected push service-account
  email — a separate lane from the ingest token.

## App Check / abuse mitigation (documented path — operator-pending enablement)

App Check is the chosen abuse mitigation for the public client surfaces (`properties` read,
the authenticated commit/parse routes). Enablement requires console/registration steps that
cannot be performed in code and could incur reCAPTCHA Enterprise quota, so it is documented
here as **operator-pending**, per the roadmap's allowance for a documented path.

Code shape (verified against the Firebase JS SDK, 2026-06-10): App Check is initialized
once in the client Firebase init (`lib/firebase.ts`) and Firestore/Functions then attach
the `x-firebase-appcheck` token automatically:

```ts
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(APP_CHECK_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
```

Operator enablement steps (console — not code):

1. In the **Firebase console → App Check**, register the web app with a **reCAPTCHA
   Enterprise** provider; copy the site key.
2. Add the site key as a **public** build-time value (it is not a secret — it ships to the
   browser) and wire the `initializeAppCheck` call above into `lib/firebase.ts`.
3. Register Admin-SDK/server contexts as **debug** or service tokens as needed so the
   server and CI are not blocked.
4. Set Firestore (and any callable) App Check enforcement to **"Monitor"** first; review
   metrics; only then switch to **"Enforce"**. Enforcement is a console toggle.

Interim mitigations already in force without App Check: deny-by-default rules, public read
limited to the non-sensitive catalog, all sensitive collections owner/role-gated or
server-only, server-side ID-token verification on every privileged route, and
`INGEST_JOB_TOKEN` on automation routes.

## Operator-pending account actions (cannot be done in code)

These are console/account actions. They must be performed by the operator with live
credentials; the agent does **not** run live Vercel/Firebase account mutations and does not
`vercel login`. Fail closed on any uncertainty.

1. **Firebase authorized domains** — confirm `localhost`, `127.0.0.1`, and
   `abode-alerts.vercel.app` are authorized:
   `node --env-file=.env --import tsx scripts/add-auth-domains.ts`, or Firebase console →
   Authentication → Settings → Authorized domains.
2. **Vercel runtime envs** — confirm present on production + preview + development (keys
   only; values stay encrypted): `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`,
   `FIREBASE_SERVICE_ACCOUNT_JSON`, `TOKEN_ENCRYPTION_KEY`, `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, the Gmail Pub/Sub vars, and the optional search vars.
   Read back: `GET https://api.vercel.com/v9/projects/$VERCEL_PROJECT_ID/env` (see
   `env-and-deploy.md`). Never print decrypted values.
3. **Scheduler/ingest token** — confirm the scheduler (GitHub Action / cron) sends
   `INGEST_JOB_TOKEN` and that `POST /api/ingest/daily` returns 401 without it / non-auth
   with it: `node --env-file=.env --import tsx scripts/vercel-listings-check.ts`.
4. **App Check** — perform the registration + enforcement steps above when ready.
5. **Budget alerts** — set a Google Cloud billing/budget alert if any genuinely-billable
   Blaze/paid service (e.g. reCAPTCHA Enterprise over free quota, Blaze Firestore) is
   enabled. Currently within free quotas.
