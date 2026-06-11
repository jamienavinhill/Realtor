# Production Release Runbook

A repeatable, checkable manual smoke checklist for verifying a production deployment of
Abode Alerts against the roadmap Acceptance Criteria. The automated gate
(`npm run verify`, `npm run test:rules`, `npm run test:e2e`, and CI in
`.github/workflows/ci.yml`) proves the reachable surface; **this runbook covers what
automation cannot reach without live Google OAuth and a deployed build** — the operator
runs it by hand against the production URL (`https://abode-alerts.vercel.app/`).

See `development-workflow.md` for the full release ladder (which rungs run in CI vs. here).

## Before you start (operator prerequisites)

These are live-account / live-project steps automation does not perform. Confirm each
once per environment; several are tracked as operator-pending in `env-and-deploy.md` and
`auth-and-secrets.md`.

- [ ] **Vercel envs present** — `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`,
      `FIREBASE_SERVICE_ACCOUNT_JSON`, optional search envs, scheduler secret. Read back
      keys via the Vercel REST API (values stay encrypted; never print them).
- [ ] **Firebase authorized domains** include `localhost`, `127.0.0.1`, and
      `abode-alerts.vercel.app` (run `scripts/add-auth-domains.ts`).
- [ ] **GitHub Actions repo config** — secret `INGEST_JOB_TOKEN` and variable
      `INGEST_BASE_URL` set (used by `gmail-rewatch.yml` + `ingest-poll.yml`).
- [ ] **Gmail watch / Pub-Sub registration** — `POST /api/gmail/watch` registered so the
      email → Pub/Sub push pipeline is live; the weekly `gmail-rewatch.yml` Action renews it.
- [ ] **OAuth consent / verification** — the Google OAuth consent screen is configured
      with the Workspace scopes (gmail.readonly, spreadsheets, calendar, drive.file) and
      the test/published status the live accounts need.
- [ ] **Budget alert** — a Google Cloud budget alert is set if any genuinely-billable
      Blaze/paid service is enabled (currently within free quotas).

## Automated gate (run first)

- [ ] `npm run verify` is GREEN (lint, typecheck, format:check, unit tests, build).
- [ ] `npm run test:rules` is GREEN (42 emulator cases; needs Java + the Firestore emulator).
- [ ] `npm run test:e2e` reachable smokes PASS (auth chrome, docs TOC, CMA pagination/sort,
      toast non-shift, protected route); auth-gated specs are skipped (covered below).

## Manual production smoke checklist

Run against the deployed URL with a real Google account. Each item maps to an Acceptance
Criterion.

### 1. Sign-in → profile-menu sign-out (auth chrome)

- [ ] Signed out: the header shows **"Sign in"** only — no avatar, no profile menu.
- [ ] Click **Sign in**, complete Google OAuth (with Workspace scopes).
- [ ] Signed in: the header shows the **avatar + profile menu** (name, Share workspace,
      Sign out) and **no** header Sign-in control — they are mutually exclusive.
- [ ] Open the profile menu → **Sign out** returns to the signed-out chrome.

### 2. Listings: ~88 with compact dialog + one action

- [ ] The Leads tab shows the real 44224 baseline (~88 listings), each with provenance
      and no invented/stock media (no-media listings show an honest placeholder).
- [ ] Click a listing → a **compact floating dialog** opens (no large breakout view) with
      dense professional typography and interested/favorite/hide/compare/analyze actions
      plus export/schedule.
- [ ] Trigger **one action** (e.g. Favorite or Hide). A toast confirms it; the state
      persists across reload (read from Firestore, not session). Hidden listings leave the
      default grid and are recoverable via "Show hidden".

### 3. Toast on an alert match without layout shift

- [ ] With at least one saved alert, cause/await an alert match (or use the seeded
      operator alert path) so a toast surfaces.
- [ ] The toast is uniform, dismissible, and times out; the header and listings content
      **do not shift** when it appears (no scrollbar-gutter jump). The automated
      `toast-noshift.spec.ts` proves zero layout shift via the shipped `abode:toast` event.

### 4. Docs TOC pinned

- [ ] Open the Docs tab. The TOC stays **pinned** while the main content column scrolls
      independently; clicking a TOC anchor scrolls only the main column.

### 5. CMA pagination + sort

- [ ] Open the CMA tab → **Data** view. The table paginates (default 10; 20/30/100
      options) and sorts by clicking a column header (`aria-sort` flips). Rows open the
      listing dialog. Charts are derived from real inventory only.

### 6. Protected ingest route (deployed)

- [ ] `POST https://abode-alerts.vercel.app/api/ingest/daily` **without** a token →
      **401** (or 503 if the token env is unset — fix the env, then expect 401).
- [ ] The same route **with** `Authorization: Bearer $INGEST_JOB_TOKEN` → a **non-401**
      status (200, or 503 only on a downstream env gap). Run
      `scripts/vercel-listings-check.ts` (token read from `.env`, never printed).

### 7. WS18 two-account sharing (owner + viewer/editor)

Needs **two** Google accounts (the owner and, e.g., the owner's mother).

- [ ] **Owner** signs in → profile menu → **Share workspace** → invite the second
      account's email as **viewer** → an invite is created (and, if Gmail is connected,
      an accept-link email is sent from the owner's mailbox).
- [ ] **Second account** signs in and opens the **`/invite/[token]`** accept link →
      accepting writes the membership.
- [ ] As a **viewer**, the second account sees the owner's **listings / alerts / CMA**
      **read-only**: mutating controls are hidden and any write is denied by the rules.
- [ ] Re-invite (or change role to) **editor**: the second account can now edit the
      owner's workspace (preferences, compare, alerts) but **cannot delete the owner's
      account** or remove/demote the owner.
- [ ] **Revoke** the membership → the second account loses access.

The rules half of this flow (owner/editor/viewer/non-member) is proven automatically by
`npm run test:rules` (24 WS18 emulator cases); this manual pass proves the live UI +
OAuth + Gmail-invite path that automation cannot reach.

## On failure

Do not weaken a test, rule, or gate to make a step pass. Fix the owning system (env,
rules, route, or UI), re-run the automated gate, then re-run the affected manual step.
