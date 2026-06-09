# Abode Alerts End-To-End Production Plan

Date: 2026-06-08
Status: [~] Active
Source reports: `README.md`, `package.json`, `app/api/properties/route.ts`, `app/api/gemini/route.ts`, `app/globals.css`, `components/dashboard.tsx`, `components/theme-controls.tsx`, `components/views/ListingsGrid.tsx`, `components/views/CMAView.tsx`, `components/views/DocsView.tsx`, `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/env.ts`, `types/listings.ts`, `firebase-applet-config.json`, `firestore.rules`, `docs/research/INBOX_PARSING.md`, `docs/engineering/agents/orchestrator-logs/2026-06-08-production-shape-goal.md`, Google Cloud Free Program, Firebase pricing, Firestore pricing, Firebase AI Logic pricing
Owner: Orchestrator + Abode Alerts workstream agents
Surface: Next.js app (`app/`, `components/`), server routes (`app/api/`), env/ops (`lib/env.ts`, `.env.example`, Vercel on `jamienavinhill`), Firebase Auth/Firestore (`lib/firebase.ts`, `lib/firebase-admin.ts`, `firestore.rules`, `types/`), Gemini extraction, Google Workspace OAuth, provider ingestion jobs, production deployment

## Purpose

Build Abode Alerts into its final production-shaped real estate monitoring workspace and then make it remarkably clean, smooth, and powerful: real Google sign-in, real listing ingestion, real media, an auditable baseline backfill for a 10-mile radius around `44224`, durable daily alert rotation, **automatic Gmail→Gemini→Firestore ingestion as the primary flow**, a professional compact UI (non-shifting toasts, paginated analytics, pinned docs navigation, actionable listing workflows), correct Vercel operator hosting on `jamienavinhill`, hardened auth/secrets, and zero seeded/mock listing behavior in shipped surfaces. This single plan folds the prior "Production Shape" and "Product Polish & Automation" roadmaps into one end-to-end sequence; nothing is descoped.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked or needs explicit operator/account action

## Source Findings

- The app is a Next.js 15 App Router project with React 19, TypeScript, Tailwind CSS 4, Firebase, Gemini SDK, and Google Workspace-oriented routes in `package.json`, `app/api/properties/route.ts`, and `lib/firebase.ts`.
- Production domain history includes `abode-alerts.vercel.app`; the user has moved the project to the **`jamienavinhill`** Vercel account (not `jami.studio`). A rogue `jami.studio` deploy must be removed and the correct linked project confirmed.
- Firebase Auth and Firestore are wired through `lib/firebase.ts` using `firebase-applet-config.json` (public client config); Firestore was migrated to the `abode-alerts` database.
- `lib/firebase-admin.ts` currently loads the service account by **file path only**, which is incompatible with Vercel serverless unless inline service-account JSON env support is added.
- `lib/env.ts` accepts `REALTY_API_KEYS` as a comma-separated list or any `rt_`-prefixed env aliases; `QuotaTracker` rotates keys at ~250 req/key/day. The `44224` backfill (~88 listings) used minimal quota and did **not** exhaust all keys — rotation exists for resilience/failover, not because one key is insufficient.
- `components/dashboard.tsx` listens to `properties` and `alerts`, signs in through Google OAuth, requests Gmail/Sheets/Calendar/Drive scopes, parses Gmail (`parse_gmail`) and pasted text, commits listings to Firestore, exports Sheets rows, and creates Calendar events.
- Gmail ingest today requires a **manual** "Scan Gmail" button — there is no automatic trigger (no Gmail `watch`, no polling cron, no server-stored refresh token).
- The prior listing baseline came from hardcoded `lib/static_properties.ts` merged into Firestore results; this seeded baseline has been removed and must never return to shipped paths.
- The prior extraction prompt in `app/api/properties/route.ts` allowed stock Unsplash fallback images; final behavior must store only real listing media URLs or an explicit no-media state.
- `components/theme-controls.tsx` used a preset accent list; it has been replaced with a real color input, but still renders a duplicate color-input swatch next to the palette icon that must be collapsed to icon-only.
- The current alert notification is a full-width animated `#alert-toast`/`recentMatch` banner (`animate-bounce`) in `components/dashboard.tsx` that shifts page layout; it must become a fixed, non-shifting toast system.
- The ingest filter is a raw `gmailQuery` string (default `subject:"Redfin" OR subject:"Zillow"...`); it must become a platform multiselect with optional custom query.
- The alerts wizard links only Zillow/Redfin; it must include the five baseline platforms.
- `components/views/CMAView.tsx` shows one bar chart, an unpaginated full-inventory table, and three oversized metric cards sitting awkwardly side-by-side; it needs balanced layout, paginated/sortable tables, and more charts.
- `components/views/DocsView.tsx` uses a `sticky` TOC that still jumps with anchor navigation and has thin content (2 nav sections); TOC and main scroll must be isolated and content expanded.
- `PropertyProfileModal` is a large `max-w-5xl` split layout; it must become a compact floating dialog with listing actions.
- `ListingProperty` has no per-user `interested` / `favorite` / `hidden` state; this needs a user-scoped Firestore subcollection plus rules.
- Auth chrome shows avatar plus separate Connect/Logout buttons and a "Sign in with Google" label; it must match the compact profile-menu spec (sign-in OR avatar, never both).
- `components/views/ListingsGrid.tsx` assumed a listing image existed and needed no-media handling once fake fallbacks were removed.
- `firestore.rules` exists and must be audited before launch-hardening any backfill, saved search, listing-preference, or user-owned collections.
- `docs/engineering/standards/planning-style.md`, `report-style.md`, and `orchestration-reliability.md` define the planning/reporting/orchestration style that must remain intact but point at this project.
- Official pricing: Firebase Authentication is no-cost for most sign-in options; Firestore free quota is 1 GiB stored, 50K reads/day, 20K writes/day, 20K deletes/day, 10 GiB/month egress; the Google Cloud `$300` credit applies to Vertex AI Gemini and most paid Firebase/Google Cloud services but **not** Gemini Developer API usage.

### Source Findings Audit (Current State → Gap)

| Area               | Current state                                                                                                              | Gap                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel             | App deploys; user moved to `jamienavinhill`; no `vercel.json` cron                                                         | Env wiring via CLI unverified; Firebase admin uses **file path** only (`lib/firebase-admin.ts`) — incompatible with Vercel unless JSON-in-env support is added |
| RealtyAPI keys     | `lib/env.ts` accepts `REALTY_API_KEYS` comma-list or any `rt_` env aliases; `QuotaTracker` rotates keys at 250 req/key/day | 44224 backfill (~88 listings) used minimal quota; **not all keys were exhausted** — rotation is for resilience/failover                                        |
| Gmail ingest       | `POST /api/properties` `parse_gmail` works with client bearer token; manual button in `dashboard.tsx`                      | **No automatic trigger** — no Gmail watch, no polling cron, no server-stored refresh token                                                                     |
| Notifications      | Full-width `recentMatch` banner with `animate-bounce` shifts layout                                                        | Must become fixed toasts with timeout + manual close                                                                                                           |
| Ingest filter      | Raw string `gmailQuery` default `subject:"Redfin" OR subject:"Zillow"...`                                                  | Needs multiselect + optional custom input                                                                                                                      |
| Alerts wizard      | Zillow/Redfin links only; Gemini generates setup guide                                                                     | Needs five baseline platforms in multiselect UX                                                                                                                |
| CMA                | One bar chart + unpaginated full inventory table + 3 large metric cards                                                    | Layout imbalance; no pagination/sort; needs more charts                                                                                                        |
| Docs               | TOC `sticky` but shares scroll container with anchor jumps; 2 nav sections, thin content                                   | TOC/main scroll not isolated; content sparse                                                                                                                   |
| Listing modal      | `PropertyProfileModal` is large `max-w-5xl` split layout                                                                   | Must shrink to compact floating dialog; add user actions                                                                                                       |
| User listing state | No `interested` / `favorite` / `hidden` on `ListingProperty`                                                               | Needs user-scoped Firestore subcollection or preferences doc + rules                                                                                           |
| Auth chrome        | Avatar + separate Connect/Logout buttons; sign-in says "Sign in with Google"                                               | Does not match compact profile-menu spec                                                                                                                       |
| Theme              | Palette icon + separate color input swatch                                                                                 | Duplicate chrome; collapse to icon-only tinted with accent                                                                                                     |

## Locked Decisions

- [x] Product name in docs is **Abode Alerts**. Internal package name may remain `realty-monitor` until a package rename is intentionally done.
- [x] Keep the deployed Next.js app on **Vercel under the `jamienavinhill` account** (not `jami.studio`). The rogue `jami.studio` deploy is removed; production target is the correctly linked project.
- [x] Keep Firebase Auth and Firestore as the production auth/storage baseline. Firebase free quota is generous enough for current listings, alerts, users, and backfill metadata. Upgrade to Blaze only when a required Google Cloud/Firebase feature needs billing or quota exceeds Spark/free limits, and only with budget alerts.
- [x] Do not use Firebase Storage for third-party listing images by default. Store source media URLs and metadata first; add an image cache/proxy only if provider terms allow caching and product performance requires it.
- [x] Use Gemini **server-side only** for extraction/enrichment. `GEMINI_API_KEY` remains a Vercel/server env var. Do not expose it to the browser.
- [x] **RealtyAPI on Vercel**: set `REALTY_API_KEYS` to the **full comma-separated list** of all `rt_` keys. The adapter rotates across keys; the `44224` ingest did not burn all keys, but multiple keys provide quota headroom and failover. A single key is sufficient only for minimal smoke — not recommended for production. Store all keys in a single server env var, rotate server-side, never expose to the browser.
- [x] **Firebase Admin on Vercel**: add support for inline service account JSON via a new env (e.g. `FIREBASE_SERVICE_ACCOUNT_JSON`) while keeping path-based vars for local Windows dev. Never commit JSON to the repo. Firebase client config stays in `firebase-applet-config.json` (public); server admin creds are runtime secrets on Vercel.
- [x] Use Google Workspace OAuth for user-owned Gmail, Sheets, Calendar, and Drive workflows. **Automatic email ingest** is the primary flow: implement a scheduled Gmail poll + incremental history per signed-in user using a server-stored OAuth refresh token (encrypted in Firestore, user-scoped) until Gmail `watch` + Pub/Sub is justified. Manual scan becomes secondary/advanced.
- [x] Use a protected scheduled ingestion endpoint plus a daily trigger (GitHub Actions or Vercel Cron via `vercel.json`). Default schedule is daily at `11:00 UTC` / `06:00 America/New_York`. Protected routes require `INGEST_JOB_TOKEN`.
- [x] Baseline backfill target is all current active listings within 10 miles of ZIP `44224`, centered on Stow, Ohio. Persist source provenance, fetch timestamp, provider account id/key alias, dedupe key, coordinates, media URLs, and raw provider payload hash.
- [x] Google/free search enrichment can fill gaps only with permitted public/indexed data and source citations. Do not scrape behind auth, evade rate limits, or invent values.
- [x] **Listing user actions** (interested/not-interested/favorite/hidden/compare) store under `users/{uid}/listingPreferences/{listingId}` (or equivalent) — never on shared catalog documents. Compare set uses `users/{uid}/compareQueue` capped at N (e.g. 4).
- [x] **Toasts**: single shared toast host (portal/fixed layer), top-right or bottom-right, `pointer-events` safe, with auto-timeout and manual close, never participating in document flow.
- [x] **Typography**: reduce `font-extrabold` / oversized hero headings on data surfaces; align with compact dashboard density.
- [x] No mock listings, placeholder property rows, stock real estate images, or prototype copy in shipped product paths. Fixtures belong under tests only.
- [x] Engineering tooling baseline is npm, ESLint, Prettier, TypeScript, Next build, and `npm run verify`.

## Scope Boundaries

- Security: secrets live only in local `.env`, Vercel env vars, GitHub Actions secrets, or provider secret stores. Never commit keys, PATs, Firebase service accounts, account credentials, or raw OAuth tokens.
- Runtime exposure: browser code may access Firebase client config and Google OAuth sign-in only. Provider keys, Gemini keys, scheduled-job tokens, PATs, and service credentials stay server-side. UI components never call RealtyAPI directly — server routes and scripts only.
- Provider behavior: use official APIs, user-authorized inbox data, or permitted public search results. Provider data remains source of truth; Gemini extracts from email text only — no invented prices or photos. Record source URLs and extraction confidence. Do not present inferred data as provider-verified fact.
- Gmail automation requires user OAuth consent with `gmail.readonly`; refresh-token storage must be documented and rules-hardened.
- Migrations: Firestore collection/schema changes must be additive first, backfilled with scripts, then read paths can rely on them after verification.
- Public claims: no claim of MLS completeness, exclusive access, guaranteed real-time freshness, or investment advice unless backed by source contracts and legal review. CMA charts reflect Firestore inventory only; empty states stay honest.
- Cost: Firebase Spark/free tier remains the default. Enable Blaze/paid Google Cloud only for an explicit capability and with budget alerts.

### Explicit Non-Goals For This Plan

- Do not reintroduce mock listings, stock media, or prototype-only data paths.
- Do not change unrelated dirty/untracked local artifacts (`.playwright-cli/`, `agent-tools/`, etc.).
- Do not expand scope beyond the requirements captured below unless required as a direct dependency (e.g. Firestore rules for user listing preferences).

## Repo Guidance

- Follow `AGENTS.md`, this roadmap, `docs/engineering/standards/planning-style.md`, and `docs/engineering/agents/orchestration-reliability.md`. Read relevant files before editing.
- Windows local dev; Vercel production on `jamienavinhill`. Use `rg`/project search before changing shared flows.
- Keep responsibilities explicit: UI renders state, API routes validate/authenticate/orchestrate, provider adapters fetch data, Firestore stores source-owned records, docs capture durable rules.
- Replace fake data by removing the dependency, not by hiding it behind different labels.
- Every ingestion record must carry provenance and be traceable back to source and run id. Any daily/automatic job must be idempotent and safe to rerun.
- Prefer small provider ports over direct fetch calls embedded in UI/components.
- Keep generated or volatile provider data out of durable docs; put examples in fixtures/tests with sanitized payloads.
- Verification: `npm run verify` + targeted Playwright smokes for auth, toast non-shift, listing dialog, docs TOC, CMA pagination.
- Retire prior plans to `docs/_legacy/roadmaps/` only after this plan's acceptance criteria are met and durable docs/changelog carry ongoing rules.

## Target Repository Shape

- `app/`
  - `page.tsx`, `layout.tsx`, `globals.css` (toast portal host in `layout.tsx` if needed)
  - `api/properties/route.ts` for user-initiated Google Workspace actions while this route exists
  - `api/gmail/*` (or extended `api/properties/route.ts`) for automatic ingestion
  - `api/ingest/backfill/route.ts` protected baseline ingestion endpoint
  - `api/ingest/daily/route.ts` protected daily refresh endpoint
  - `api/gemini/route.ts` or a consolidated Gemini service route after route ownership is cleaned up
- `components/`
  - Auth header: compact Google sign-in (signed out) / avatar + profile menu (signed in), mutually exclusive
  - Theme controls: accent-tinted palette icon only (no separate swatch)
  - `ui/toast.tsx` shared toast host
  - `ui/data-table.tsx` reusable paginated/sortable table
  - Listing cards with real-media/no-media states and compact density
  - `PropertyProfileModal` compact floating dialog with action bar
  - Ingest multiselect filter; alert setup; listing grid; CMA; docs views wired to typed data
- `lib/`
  - `firebase.ts` client SDK adapter
  - `firebase-admin.ts` admin SDK supporting inline JSON env + local path
  - `env.ts` server/client env validation
  - `providers/realty-api.ts` RealtyAPI adapter and key rotation
  - `providers/google-search.ts` permitted search enrichment adapter
  - `providers/types.ts`, `ingest/quota.ts`
  - `gmail/` poll, history-id watermark, query builder
  - `ingest/backfill.ts`, `ingest/daily-refresh.ts`
  - `repositories/listings.ts`, `repositories/alerts.ts`, `repositories/runs.ts`, `repositories/listing-preferences.ts`
  - `schemas/listing.ts`, `schemas/alert.ts`, `schemas/ingest.ts`, listing-preferences schema
- `scripts/`
  - `backfill-44224.ts` local/operator baseline runner
  - `verify-env.ts` env readiness check
  - `browser-google-oauth-check.ts` auth chrome assertions
- `types/`
  - shared listing/alert/run/listing-preference contracts, or generated exports from schema files
- `vercel.json`
  - cron for `/api/ingest/daily` with bearer auth header pattern
- `.github/workflows/`
  - scheduled daily refresh workflow if GitHub is initialized and selected as scheduler
- `docs/`
  - `README.md` index
  - `roadmaps/2026-06-08-abode-alerts-end-to-end-production-plan.md`
  - `operations/development-workflow.md`, `operations/provider-ingestion.md`, `operations/env-and-deploy.md`
  - `architecture/data-model.md`, `architecture/auth-and-secrets.md`
  - `decisions/` for durable decisions promoted out of this roadmap
- Tooling
  - `eslint.config.mjs`, `.prettierrc.mjs`, `.prettierignore`, `.gitignore`, `.env.example`
  - `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run verify`

## User Requirements Inventory (Every Detail)

### A. Vercel, accounts, and environment

1. Vercel project must live on account **jamienavinhill** (not `jami.studio`).
2. Rogue deploy on `jami.studio` is removed; production target is the correct linked project.
3. Connect Firebase and all required runtime envs to Vercel via **CLI + PAT** (full operator access).
4. Clean up env template and local env naming: rename confusing vars, remove unused vars, document only what the app actually reads.
5. Clarify RealtyAPI key strategy for Vercel: comma-separated full key list vs single key (see Locked Decisions — full list).
6. Firebase client config stays in `firebase-applet-config.json` (public); server admin creds are runtime secrets on Vercel.
7. Production must support protected ingest routes (`INGEST_JOB_TOKEN`) and scheduled daily refresh once envs are wired.

### B. Ingest query filter UX (Gmail / email sources)

1. Replace raw Gmail query text field with a **multiselect dropdown** of major listing-email platforms.
2. Multiselect must support an **optional free-text input** for advanced/custom query fragments.
3. Baseline platform options (user uses all): **Zillow**, **Trulia**, **Homes.com**, **Redfin**, **realtor.com**.
4. Include other major platforms in the multiselect set (e.g. MLS digests, Realtor.com variants, regional portals where email subjects are known).
5. Composed query must feed the existing Gmail search path (`parse_gmail` in `app/api/properties/route.ts`) without inventing listings.

### C. Automatic email ingestion (primary flow)

1. **Main flow is automatic**: when a new listing alert email arrives, Gemini is invoked and the listing is ingested — user should not need to click scan.
2. Manual "Scan Gmail" remains **optional**, not primary.
3. Hassle-free operation: sign in once, subscribe to platform emails, Abode Alerts handles the rest.
4. Automatic path must preserve provenance, dedupe, and validation before Firestore writes.
5. New-ingest events must surface through the toast system (see §D), not layout-shifting banners.

### D. Notifications (toasts)

1. Remove the current full-width animated alert banner (`#alert-toast` in `components/dashboard.tsx`) that shifts page layout.
2. Replace with **uniform toast notifications**: fixed position overlay, consistent styling.
3. Toasts must have **auto-timeout** and a **manual close** control.
4. Toasts must **never cause layout shift** (no reflow, no scrollbar appearance/disappearance side effects).
5. Toast use cases: new alert match, new email-ingested listing, ingest errors worth surfacing, workspace action confirmations.

### E. CMA page

1. Fix chart + massive table sitting awkwardly side-by-side; rebalance layout for scanability.
2. **All tables** get pagination, column sort, default page size **10**, page-size options **20 / 30 / 100**.
3. Add more charts (distribution, price/sqft, property type mix, status breakdown — grounded in real Firestore inventory only).
4. Add comparison and granular detail affordances (drill-down, filters, row actions linking to listing dialog).
5. Remove oversized metric summary strips that waste vertical space; keep metrics compact and actionable.

### F. Docs page

1. **Pin the TOC panel**: TOC does not scroll with main content jumps when clicking Intro, Quickstart, etc.
2. Only the **main content column** scrolls; TOC stays fixed in place within the docs view.
3. Expand docs content — current guide is sparse; add sections for automatic email flow, env setup, listing actions, CMA, alerts, and operator ingest.
4. Preserve honest claims (no MLS completeness, no guaranteed real-time unless sourced).

### G. Listing detail and card UX

1. Remove large inline "breakout" listing views that waste space; **detail opens in a floating dialog** only.
2. Dialog must be compact, clipped appropriately, not a full-page takeover unless necessary for media.
3. Eliminate big blocky fonts and childish typography; use professional, dense, readable hierarchy.
4. Do not waste pixels on heavy summary strips or decorative giant numbers.
5. Focus UI on **actions**, not decoration.

### H. Listing actions (new product capabilities)

1. **Mark interested** / **not interested** per listing (per user).
2. **Favorite** / **unfavorite** per listing (per user).
3. **Hide listing** (per user; excluded from default views, recoverable).
4. **Compare** listings (select 2+ for side-by-side or tabular comparison).
5. **Run analysis** on a listing (Gemini-backed, cited/qualified output; no invented facts).
6. Retain/export/schedule workspace actions where already implemented, but fit the compact dialog pattern.

### I. Auth chrome and header density

1. **Color picker**: remove separate swatch next to palette icon; **icon only**, filled/stroked with current accent color.
2. **Sign-in button** (signed out): Google icon + label **"Sign in"** only — not "Sign in with Google", not "Connect with Google".
3. **Signed out state**: show sign-in control only; **no avatar**.
4. **Signed in state**: show **profile avatar only**; no standalone sign-in or sign-out buttons in the header.
5. **Profile menu** on avatar click: small clean dropdown with **user name** and **Sign out**.
6. Sign-in and profile avatar are **mutually exclusive** — never shown together.

### J. Foundational production requirements (carried from Production Shape)

1. Real Google sign-in and avatar; arbitrary persisted accent color; Firestore-only listings; no stock/listing placeholders.
2. Typed contracts for listings, media, alerts, provider runs, provenance, and env readiness before automation.
3. Real provider ports (RealtyAPI + permitted search enrichment) with key rotation and quota accounting.
4. Auditable `44224` 10-mile baseline backfill with real media and provenance.
5. Durable daily alert rotation evaluated without a browser session, with persisted alert matches.
6. Hardened Firestore rules, OAuth/secret handling, and verified production envs/authorized domains.
7. Every visible page/view wired to real data and final Abode Alerts copy/metadata.
8. Automated + manual verification and a reliable `npm run verify` release gate.

## Cross-Stream Dependency Map

- **WS1 (Tooling/Docs baseline)** creates quality gates, agent operating model, and docs index used by all streams.
- **WS2 (Vercel/Env/Firebase Admin)** establishes correct hosting, env canon, and serverless admin; enables all server automation (WS7, WS8) and production verification (WS17).
- **WS3 (Contracts/Schemas/Env validation/Firestore model)** defines listing/alert/run contracts + env validation consumed by adapters, jobs, rules, docs, and tests.
- **WS4 (User listing preferences contract)** defines per-user state consumed by listing actions (WS12) and CMA row actions (WS13).
- **WS5 (Provider adapters)** implements RealtyAPI + search ports consumed by backfill (WS6) and daily refresh (WS8).
- **WS6 (44224 backfill)** populates real inventory (~88 listings already ingested) before dashboards/CMA/alerts claim real data.
- **WS7 (Automatic Gmail ingestion + multiselect filter)** depends on WS2 envs, WS3 contracts, WS9 toasts; feeds alerts and listings automatically.
- **WS8 (Daily refresh + alert rotation)** depends on WS3 contracts, WS5 adapters, WS6 baseline; persists alert matches surfaced via WS9 toasts.
- **WS9 (Toast system)** has no deps; enables WS7, WS8, WS12, WS13 notifications.
- **WS10 (Auth chrome + theme density)** has no deps; supersedes the earlier auth-header tasks; verified in WS17.
- **WS11 (UI honesty / no-fake-data / regional defaults)** removes fake assumptions before real data and final copy land.
- **WS12 (Listing dialog + actions + grid density)** depends on WS4 (prefs) and WS9 (toasts).
- **WS13 (CMA analytics)** depends on WS6 data and optionally WS4 row actions; reuses WS12 dialog.
- **WS14 (Docs layout + content)** depends on durable docs; parallel to UI streams.
- **WS15 (Product flows, metadata, page wiring)** depends on WS11 cleanup, WS6 data, WS8 alert matches, WS12/WS13 views.
- **WS16 (Auth, rules, secret hardening)** depends on WS3/WS4 final collection model and WS7/WS8 scheduled routes.
- **WS17 (Tests, verification, release gate)** depends on WS1–WS16.

```
WS1 ──► all streams
WS2 ──┬──► WS7  ┬──► WS17
       └──► WS8  ┘
WS3 ──► WS5 ──► WS6 ──► WS8, WS13, WS15
WS3 ──► WS7, WS8, WS16
WS4 ──► WS12, WS13, WS16
WS9 ──► WS7, WS8, WS12, WS13
WS10 ──► WS17 ; WS11 ──► WS15 ; WS14 ──► WS17 (parallel)
WS12 ──► WS15 ; WS13 ──► WS15
WS1..WS16 ──► WS17
```

## Workstream 1: Tooling, Docs Baseline, And Agent Operating Model

Goal: Give every engineer/agent a clear project entrypoint, real quality gates, and current docs that match this codebase.

Depends on:

- [x] Existing `package.json`, docs standards, and current app files.

Enables:

- [ ] All implementation streams.

Primary areas:

- `package.json`, `eslint.config.mjs`, `.prettierrc.mjs`, `.prettierignore`, `.gitignore`, `.env.example`
- `AGENTS.md`, `README.md`, `docs/README.md`
- `docs/engineering/agents/goal.md`, `docs/engineering/standards/docs-standards.md`, `docs/engineering/agents/orchestration-reliability.md`

Implementation tasks:

- [x] Install/configure ESLint, Prettier, Tailwind-aware formatting, TypeScript check, and `npm run verify`.
- [x] Replace AI Studio README boilerplate with Abode Alerts stack, env, and command guidance.
- [x] Add `.gitignore` that blocks local env, Vercel, build, and dependency artifacts.
- [x] Add `.env.example` with required server env names and no values.
- [x] Create `AGENTS.md` from the provided structure, refreshed for this Next/Firebase app.
- [x] Refresh `goal.md` to point to this roadmap and this repo's verification commands while preserving the reusable prompt flow.
- [x] Add `docs/README.md` index.
- [ ] Add `docs/operations/development-workflow.md` after the first full green verification pass.
- [ ] Add `docs/architecture/auth-and-secrets.md` after auth/token persistence is finalized.

Exit criteria:

- [ ] `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` are real commands.
- [ ] New agents can start from `AGENTS.md` and this roadmap without stale Studio/Jami references.
- [ ] No tracked file contains secret values.

Suggested verification:

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `git diff --check`.

## Workstream 2: Vercel Account, Env Canon, And Firebase Admin On Serverless

Goal: Production on `jamienavinhill` has complete, documented runtime envs and working Firebase Admin on serverless, with protected ingest routes and a daily cron.

Depends on:

- [x] Vercel PAT + project link present in local `.env` (`VERCEL_PAT`, `VERCEL_PROJECT_ID=prj_aA3U3g2O9T4mKfTWG5AUAbPNaPnI`, `VERCEL_TEAM_ID`). Confirmed working against the `realtor` (nextjs) project on 2026-06-08.

Enables:

- [ ] WS7 automatic ingestion, WS8 daily refresh, WS17 production verification.

Primary areas:

- `.env.example`, `.env`, `lib/env.ts`, `lib/firebase-admin.ts`
- Vercel project settings (REST API; CLI not installed), `vercel.json`
- `docs/operations/env-and-deploy.md` (new)

Implementation tasks:

- [x] Confirm the Vercel project under `jamienavinhill` (`realtor`, nextjs) via the REST API using the operator PAT.
- [x] Push runtime envs to Vercel (production + preview + development, encrypted, via REST API): `GEMINI_API_KEY`, `REALTY_API_KEYS` (all 7 distinct keys comma-separated), `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON` (inline service-account JSON read from the local key file). Confirmed present via readback.
- [x] Extend `firebase-admin.ts` to load inline service-account JSON from `FIREBASE_SERVICE_ACCOUNT_JSON` when present, falling back to the local file path for Windows/local dev. `lib/env.ts` validation accepts either source.
- [x] Clean `.env`: removed prose dumps, code snippet, and duplicate `rt_` alias lines; dropped redundant `GOOGLE_API_KEY`; organized into App-runtime / Firebase-admin / Optional-search / Operator-only / RealtyAPI-alias-reference / unrelated-local-tooling sections; preserved all values.
- [x] Rewrite `.env.example` to match the cleaned canonical env (adds `FIREBASE_SERVICE_ACCOUNT_JSON`, separates local path vars from Vercel JSON, marks operator-only Vercel vars local-only).
- [ ] Add `vercel.json` cron for `/api/ingest/daily` with bearer auth header pattern (default `11:00 UTC` / `06:00 America/New_York`).
- [ ] Verify Firebase authorized domains include the production Vercel URL and the local development domain (`scripts/add-auth-domains.ts` exists).
- [ ] Add budget alerts if Blaze or paid Google Cloud is enabled.
- [ ] Redeploy production; read back the `44224` baseline (~88 listings) on the production URL.

Exit criteria:

- [x] Runtime envs present and encrypted on the Vercel project across production/preview/development (readback-confirmed).
- [x] Firebase Admin initializes from inline env JSON (Vercel) or local path (dev); local readback returned 88 properties.
- [ ] Protected daily ingest succeeds on the production URL; unauthorized request returns 401/403.
- [ ] No secrets in tracked files (`.env`/`.env.local` gitignored; service-account JSON never committed).

Suggested verification:

- Vercel env readback via REST API (done); production listings readback script; `POST /api/ingest/daily` returns 401 without token and 200 with token.

## Workstream 3: Contracts, Schemas, Env Validation, And Firestore Model

Goal: Define durable typed contracts for listings, alerts, provider runs, media, provenance, and env readiness before adding provider automation.

Depends on:

- [ ] WS1 command baseline.
- [ ] WS11 fake-data removal (parallel-safe).

Enables:

- [ ] Provider adapters, backfill, daily refresh, automatic ingestion, security rules, docs, and tests.

Primary areas:

- `types/listings.ts`, `lib/schemas/*`, `lib/env.ts`, `lib/repositories/*`, `firestore.rules`, `.env.example`, `docs/architecture/data-model.md`

Implementation tasks:

- [ ] Add a runtime schema library or handwritten validators for listing, media, alert, and ingest-run payloads.
- [ ] Expand listing contract with `sourceProvider`, `sourceUrl`, `sourceListingId`, `sourceUpdatedAt`, `ingestedAt`, `provenance`, `media[]`, `rawHash`, `dedupeKey`, `radiusCenter`, and `distanceMiles`.
- [ ] Define provider run records with status, started/finished timestamps, key alias, quota used, result counts, error counts, and idempotency key.
- [ ] Add env validation for `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, optional `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID`, and optional Firebase env promotion values.
- [ ] Write repository functions for listings, alerts, and ingest runs.
- [ ] Document schema ownership and migrations in `docs/architecture/data-model.md`.

Exit criteria:

- [ ] API routes and scripts validate external/provider payloads before writing Firestore.
- [ ] Firestore writes include provenance and dedupe metadata.
- [ ] Env failures are explicit and actionable before any provider call runs.

Suggested verification:

- `npm run typecheck`, `npm run lint`, targeted repository/schema tests once a harness exists.

## Workstream 4: User Listing Preferences Contract

Goal: Per-user interested, favorite, hidden, and compare-set state in Firestore.

Depends on:

- [ ] WS3 base contracts/repositories (shared types).

Enables:

- [ ] WS12 listing dialog actions, WS13 CMA row actions, WS16 rules.

Primary areas:

- `types/listings.ts`, `lib/schemas/`, `lib/repositories/listing-preferences.ts`, `firestore.rules`

Implementation tasks:

- [ ] Define `ListingUserState`: `interested | notInterested | favorite | hidden`, with timestamps.
- [ ] Repository CRUD scoped to `request.auth.uid`, stored under `users/{uid}/listingPreferences/{listingId}`.
- [ ] Compare set: `users/{uid}/compareQueue` with a max of N listings (e.g. 4).
- [ ] Rules: a user can read/write only their own preference docs (hardened fully in WS16).

Exit criteria:

- [ ] Rules unit/emulator tests pass for own-only access.

Suggested verification:

- `npm run test`; Firebase rules validator.

## Workstream 5: RealtyAPI And Search Provider Adapters

Goal: Add real provider ports for structured listing fetches and permitted public enrichment, with key rotation and quota accounting.

Depends on:

- [ ] WS3 contracts and env validation.

Enables:

- [ ] WS6 baseline backfill and WS8 daily refresh.

Primary areas:

- `lib/providers/realty-api.ts`, `lib/providers/google-search.ts`, `lib/providers/types.ts`, `lib/ingest/quota.ts`, `.env.example`, `docs/operations/provider-ingestion.md`

Implementation tasks:

- [ ] Implement RealtyAPI adapter for active listings within radius/ZIP criteria.
- [ ] Accept comma-separated `REALTY_API_KEYS` (and `rt_` aliases) and rotate by run/key alias without logging values.
- [ ] Track daily quota consumption per key (~250 req/key/day) and stop before limits are exceeded.
- [ ] Normalize RealtyAPI records into the listing schema with source provenance and media arrays.
- [ ] Implement public search enrichment adapter behind `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID` only for missing non-authoritative fields and source URLs.
- [ ] Add provider error classes for rate limit, auth, provider outage, malformed payload, and no-results.
- [ ] Document provider setup and expected envs.

Exit criteria:

- [ ] Provider calls are isolated from UI and Firestore write code.
- [ ] Key rotation is deterministic and inspectable without exposing keys.
- [ ] Quota exhaustion degrades to partial run results, not silent failure.

Suggested verification:

- `npm run typecheck`; adapter tests with sanitized fixtures; live smoke with one low-limit key only after env is present.

## Workstream 6: 44224 Ten-Mile Baseline Backfill

Goal: Populate Firestore with all current active listings within 10 miles of `44224`, with real media and auditable provenance.

Depends on:

- [ ] WS3 contracts/repositories.
- [ ] WS5 RealtyAPI adapter.
- [!] At least one valid `REALTY_API_KEYS` value in local/Vercel operator secrets.

Enables:

- [ ] Real listing dashboard, CMA, alert setup, and daily refresh.

Primary areas:

- `lib/ingest/backfill.ts`, `scripts/backfill-44224.ts`, `app/api/ingest/backfill/route.ts`, `lib/repositories/listings.ts`, `lib/repositories/runs.ts`, `docs/operations/provider-ingestion.md`

Implementation tasks:

- [x] Define radius center for ZIP `44224` and radius `10` miles.
- [x] Fetch active listings from RealtyAPI across available accounts/keys until complete or quotas are safely exhausted (~88 listings ingested; not all keys burned).
- [x] Dedupe by provider id, normalized address, coordinates, and canonical source URL.
- [x] Persist listings with `status=Active`, source provenance, media URLs, timestamps, and raw hash.
- [x] Record a baseline run document with counts, key aliases used, and unresolved gaps.
- [x] Add an operator script that can run locally and a protected API route for hosted trigger.
- [ ] Verify the dashboard renders baseline records without static fallbacks (re-verify after WS11/WS12/WS13 land).

Exit criteria:

- [ ] Firestore contains real current active listings for the target radius (~88 confirmed).
- [ ] Every listing has source provenance and no stock/fake media.
- [ ] Re-running the backfill updates existing records idempotently.

Suggested verification:

- `node --env-file=.env scripts/backfill-44224.ts --dry-run`; Firestore readback count and sample-record provenance audit.

## Workstream 7: Automatic Gmail Ingestion And Multiselect Filter (Primary Flow)

Goal: New listing emails are processed automatically without a manual scan, driven by a platform multiselect + optional custom query.

Depends on:

- [ ] WS2 server envs, WS3 contracts, WS9 toasts; OAuth scopes already in `dashboard.tsx`.

Enables:

- [ ] WS8 alert evaluation, WS17 verification.

Primary areas:

- `app/api/gmail/*` or extended `app/api/properties/route.ts`
- `lib/gmail/` (poll, history-id watermark, query builder)
- `lib/gmail/query-builder.ts`
- Firestore: `users/{uid}/gmailSync` state
- `components/dashboard.tsx` ingest tab; `components/views/AlertsWizardView`

Implementation tasks:

- [ ] Persist the Google refresh token securely after sign-in (server route, encrypted, user-scoped in Firestore).
- [ ] Build a query composer from selected platforms + optional custom string, producing correct `subject:"Redfin" OR subject:"Zillow"...` style queries.
- [ ] Multiselect dropdown component with baseline five platforms (**Zillow, Trulia, Homes.com, Redfin, realtor.com**) plus extensions (MLS digests, Realtor.com variants, regional portals); optional free-text input appended with documented AND/OR rules and a live preview of the composed query.
- [ ] Persist user selection in `localStorage` or Firestore user prefs.
- [ ] Cron or Vercel scheduled function: poll new messages since `historyId` / internal-date watermark per signed-in user.
- [ ] For each new message: Gemini structured extract → validate → upsert listing (provenance + dedupe) → evaluate alerts → toast user.
- [ ] Keep manual "Scan Gmail" as a secondary, collapsed "Advanced" action.
- [ ] Update `AlertsWizardView` platform list to the five baseline platforms.

Exit criteria:

- [ ] A test email (or seeded Gmail fixture) triggers ingest without a button click.
- [ ] Provenance and dedupe preserved on the automatic path.
- [ ] Selecting Redfin + Zillow generates the correct composed query.

Suggested verification:

- Live Gmail smoke with operator account; Firestore readback of the new listing; unit test for the query builder; browser selection smoke.

## Workstream 8: Daily Refresh And Alert Rotation Data Flow

Goal: Refresh listings daily via RealtyAPI, evaluate saved alerts, and persist actionable alert matches without relying on a browser session.

Depends on:

- [ ] WS3 contracts/repositories, WS5 provider adapters, WS6 baseline, WS9 toasts.

Enables:

- [ ] Reliable production monitoring and WS15 alert read paths.

Primary areas:

- `lib/ingest/daily-refresh.ts`, `app/api/ingest/daily/route.ts`, `vercel.json` cron or `.github/workflows/daily-refresh.yml`, `firestore.rules`, `types/listings.ts`

Implementation tasks:

- [ ] Implement a protected daily route that requires `INGEST_JOB_TOKEN`.
- [ ] Add daily refresh orchestration: fetch new/changed listings, upsert records, mark stale records, evaluate active alerts.
- [ ] Persist alert-match records with listing id, alert id, match reason, first seen, latest seen, and user id.
- [ ] Add scheduler default: daily at `11:00 UTC` (GitHub Actions if repo is initialized; Vercel Cron via `vercel.json` if plan/support confirmed).
- [ ] Add idempotency so retries do not duplicate alert matches; record failed keys/partial quotas in run status.
- [ ] Surface alert matches via the toast system and add a UI read path for persisted matches instead of only in-session toast.

Exit criteria:

- [ ] Daily refresh runs without a browser session.
- [ ] Users can see persisted alert matches after sign-in.
- [ ] Failed provider keys or partial quotas are recorded in run status.

Suggested verification:

- Protected-route unauthorized request returns 401/403; dry-run produces no writes; live scheduled smoke after env is present.

## Workstream 9: Toast Notification System

Goal: Uniform, non-layout-shifting notifications with timeout and manual dismiss.

Depends on:

- [ ] None.

Enables:

- [ ] WS7, WS8, WS12, WS13 notifications.

Primary areas:

- `components/ui/toast.tsx` (new), `components/dashboard.tsx`, `app/layout.tsx` (portal host if needed)

Implementation tasks:

- [ ] Implement a toast provider: queue, auto-dismiss (~6–8s configurable), manual close, max visible stack.
- [ ] Position fixed (e.g. `bottom-4 right-4`), `z-50`, `pointer-events` safe, with no impact on `main` layout or scrollbar gutter.
- [ ] Remove the `#alert-toast` banner and `logMessage` strip if redundant (or demote the log strip to dev-only).
- [ ] Wire the alert-match Firestore listener (and new-ingest events) to toasts instead of the banner.

Exit criteria:

- [ ] Playwright asserts no layout shift when a toast appears (header/listings bounding boxes unchanged).
- [ ] Toasts auto-time out and can be manually closed.

Suggested verification:

- Browser smoke + CSS/layout assertion script.

## Workstream 10: Auth Chrome And Theme Density

Goal: Compact sign-in and profile menu per spec; accent icon only.

Depends on:

- [ ] None (supersedes/extends the earlier auth-header and accent-picker work).

Enables:

- [ ] WS17 verification.

Primary areas:

- `components/dashboard.tsx`, `components/theme-controls.tsx`

Implementation tasks:

- [x] Replace display-name/email header block with a standard Google sign-in button and Google avatar (baseline; refined below).
- [x] Replace the preset accent picker with `<input type="color">` and generated theme shades persisted to local storage (baseline; refined below).
- [ ] `GoogleSignInButton`: glyph + "Sign in" label only (not "Sign in with Google").
- [ ] Signed-out: sign-in button only, no avatar. Signed-in: avatar only, no standalone sign-in/sign-out in the header bar. Sign-in and avatar are mutually exclusive.
- [ ] Profile dropdown on avatar click: user name + Sign out; remove the header logout button.
- [ ] Remove the "Connect Google" secondary header button (workspace reconnect moves into the profile menu or ingest tab if still needed).
- [ ] ThemeControls: collapse to an accent-tinted palette icon only; hidden native color input triggered by icon click; remove the duplicate swatch.

Exit criteria:

- [ ] Signed-out shows no avatar; signed-in shows no sign-in/sign-out in the header bar.
- [ ] Accent control is icon-only, accepts arbitrary color, and persists across refreshes.

Suggested verification:

- `scripts/browser-google-oauth-check.ts` updated assertions; Playwright auth-chrome smoke.

## Workstream 11: UI Honesty, No-Fake-Data, And Regional Defaults

Goal: Make the app honest: Firestore-only listings, no stock/listing placeholders, correct regional defaults, and clean lint/type state.

Depends on:

- [ ] Current UI implementation in `components/dashboard.tsx`, `components/theme-controls.tsx`, `components/views/ListingsGrid.tsx`.

Enables:

- [ ] Real baseline data and final copy without fake rows contaminating results.

Primary areas:

- `components/dashboard.tsx`, `components/views/ListingsGrid.tsx`, `app/globals.css`, `app/api/properties/route.ts`, `types/listings.ts`

Implementation tasks:

- [x] Remove static property baseline merging and delete the seeded property source file.
- [x] Change extraction prompts to return empty `imageUrl` when no real listing media exists.
- [x] Add no-media rendering in listing cards/modals.
- [ ] Remove unused dashboard state/imports and fix all lint/type findings.
- [ ] Rename user-facing brand from `Realty Monitor`/`Realty` to `Abode Alerts` across UI and docs where appropriate.
- [ ] Replace Austin defaults with the `44224` Stow/Akron-area defaults.
- [ ] Add empty-state copy that guides baseline backfill and ingestion rather than implying filters are wrong.

Exit criteria:

- [ ] Fresh Firestore with zero listings shows a truthful empty state.
- [ ] No runtime path imports or merges fake listing data.

Suggested verification:

- `npm run lint`, `npm run typecheck`; manual browser smoke (sign out/in, listings empty without fake rows).

## Workstream 12: Listing Dialog, Actions, And Grid Density

Goal: Compact floating listing dialog with actionable controls and professional typography.

Depends on:

- [ ] WS4 listing preferences contract, WS9 toasts.

Enables:

- [ ] WS13 row actions reuse, WS15 page wiring.

Primary areas:

- `components/views/ListingsGrid.tsx`, `PropertyProfileModal`, `components/dashboard.tsx` filters (respect hidden)

Implementation tasks:

- [ ] Replace the `max-w-5xl` split modal with a compact centered dialog (`max-w-lg`–`max-w-xl`), scrollable body, not a full-page takeover unless media requires it.
- [ ] Action bar: Interested, Not interested, Favorite, Hide, Compare, Analyze (Gemini-backed, cited/qualified — no invented facts), plus Export/Schedule fitted into the compact pattern.
- [ ] Grid cards: smaller type scale, professional dense hierarchy, remove wasteful stat blocks and decorative giant numbers.
- [ ] Filter toggles: show/hide hidden listings, favorites-only view (hidden excluded from default grid, recoverable).
- [ ] Compare view route or dialog tab for side-by-side/tabular comparison of 2+ listings.

Exit criteria:

- [ ] A user can favorite and hide a listing; a hidden listing disappears from the default grid and is recoverable.
- [ ] Detail opens only in the compact floating dialog.

Suggested verification:

- Browser flow with signed-in user; Firestore preference readback.

## Workstream 13: CMA Analytics Page

Goal: Balanced analytics layout with paginated/sorted tables and additional charts grounded in real inventory.

Depends on:

- [ ] WS6 baseline data; WS4 (optional row actions); WS12 dialog reuse.

Enables:

- [ ] WS15 page wiring.

Primary areas:

- `components/views/CMAView.tsx`, `components/ui/data-table.tsx` (new reusable paginated table)

Implementation tasks:

- [ ] Extract a reusable `DataTable` with column sort and page size default **10**, options **20 / 30 / 100**; apply to all CMA tables.
- [ ] Reflow layout: charts row on top, table full width below (or tabbed Charts | Data); fix the awkward side-by-side chart/table.
- [ ] Add charts: price distribution histogram, $/sqft by type, listings by city (top N), property-type mix, status breakdown — Firestore inventory only.
- [ ] Replace the three oversized metric cards with compact metric chips.
- [ ] Row click opens the listing dialog; add a compare checkbox column and drill-down/filter affordances.

Exit criteria:

- [ ] The ~88-listing table paginates at 10 rows default and sorts by price.
- [ ] Layout is balanced with multiple charts; no oversized metric strips.

Suggested verification:

- Browser CMA smoke; unit test for sort/pagination helpers.

## Workstream 14: Docs Layout And Content Expansion

Goal: Pinned TOC, independent main scroll, and richer documentation.

Depends on:

- [ ] Durable docs canon (parallel to UI streams).

Enables:

- [ ] WS17 verification.

Primary areas:

- `components/views/DocsView.tsx`, `docs/` canonical copies where durable

Implementation tasks:

- [ ] Split layout: `aside` fixed height `100vh - header` with `overflow-hidden` (inner TOC `overflow-y-auto` optional); `main` `overflow-y-auto` as the sole scroll container for content anchors.
- [ ] Use `scroll-margin-top` on headings; prevent TOC jump on anchor navigation so only the main column scrolls.
- [ ] Add sections: Automatic Email Ingest, Env/Vercel Setup, Listing Actions, CMA, Alerts, Operator Ingest.
- [ ] Reduce decorative prose/badges; professional compact doc typography; preserve honest claims (no MLS completeness, no guaranteed real-time unless sourced).

Exit criteria:

- [ ] Clicking Quickstart scrolls main only; TOC position stays stable in the viewport.

Suggested verification:

- Playwright docs navigation screenshot comparison.

## Workstream 15: Product Flows, Metadata, And Page Wiring

Goal: Wire every visible page/view to real data and final Abode Alerts copy: listings, ingest, alerts, setup, CMA, docs, and metadata.

Depends on:

- [ ] WS11 UI cleanup, WS6 baseline data, WS8 alert matches, WS12 listing dialog, WS13 CMA.

Enables:

- [ ] Polished production experience.

Primary areas:

- `app/layout.tsx`, `metadata.json`, `components/dashboard.tsx`, `components/views/*`, `README.md`, `docs/README.md`

Implementation tasks:

- [ ] Update app metadata, title, descriptions, social metadata, and icons for Abode Alerts and the deployed domain.
- [ ] Ensure the setup/wizard explains the one-email sign-up flow for the baseline platforms and others without embedding account credentials.
- [ ] Wire CMA to real baseline and comparable records; hide or replace any synthetic chart values.
- [ ] Wire the Docs view to current docs or remove in-app docs if stale.
- [ ] Ensure Google Workspace flows show precise permissions and failure states.
- [ ] Add loading, empty, partial-data, and provider-error states across views.

Exit criteria:

- [ ] No page depends on fake data or obsolete AI Studio copy.
- [ ] Metadata and user-facing copy match Abode Alerts and the deployed domain.
- [ ] Every visible action has an end-to-end data path or is removed until it does.

Suggested verification:

- `npm run lint`, `npm run typecheck`; browser smoke across every tab.

## Workstream 16: Auth, Firestore Rules, And Secret Hardening

Goal: Lock down user-owned data, operator-only ingestion, listing preferences, and OAuth/provider secrets before production growth.

Depends on:

- [ ] WS3 final collection model, WS4 preferences model, WS7/WS8 scheduled routes.

Enables:

- [ ] Production launch confidence and safe multi-user usage.

Primary areas:

- `firestore.rules`, `lib/firebase.ts`, `app/api/*`, `docs/architecture/auth-and-secrets.md`, `docs/operations/development-workflow.md`

Implementation tasks:

- [ ] Audit `firestore.rules` for listings read access, user alert ownership, alert-match ownership, listing-preference own-only access, and admin/operator writes.
- [ ] Move provider writes through server/admin paths if client writes are too permissive for shared collections.
- [ ] Add App Check or a documented mitigation path if abuse risk rises.
- [ ] Finalize the OAuth/refresh-token persistence decision: encrypted, user-scoped, server-side, rules-hardened; document it.
- [ ] Verify Firebase authorized domains include the production Vercel URL and the local development domain.
- [ ] Confirm Vercel envs: `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, optional search envs, and scheduler secrets.
- [ ] Add budget alerts if Blaze or paid Google Cloud is enabled.

Exit criteria:

- [ ] Users cannot write arbitrary shared listing state from the browser unless explicitly allowed.
- [ ] Users can read/write only their own alert, alert-match, and preference docs.
- [ ] Scheduled endpoints cannot be triggered without the job token.
- [ ] Auth domains and production envs are documented and verified.

Suggested verification:

- Firebase rules tests; manual denied/allowed Firestore operations; `npm run build`.

## Workstream 17: Tests, Verification, And Production Release Gate

Goal: Prove every acceptance criterion on production with automated and manual verification, and keep the app clean while moving fast.

Depends on:

- [ ] WS1–WS16.

Enables:

- [ ] Reliable production operation and future agent handoffs.

Primary areas:

- `package.json`, `tests/` or framework-native test paths, `scripts/*`, `vercel.json`, `.github/workflows/*`, `docs/operations/development-workflow.md`

Implementation tasks:

- [ ] Add a test harness appropriate for Next/React logic and provider adapters.
- [ ] Add sanitized fixtures for RealtyAPI, Gmail extraction, and search enrichment.
- [ ] Add schema/adapter/repository tests and a query-builder unit test.
- [ ] Add Playwright critical-path smokes: auth chrome, listings/compact dialog + one listing action, toast non-shift, docs TOC pinned, CMA pagination.
- [ ] Add a CI workflow when Git is initialized.
- [ ] Define the release gate: lint, typecheck, format check, tests, build, env verification, protected-route smoke, Firestore rules verification.
- [ ] Production runbook: sign-in → profile-menu sign-out; ~88 listings with compact dialog + one action; toast on simulated alert match without layout shift; docs TOC pinned; CMA pagination; protected daily ingest cron working.

Exit criteria:

- [ ] `npm run verify` is the reliable local release gate.
- [ ] CI runs equivalent gates once a GitHub repo exists.
- [ ] The production smoke checklist is documented, repeatable, and passes.

Suggested verification:

- `npm run verify`; Playwright critical-path smokes; CI run once a repository exists.

## Final Verification And Closeout

Required before marking this plan complete:

- [ ] Run `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run verify`.
- [ ] Run targeted provider/schema/repository tests and the query-builder unit test.
- [ ] Run the `44224` backfill dry run and confirm live data (~88 listings) on the production URL.
- [ ] Run Playwright critical-path smokes (auth, listings/dialog, toast non-shift, docs TOC, CMA pagination).
- [ ] Read back a Firestore sample of persisted listings, provider run records, alerts, alert matches, and user listing preferences.
- [ ] `vercel env ls`; confirm Vercel envs and Firebase authorized domains; confirm protected daily ingest returns 401 without token and 200 with token.
- [ ] `git diff --check`; confirm no tracked file contains secrets or private account tokens.
- [ ] Update `README.md`, `docs/README.md`, operations docs (`env-and-deploy.md`, `provider-ingestion.md`, `development-workflow.md`), architecture docs (`data-model.md`, `auth-and-secrets.md`), and changelog/source-map records.
- [ ] Update the orchestrator log in `docs/engineering/agents/orchestrator-logs/`.
- [ ] If Git exists, stage only intentional files, commit, and push according to `AGENTS.md`.
- [ ] Move the superseded "Production Shape" and "Product Polish & Automation" roadmaps under `docs/_legacy/roadmaps/` after durable docs carry ongoing rules.
- [ ] Promote permanent decisions into `docs/decisions/`.

## Acceptance Criteria

- [ ] Abode Alerts runs locally and builds for production with clean lint, type, format, and build gates; `npm run verify` passes.
- [ ] Vercel production is under **`jamienavinhill`** with envs set via CLI; the `jami.studio` deploy is removed; the protected daily ingest cron is working.
- [ ] Firebase Admin initializes on Vercel serverless via inline service-account JSON; Firebase client config stays public in `firebase-applet-config.json`.
- [ ] `REALTY_API_KEYS` contains the full key list; docs state the keys were not all exhausted for the `44224` baseline; rotation provides resilience/failover.
- [ ] Firestore contains real active listings within 10 miles of `44224` (~88), all with provenance and no invented/stock media; re-running backfill is idempotent.
- [ ] Gmail ingest runs **automatically** on new mail; the manual scan is optional/advanced; automatic path preserves provenance and dedupe.
- [ ] Ingest filter is a multiselect including **Zillow, Trulia, Homes.com, Redfin, realtor.com** plus extensions and an optional custom query, with a live composed-query preview.
- [ ] Daily refresh rotates RealtyAPI keys safely, records run status, evaluates alerts idempotently, and persists alert matches viewable after sign-in without a browser session.
- [ ] Google/free search enrichment stores citations and never presents inferred fields as provider-verified.
- [ ] Toasts are uniform, dismissible, time out, surface alert/ingest/error/confirmation events, and cause zero layout shift.
- [ ] Auth chrome: "Sign in" label only when signed out (no avatar); avatar + profile menu (name, Sign out) when signed in (no header sign-in/sign-out); sign-in and avatar mutually exclusive.
- [ ] Accent control is an icon-only color picker tinted with the current accent, with arbitrary persisted color (no presets, no duplicate swatch).
- [ ] Listing detail is a compact floating dialog (no large breakout views) with professional dense typography and interested/favorite/hide/compare/analyze actions plus export/schedule; hidden listings leave the default grid and are recoverable.
- [ ] CMA tables paginate (10 default, 20/30/100) and sort; layout is balanced with multiple real-inventory charts and compact metric chips; rows open the listing dialog.
- [ ] Docs TOC is pinned; the main content column scrolls independently; content is expanded with the required sections and honest claims.
- [ ] No shipped path contains fake listings, seeded baseline data, stock listing images, or prototype/MVP copy; fixtures live only under tests.
- [ ] Firebase Auth/Firestore remain the baseline storage/auth stack with clear upgrade triggers and budget guardrails; rules restrict users to their own alert/match/preference docs and block unauthorized shared writes.
- [ ] Vercel production envs and Firebase authorized domains (production + local dev) are documented and verified.
- [ ] Docs and agent prompts are project-specific, current, and reusable.

## Implementation Order

1. [x] Create the active roadmap under `docs/roadmaps/` and point the goal prompt at it.
2. [x] Install/configure linting, typecheck, formatting, verify, `.gitignore`, `.env.example` (WS1).
3. [x] Add project-specific `AGENTS.md`, `README.md`, and docs index (WS1).
4. [x] Remove static listing baseline and stock-image fallback behavior (WS11).
5. [x] Replace auth-header and accent-picker baseline behavior (WS10 baseline).
6. [x] Define `44224` radius backfill and ingest ~88 real listings with provenance (WS6).
7. [ ] **WS2** — Confirm Vercel `jamienavinhill`, push envs via CLI+PAT, add inline Firebase Admin JSON, `vercel.json` cron.
8. [ ] **WS3** — Schemas, env validation, repositories, Firestore base model.
9. [ ] **WS4** — User listing preferences contract + rules scaffold.
10. [ ] **WS5** — RealtyAPI and Google search provider adapters (finalize).
11. [ ] **WS9** — Toast system (unblocks notification UX).
12. [ ] **WS10** — Auth chrome + theme density (quick, visible polish).
13. [ ] **WS11** — Finish UI honesty, regional defaults, lint/type cleanup.
14. [ ] **WS7** — Multiselect ingest filter + automatic Gmail ingestion (primary flow).
15. [ ] **WS8** — Daily refresh and persisted alert matches.
16. [ ] **WS12** — Compact listing dialog + actions + grid density.
17. [ ] **WS13** — CMA analytics rebuild (paginated tables + charts).
18. [ ] **WS14** — Docs layout + content expansion.
19. [ ] **WS15** — Wire all views/metadata to final Abode Alerts copy and data.
20. [ ] **WS16** — Harden auth/security rules, OAuth token persistence, and production envs.
21. [ ] **WS17** — Tests/CI/release gate and complete production smoke.
22. [ ] Promote lasting rules to durable docs and retire the two superseded roadmaps.

## Expansion Track

- [ ] Gmail `watch` + Pub/Sub push instead of polling, once justified.
- [ ] Provider marketplace adapters for additional real estate APIs if RealtyAPI coverage gaps remain.
- [ ] Map visualization with Google Maps only after listing coordinates and billing guardrails are verified.
- [ ] Image cache/proxy with provider-term review and Cloud Storage budget guardrails.
- [ ] Push notifications (web push / mobile) after alert-match persistence is stable.
- [ ] Side-by-side compare print/export.
- [ ] Saved-search templates per platform with deep links.
- [ ] Owner/operator dashboard for provider quota, run health, and failed-enrichment triage.
- [ ] Formal decision records for Firebase/Firestore, scheduler choice, provider adapter contracts, media caching, and OAuth token persistence.

## Orchestration Checkpoints

| Dispatch | Workstream | Pass | Agent ID | Next action                        |
| -------- | ---------- | ---- | -------- | ---------------------------------- |
| —        | —          | —    | —        | Awaiting WS2 (Vercel/env) dispatch |
