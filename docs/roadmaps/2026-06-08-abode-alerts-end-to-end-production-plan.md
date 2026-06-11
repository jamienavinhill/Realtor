# Abode Alerts End-To-End Production Plan

Date: 2026-06-08
Status: [~] Active
Source reports: `README.md`, `package.json`, `app/api/properties/route.ts`, `app/api/gemini/route.ts`, `app/globals.css`, `components/dashboard.tsx`, `components/theme-controls.tsx`, `components/views/ListingsGrid.tsx`, `components/views/CMAView.tsx`, `components/views/DocsView.tsx`, `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/env.ts`, `lib/providers/realty-api.ts`, `lib/schemas/*`, `types/listings.ts`, `config/firebase/client-config.json`, `config/firebase/firestore.rules`, `docs/research/INBOX_PARSING.md`, RealtyAPI pricing, Vercel/Firebase/GitHub/Gemini free-tier docs
Owner: Abode Alerts engineering
Surface: Next.js app (`app/`, `components/`), server routes (`app/api/`), env/ops (`lib/env.ts`, `.env.example`, Vercel on `jamienavinhill`), Firebase Auth/Firestore (`lib/firebase.ts`, `lib/firebase-admin.ts`, `config/firebase/firestore.rules`, `types/`), Gemini extraction, Google Workspace OAuth, provider ingestion jobs, production deployment

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
- Firebase Auth and Firestore are wired through `lib/firebase.ts` using `config/firebase/client-config.json` (public client config); Firestore was migrated to the `abode-alerts` database.
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
- `config/firebase/firestore.rules` exists and must be audited before launch-hardening any backfill, saved search, listing-preference, or user-owned collections.
- The repo-wide engineering standards under `docs/engineering/standards/` (planning style, report style, docs standards) remain intact and point at this project.
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
- [x] **Single Vercel project, never another.** The live production app is the one and only project: `realtor` at `https://vercel.com/jamie-navin/realtor`, serving `https://abode-alerts.vercel.app/`. It is live on the correct account. The rogue `jami.studio` deploy was already deleted by the operator. Do NOT create, fork, or re-link any new Vercel project — always target this existing one.
- [x] **Deployment is automatic on `git push`.** Vercel's Git integration builds and deploys every push. Do NOT add a deploy cron, a deploy GitHub Action, or any scheduled redeploy — it is redundant and wastes build minutes/credits. "Redeploy" in this plan means "push to git."
- [x] **Out-of-pocket cost stays $0 — but we use everything free that's available to us.** Free tiers AND trial credits are in-scope and used generously: Firebase is on **Blaze** (its large free quotas apply; Cloud Functions + Pub/Sub are available to us), plus **Vertex AI trial credits** (Gemini calls + GenAI App Builder), **AWS trial credits**, and **IBM trial credits**. Master credential paths live in `.env`: `PATH_TO_FIREBASE_KEYS`, `PATH_TO_GCS_KEYS`, `PATH_TO_AWS_KEYS`, `PATH_TO_IBM_KEYS`. Rule: exhaust free quotas/credits first, "spend only when needed, never pay a real nickel," and surface any genuinely-billable step to the operator before enabling it. See **Cost Model & Free-Tier Budget**.
- [x] **Use every free enrichment call available.** When a listing enters the system, supplement it generously — Gemini (on Vertex credits), free web search, and any other free realtor-data calls. No reason to leave detail out if we can fetch it for free. Reserve the genuinely-scarce budget (RealtyAPI) for authoritative structured data that free sources can't supply.
- [x] Do not use Firebase Storage for third-party listing images by default. Store source media URLs and metadata first; add an image cache/proxy only if provider terms allow caching and product performance requires it.
- [x] Use Gemini **server-side only** for extraction/enrichment. `GEMINI_API_KEY` remains a Vercel/server env var. Do not expose it to the browser.
- [x] **RealtyAPI on Vercel**: set `REALTY_API_KEYS` to the **full comma-separated list** of all `rt_` keys. The adapter rotates across keys; the `44224` ingest did not burn all keys, but multiple keys provide quota headroom and failover. A single key is sufficient only for minimal smoke — not recommended for production. Store all keys in a single server env var, rotate server-side, never expose to the browser.
- [x] **Firebase Admin on Vercel**: add support for inline service account JSON via a new env (e.g. `FIREBASE_SERVICE_ACCOUNT_JSON`) while keeping path-based vars for local Windows dev. Never commit JSON to the repo. Firebase client config stays in `config/firebase/client-config.json` (public); server admin creds are runtime secrets on Vercel.
- [x] **Email-triggered, near-real-time ingestion is THE primary flow (DECIDED).** The operator runs instant listing-alert emails from 5–6 realtor accounts (Zillow, Trulia, Homes.com, Redfin, realtor.com) all landing in `jamienavinhill@gmail.com`. A new such email IS the trigger. The pipeline fires automatically: detect new email → Gemini extracts the listing → enrich generously from free sources (RealtyAPI property-detail when warranted, free web search, Gemini grounding) → validate → upsert to Firestore with provenance/dedupe → evaluate alerts → notify (toast in-app + optional email via the user's own Gmail). The operator never clicks "scan"; manual scan stays only as an advanced fallback.
- [x] **Watcher mechanism (DECIDED): Gmail `watch` → Cloud Pub/Sub push → pipeline endpoint.** Blaze + Pub/Sub are available, so use real push, not polling — this is how we avoid missing a listing by even an hour during the day. The Gmail `watch` registration must be renewed (Gmail expires it ≤7 days) by a small scheduled re-watch (free public-repo GitHub Action). A lightweight **business-hours safety-net poll** (free public-repo Action, ~every 15 min, ~6am–8pm America/New_York) backstops the push; **quiet 8pm–6am** (rely on push only / mostly idle). This is NOT a Vercel deploy cron.
- [x] **RealtyAPI usage policy (DECIDED, first-principles).** RealtyAPI (realtor.com data via `realtor.realtyapi.io`) is the _authoritative structured_ source but the _scarcest_ budget: the free plan is **250 requests/MONTH per key** (NOT per day — our code's "daily" label and in-memory `QuotaTracker` do not enforce a real monthly budget; this must be fixed). True budget ≈ **8 × 250 = ~2,000 RealtyAPI calls/month**. Therefore: discovery comes FREE from the email alerts (do NOT spend RealtyAPI to _find_ listings); spend RealtyAPI only on **(a)** a periodic baseline/refresh sweep of the 44224 zone (`/search/bylocation`, a few pages, cheap) and **(b)** per-new-listing **property-detail enrichment** when an emailed listing needs authoritative fields/photos/history a free source can't give. Everything else — parsing, structured extraction, comparison, analysis, gap-fill — runs on Gemini/Vertex (credits) and free web search. Persist enrichment so we never re-spend a call for the same listing.
- [x] **Protected ingest endpoints require `INGEST_JOB_TOKEN`.** The Pub/Sub push handler and the safety-net poll both authenticate to these routes; the token is server-side only.
- [x] Baseline backfill target is all current active listings within 10 miles of ZIP `44224`, centered on Stow, Ohio. Persist source provenance, fetch timestamp, provider account id/key alias, dedupe key, coordinates, media URLs, and raw provider payload hash.
- [x] Google/free search enrichment can fill gaps only with permitted public/indexed data and source citations. Do not scrape behind auth, evade rate limits, or invent values.
- [x] **Listing user actions** (interested/not-interested/favorite/hidden/compare) store under `users/{uid}/listingPreferences/{listingId}` (or equivalent) — never on shared catalog documents. Compare set uses `users/{uid}/compareQueue` capped at N (e.g. 4).
- [x] **Toasts**: single shared toast host (portal/fixed layer), top-right or bottom-right, `pointer-events` safe, with auto-timeout and manual close, never participating in document flow.
- [x] **Typography**: reduce `font-extrabold` / oversized hero headings on data surfaces; align with compact dashboard density.
- [x] **Account sharing (DECIDED, keep it simple).** A user can invite another person to **their** account/database by email and pick a role: **viewer** (read-only) or **editor**. An editor can do everything the owner can **except delete the owner's account**. This is deliberately NOT a complex RBAC system — it is "let my mother (or anyone) into my workspace so we can work on it together." Data is not sensitive/critical; favor the simplest clean invite + role flow that works. (See Workstream: Account Sharing & Collaboration.)
- [x] **Repository is PUBLIC.** This unlocks free-unlimited GitHub Actions (the re-watch + safety-net poll cost nothing). No secrets ever live in the repo — they stay in `.env` (gitignored) and Vercel/GitHub encrypted secrets.
- [x] **No ambiguity, no leftovers, no shims, no mocked data, no placeholders, no prototype/MVP/v1-v2-v3 framing — anywhere.** Every shipped surface is the final, polished, fully-wired form. Fixtures live under `tests/` only and never reach a shipped path. Half-built features are either finished end-to-end or not merged. This is a non-negotiable quality bar, not an aspiration.
- [x] **Full end-to-end with the nice-to-haves included.** Dev delights, polish, intentional UX, and the niceties are in-scope by default, not deferred. "Done" means delightful and complete, not minimally functional.
- [x] Engineering tooling baseline is npm, ESLint, Prettier, TypeScript, Next build, and `npm run verify`.

## Scope Boundaries

- Security: secrets live only in local `.env`, Vercel env vars, GitHub Actions secrets, or provider secret stores. Never commit keys, PATs, Firebase service accounts, account credentials, or raw OAuth tokens.
- Runtime exposure: browser code may access Firebase client config and Google OAuth sign-in only. Provider keys, Gemini keys, scheduled-job tokens, PATs, and service credentials stay server-side. UI components never call RealtyAPI directly — server routes and scripts only.
- Provider behavior: use official APIs, user-authorized inbox data, or permitted public search results. Provider data remains source of truth; Gemini extracts from email text only — no invented prices or photos. Record source URLs and extraction confidence. Do not present inferred data as provider-verified fact.
- Gmail automation requires user OAuth consent with `gmail.readonly`; refresh-token storage must be documented and rules-hardened.
- Migrations: Firestore collection/schema changes must be additive first, backfilled with scripts, then read paths can rely on them after verification.
- Public claims: no claim of MLS completeness, exclusive access, guaranteed real-time freshness, or investment advice unless backed by source contracts and legal review. CMA charts reflect Firestore inventory only; empty states stay honest.
- Cost: **$0 is the requirement.** Every host stays on its perpetual free tier (see Cost Model & Free-Tier Budget). No design may assume Blaze, paid Vercel, or any metered overage. If a desired capability cannot be done for free, it is raised to the operator as an explicit decision with the exact cost — never silently enabled.

### Explicit Non-Goals For This Plan

- Do not reintroduce mock listings, stock media, or prototype-only data paths.
- Do not change unrelated dirty/untracked local artifacts (`.playwright-cli/`, `agent-tools/`, etc.).
- Do not expand scope beyond the requirements captured below unless required as a direct dependency (e.g. Firestore rules for user listing preferences).
- Do not create a second Vercel project or a deploy cron. Do not incur real out-of-pocket charges — free quotas and trial credits only.

## Cost Model & Free-Tier Budget

Verified free-tier capacities as of 2026-06-08 (sources below). These are the hard ceilings the whole system must live within. Numbers drift — re-verify in each provider's console before relying on a margin.

| Host                             | Free-tier capacity (relevant limits)                                                                                                                                                                                                                                                                               | What consumes it here                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Vercel Hobby**                 | 100 GB bandwidth/mo · 1M edge requests/mo · 1M function invocations/mo · **4 hrs Active CPU/mo** · 360 GB-hrs memory/mo · 5k image transforms/mo. No overage (hits cap → app pauses till reset). Hobby terms are non-commercial.                                                                                   | Page loads, API routes (`/api/*`), each Gemini/ingest call runs as a function (CPU-time is the scarce one). |
| **Firebase Blaze (free quotas)** | Firestore: **50k reads/day · 20k writes/day · 20k deletes/day · 1 GB stored · 10 GiB/mo egress**. Cloud Functions: **2M invocations/mo free**. Pub/Sub: 10 GB/mo free. Auth free. On Blaze these stay $0 until quotas are exceeded; budget alert set so nothing surprises us.                                      | Dashboard listener reads, ingest writes, alert-match writes, the Pub/Sub push handler.                      |
| **Vertex AI (trial credits)**    | Gemini on Vertex billed to **trial credits** (not the 1,500/day free-key cap). Effectively our high-volume model lane for extraction/enrichment/analysis.                                                                                                                                                          | Email parsing, structured extraction, enrichment reasoning, listing analysis.                               |
| **Gemini API (free key)**        | Gemini 3 Flash: **10 req/min · 1,500 req/day** free; quota is per-project, not per-key. Fallback/local lane.                                                                                                                                                                                                       | Low-volume/local extraction when not using Vertex.                                                          |
| **GitHub Actions**               | **Public repo: unlimited free minutes** (repo is public).                                                                                                                                                                                                                                                          | Gmail-`watch` weekly re-registration + business-hours safety-net poll.                                      |
| **RealtyAPI**                    | ⚠️ Free plan is **250 req/MONTH per key** (per the realtyapi.io pricing page — NOT per day). 8 keys ≈ **2,000 req/MONTH** (~66/day if smoothed). **Verify in the key dashboards before relying on it; our `QuotaTracker` is in-memory only and labels it "daily" — must be corrected to real monthly accounting.** | Periodic zone sweep + per-new-listing property-detail enrichment only.                                      |
| **AWS / IBM (trial credits)**    | Generous trial credits available as overflow compute/services if ever needed.                                                                                                                                                                                                                                      | Not required by the core design; reserve as optional overflow.                                              |
| **Google Custom Search**         | 100 queries/day free.                                                                                                                                                                                                                                                                                              | Gap-fill enrichment (`GOOGLE_SEARCH_*`).                                                                    |

Cost-architecture rules that follow from the table:

- **Discovery is free** — the operator's instant realtor-alert emails surface every new listing. Never spend a RealtyAPI call to _discover_ a listing.
- **RealtyAPI is the scarcest budget (~2,000/MONTH)** — reserve strictly for authoritative structured data free sources can't supply (periodic zone sweep + per-listing property detail). Persist results so the same listing never costs a second call.
- **Gemini runs on Vertex trial credits** for volume; the free key is the fallback lane. Use generously for extraction/enrichment/analysis.
- **Server-side reactions** use the Gmail-`watch` → **Pub/Sub push → Cloud Function/route** pipeline (Blaze makes this free within quota), plus a free public-repo Action that (a) renews the Gmail `watch` weekly and (b) runs a business-hours safety-net poll. Client-side `onSnapshot` listeners drive the live UI for free.
- **Email notifications** send via the user's own Gmail (Gmail API send scope) — no third-party email vendor.
- Vercel Hobby Active CPU (4 hrs/mo) stays the tightest ceiling — keep functions fast; push heavy/looping work to Cloud Functions or Actions.

Sources: [Vercel Hobby limits](https://vercel.com/docs/plans/hobby) · [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) · [Firestore quotas](https://firebase.google.com/docs/firestore/quotas) · [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions) · [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) · [RealtyAPI pricing](https://www.realtyapi.io/)

## Baseline Preseeding — Current State (audited 2026-06-08)

Firestore live contents (admin readback): `properties` **88** (real RealtyAPI actives, full provenance: `sourceProvider`, `sourceUrl`, `sourceListingId`, `media[]`, `coordinates`, `distanceMiles`, `dedupeKey`, `rawHash`, `radiusCenter`, `provenance.keyAlias/providerRunId`), `alerts` **1** (operator seed), `alert_matches` **40**, `ingest_runs` **5**.

- [x] **Listing baseline DONE** — 88 current active listings within 10 mi of `44224`, real media, auditable provenance, idempotent backfill (`lib/ingest/backfill.ts`, `scripts/backfill-44224.ts`).
- [ ] **Historical data NOT done** — properties hold a current snapshot only; no price history / sold comps / time series for the analysis tools.
- [ ] **User profile & preferences baseline NOT done** — no `users/{uid}/profile` or `listingPreferences`; "OUR preferences/profile" is not yet captured in writing or in Firestore.
- [ ] **Google web-search enrichment NOT exercised** — no `GOOGLE_SEARCH_*` enrichment has run against gaps.
- [ ] **RealtyAPI budget largely UNSPENT (but scarce: ~2,000/MONTH)** — backfill used a couple of pages on one key alias; the monthly budget is mostly available, but it is monthly, not daily, so the deep preseed must be deliberate.

### Preseeding Strategy (DECIDED — deterministic, written before execution)

First-principles target: a robust, current baseline of homes matching our criteria + the historical depth our analysis tools need + our own profile/preferences, built mostly from free lanes, spending RealtyAPI only where it's the only authoritative source.

1. **Gemini/Vertex first (credits, generous).** Use Gemini for the heavy lifting: normalize/enrich the existing 88 listings, derive analysis features (price/sqft, type mix, neighborhood summaries), and draft historical/market context via Gemini web-search grounding. This is the primary preseed engine.
2. **Free web search next.** Google Custom Search (100/day) + Gemini grounding to gap-fill non-authoritative fields (schools, neighborhood, commute, listing narrative) with citations — never invented.
3. **RealtyAPI last, surgically.** Spend the ~2,000/month only on: (a) one fuller `/search/bylocation` sweep of the 44224 zone to widen/refresh the active set beyond the initial 88, and (b) `property-detail` calls for high-interest listings needing authoritative fields/photos/history. Persist every result so it's never re-fetched.
4. **Capture OUR profile/preferences explicitly** in Firestore (`users/{uid}/profile`): target zone(s), price band, beds/baths, must-haves/deal-breakers, and weighting — so ranking and alerts are tailored to us, deterministically, not guessed by agents.
5. **Historical depth**: record a price-history/observations trail per listing going forward (every refresh appends a dated snapshot) so the analysis tools accrue real time-series even where RealtyAPI history isn't fetched.

The exact query list, per-listing call ceilings, and the `profile`/`history` schemas are specified in **Workstream 3 / Workstream 6** before any agent runs the preseed.

### Resolved Decisions (operator sign-off received 2026-06-08)

1. **Ingestion cadence** — Gmail `watch` → Pub/Sub push pipeline (real-time) + free public-repo Action for weekly re-watch and a business-hours (~6am–8pm ET) safety-net poll; quiet 8pm–6am. (Locked above.)
2. **Preseeding** — strategy above; deterministic recipe finalized in WS3/WS6.
3. **Repo visibility** — PUBLIC (free-unlimited Actions). (Locked above.)
4. **Cost posture** — Blaze + Vertex/AWS/IBM trial credits in use; $0 out-of-pocket. (Locked above.)
5. **Account sharing** — owner invites viewer/editor; editor can do all but delete the account. (Locked above; see Workstream: Account Sharing & Collaboration.)

## Repo Guidance

- Follow `AGENTS.md`, this roadmap, and the standards under `docs/engineering/standards/`. Read relevant files before editing.
- Windows local dev; single Vercel project `realtor`. Use `rg`/project search before changing shared flows.
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
  - project config only (NO deploy cron — deploys are automatic on `git push`)
- `.github/workflows/`
  - optional **free public-repo** ingest-poll Action hitting the protected route, only if the Open Decision selects a closed-app poll (not a deploy trigger)
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
6. Firebase client config stays in `config/firebase/client-config.json` (public); server admin creds are runtime secrets on Vercel.
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

## Data Contracts & Firestore Collection Map

This is the authoritative, unambiguous contract surface. Implement to these exact shapes. Existing contracts live in `types/listings.ts` + `lib/schemas/*` with hand-written validators (this repo uses runtime validators, not zod) and `config/firebase/firestore.rules` for access. New contracts follow the same pattern: a TypeScript interface in `types/`, a `validate*` function in `lib/schemas/`, a repository in `lib/repositories/`, and matching `config/firebase/firestore.rules`. All timestamps are ISO‑8601 strings. IDs match `^[a-zA-Z0-9_\-]+$`, ≤128 chars.

### Existing contracts (already implemented — do not redefine, only extend additively)

```ts
// types/listings.ts — shipped today, backing the 88 live listings.
interface ListingMedia {
  url: string;
  type?: "photo" | "primary";
  sourceUrl?: string;
}
interface RadiusCenter {
  lat: number;
  lng: number;
  zipCode: string;
}
interface ListingProvenance {
  providerRunId?: string;
  keyAlias?: string;
  fetchPage?: number;
}
interface ListingProperty {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: "Single Family" | "Condo" | "Townhouse" | "Multi-Family" | "Land" | string;
  status: "Active" | "Pending" | "Sold" | string;
  imageUrl: string;
  imageUrls?: string[];
  coordinates: { lat: number; lng: number };
  yearBuilt?: number;
  description?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  sourceProvider?: string;
  sourceUrl?: string;
  sourceListingId?: string;
  sourceUpdatedAt?: string;
  ingestedAt?: string;
  provenance?: ListingProvenance;
  media?: ListingMedia[];
  rawHash?: string;
  dedupeKey?: string;
  distanceMiles?: number;
  radiusCenter?: RadiusCenter;
}
interface ProviderListingProperty extends ListingProperty {
  /* sourceProvider, sourceUrl, sourceListingId, ingestedAt, media, rawHash, dedupeKey all required */
}
interface PropertyAlert {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  criteria: {
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    beds?: number;
    baths?: number;
    propertyType?: string;
  };
}
interface AlertMatch {
  id: string;
  alertId: string;
  listingId: string;
  userId: string;
  matchReason: string;
  firstSeenAt: string;
  lastSeenAt: string;
}
interface IngestRun {
  id: string;
  type: "backfill" | "daily";
  status: "running" | "completed" | "failed" | "partial";
  startedAt: string;
  finishedAt?: string;
  idempotencyKey: string;
  zipCode?: string;
  radiusMiles?: number;
  radiusCenter?: RadiusCenter;
  keyAliasesUsed: string[];
  quotaUsed: Record<string, number>;
  listingsFetched: number;
  listingsUpserted: number;
  listingsSkipped: number;
  alertMatchesCreated: number;
  alertMatchesUpdated: number;
  errors: string[];
}
```

Additive extensions to existing contracts (new optional fields — keep validators backward-compatible):

```ts
// ListingProperty — enrichment + history additions:
enrichment?: {                       // free-lane enrichment, with citations; never presented as provider-verified
  schools?: { name: string; rating?: number; sourceUrl: string }[];
  neighborhood?: string;             // Gemini/web summary, with sources[] below
  walkability?: number; commuteNotes?: string;
  sources: { field: string; url: string; provider: "gemini" | "google-search" | "web"; fetchedAt: string }[];
  realtyApiDetailFetchedAt?: string; // set when RealtyAPI property-detail was spent on this listing (gate against re-spend)
};
history?: { observedAt: string; price: number; status: string; source: string }[]; // dated trail appended on each refresh
// IngestRun — add ingest type for the email pipeline:
type IngestRun.type = "backfill" | "daily" | "email" | "poll";
```

### New contracts (to implement)

```ts
// types/profile.ts — OUR criteria/preferences, so ranking + alerts are tailored deterministically. Owner-scoped.
interface UserProfile {
  uid: string;
  displayName?: string;
  targetZones: { zipCode: string; radiusMiles: number; label?: string }[]; // e.g. [{ zipCode: "44224", radiusMiles: 10 }]
  priceMin?: number;
  priceMax?: number;
  bedsMin?: number;
  bathsMin?: number;
  sqftMin?: number;
  propertyTypes?: string[]; // allow-list; empty = any
  mustHaves?: string[];
  dealBreakers?: string[]; // free-text criteria for Gemini scoring
  weighting?: { price?: number; size?: number; location?: number; condition?: number }; // 0..1 ranking weights
  updatedAt: string;
}

// types/preferences.ts — per-user, per-listing state (WS4). Owner-scoped subcollection.
type ListingUserStateValue = "interested" | "notInterested" | "favorite" | "hidden";
interface ListingUserState {
  listingId: string;
  state: ListingUserStateValue;
  note?: string;
  updatedAt: string;
}
interface CompareQueue {
  listingIds: string[];
  updatedAt: string;
} // max 4 entries

// types/sharing.ts — account sharing (WS18). Owner = workspace owner uid.
type MemberRole = "viewer" | "editor";
interface AccountMember {
  memberUid: string;
  email: string;
  role: MemberRole;
  invitedAt: string;
  acceptedAt?: string;
}
interface AccountInvite {
  token: string;
  ownerUid: string;
  email: string;
  role: MemberRole;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt?: string;
  acceptedByUid?: string;
}

// types/provider-quota.ts — REAL monthly RealtyAPI budget accounting (WS5 fix). One doc per calendar month.
interface ProviderQuotaMonth {
  month: string; // "YYYY-MM"
  perKey: Record<string, number>; // keyAlias -> calls spent this month
  monthlyLimitPerKey: number; // 250 (verify in dashboards)
  totalSpent: number;
  updatedAt: string;
}

// types/gmail-sync.ts — per-user Gmail watch + cursor state (WS7). Owner-scoped; refresh token stored ENCRYPTED.
interface GmailSync {
  uid: string;
  historyId?: string;
  watchExpiresAt?: string;
  lastProcessedAt?: string;
  platformSelection: string[];
  customQuery?: string;
  refreshTokenEnc?: string; // encrypted at rest; never returned to client
  updatedAt: string;
}
```

### Firestore Collection Map (paths, owner, writer, rules intent)

| Path                                         | Holds                         | Read                          | Write                                                                    |
| -------------------------------------------- | ----------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `properties/{listingId}`                     | `ListingProperty` catalog     | public (`list,get` true)      | server/Admin SDK (ingestion); client write paths to be tightened in WS16 |
| `alerts/{alertId}`                           | `PropertyAlert`               | owner (`userId == auth.uid`)  | owner only                                                               |
| `alert_matches/{matchId}`                    | `AlertMatch`                  | owner                         | server/Admin SDK only                                                    |
| `ingest_runs/{runId}`                        | `IngestRun`                   | server only                   | server/Admin SDK only                                                    |
| `provider_quota/{YYYY-MM}`                   | `ProviderQuotaMonth`          | server only                   | server/Admin SDK only                                                    |
| `users/{uid}/profile/main`                   | `UserProfile`                 | owner + workspace members     | owner + editors                                                          |
| `users/{uid}/listingPreferences/{listingId}` | `ListingUserState`            | owner + workspace members     | owner + editors                                                          |
| `users/{uid}/compareQueue/main`              | `CompareQueue`                | owner + workspace members     | owner + editors                                                          |
| `users/{uid}/gmailSync/main`                 | `GmailSync` (token encrypted) | server only (never to client) | server/Admin SDK only                                                    |
| `accounts/{ownerUid}/members/{memberUid}`    | `AccountMember`               | owner + members               | owner; editors may add/remove ≤ editor; only owner removes owner         |
| `invites/{token}`                            | `AccountInvite`               | invitee-by-token + owner      | owner creates/revokes; invitee accepts                                   |

Rules invariants (WS16/WS18): global deny-by-default stays; `properties` read stays public; **only the workspace owner can delete the account/owner record**; an **editor** may do everything an owner can on the workspace data **except delete the account or remove/demote the owner**; a **viewer** is read-only across the owner's `profile`, `listingPreferences`, `compareQueue`, `alerts`, `alert_matches`; non-members get nothing; `gmailSync` (refresh token) and `provider_quota` are never client-readable.

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
- **WS16 (Auth, rules, secret hardening)** depends on WS3/WS4 final collection model, WS7/WS8 ingest routes, and WS18 sharing model.
- **WS18 (Account sharing & collaboration)** depends on WS3 collection model and WS16 rules; enables multi-user workspaces.
- **WS17 (Tests, verification, release gate)** depends on WS1–WS16, WS18.

```text
WS1 ──► all streams
WS2 ──┬──► WS7  ┬──► WS17
       └──► WS8  ┘
WS3 ──► WS5 ──► WS6 ──► WS8, WS13, WS15
WS3 ──► WS7, WS8, WS16, WS18
WS4 ──► WS12, WS13, WS16
WS9 ──► WS7, WS8, WS12, WS13
WS10 ──► WS17 ; WS11 ──► WS15 ; WS14 ──► WS17 (parallel)
WS12 ──► WS15 ; WS13 ──► WS15
WS16 ──► WS18 ──► WS17
WS1..WS16, WS18 ──► WS17
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
- `docs/engineering/standards/docs-standards.md`

Implementation tasks:

- [x] Install/configure ESLint, Prettier, Tailwind-aware formatting, TypeScript check, and `npm run verify`.
- [x] Replace AI Studio README boilerplate with Abode Alerts stack, env, and command guidance.
- [x] Add `.gitignore` that blocks local env, Vercel, build, and dependency artifacts.
- [x] Add `.env.example` with required server env names and no values.
- [x] Create `AGENTS.md` from the provided structure, refreshed for this Next/Firebase app.
- [x] Point the repo's agent entry doc (`AGENTS.md`) at the active roadmap directory and this repo's verification commands.
- [x] Add `docs/README.md` index.
- [x] Add `docs/operations/development-workflow.md` after the first full green verification pass. (Created 2026-06-09 once `npm run verify` was green.)
- [ ] Add `docs/architecture/auth-and-secrets.md` after auth/token persistence is finalized. (Deferred — depends on WS16 auth/token work; out of WS1 lane.)

Re-run findings (WS1 re-run, 2026-06-09) — gate was RED, now green:

- [x] Fixed `npm run build`: added `react-is@^19` (+ `@types/react-is@^19`) as a direct dependency so `recharts@3` resolves its runtime `react-is` import (verified against the npm registry — recharts@3 peer-depends on `react-is` for React 16–19; React 19 here → `react-is@19`). No shim, no alias.
- [x] Fixed `npm install` peer conflict: bumped `@firebase/rules-unit-testing` `^4.0.1 → ^5.0.1` (v5 peer-depends on `firebase@^12`, verified on npm). Firebase stays `^12`; no `--force`, no `--legacy-peer-deps`, no `overrides`.
- [x] Fixed `npm run test`/`verify`: the WS4 Firestore-rules emulator test required the emulator on `:8080` but was matched by the default `test` glob. Moved it to `tests/emulator/`, scoped `test` to `tests/*.test.ts`, and pointed `test:rules` at `tests/emulator/*.test.ts`. The emulator suite now runs only under `test:rules`, outside the standard gate.
- [x] Added `@eslint/eslintrc` as a direct devDependency (imported directly by `eslint.config.mjs`).
- [x] Untracked `tsconfig.tsbuildinfo` (build artifact; already in `.gitignore`).
- [x] Ignored ephemeral `docs/engineering/agents/orchestrator-logs/` in `.prettierignore` so run logs do not fail the format gate.
- [x] Corrected the `REALTY_API_KEYS` comment in `.env.example` from "~250 req/key/day" to "~250 req/MONTH per key" to match verified RealtyAPI free-tier facts.

Exit criteria:

- [x] `npm run lint`, `npm run typecheck`, `npm run format:check`, and `npm run build` are real commands.
- [x] New agents can start from `AGENTS.md` and this roadmap without stale Studio/Jami references.
- [x] No tracked file contains secret values.
- [x] `npm run verify` is green end-to-end with no force flags or shims (lint, typecheck, format:check, 30 tests, build — 2026-06-09).

Suggested verification:

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `git diff --check`.

## Workstream 2: Vercel Account, Env Canon, And Firebase Admin On Serverless

Goal: Production on `jamienavinhill` has complete, documented runtime envs and working Firebase Admin on serverless, with token-gated protected ingest routes. (No deploy cron — deploys are automatic on `git push`.)

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
- [~] Ingest cadence: do NOT add a Vercel deploy cron. Deploys are automatic on `git push`. The ingest-trigger mechanism is an Open Decision (write-time eval + optional free public-repo GitHub Action) — defer until the operator signs off on the cost map.
- [!] Verify Firebase authorized domains include the production Vercel URL and the local development domain. **Operator-pending** — code ready (`scripts/add-auth-domains.ts` reconciles `localhost`, `127.0.0.1`, `abode-alerts.vercel.app`, additive, extra domains via args/`AUTH_DOMAINS`). Exact step: `node --env-file=.env --import tsx scripts/add-auth-domains.ts` (needs the live Firebase Admin credential resolvable; confirms all three domains authorized).
- [!] Add budget alerts if Blaze or paid Google Cloud is enabled. **Operator-pending** — currently within free quotas. Exact step: Google Cloud console → Billing → Budgets & alerts → create a budget alert on project `code-485607` before enabling any billable service.
- [!] Redeploy production; read back the `44224` baseline (~88 listings) on the production URL. **Operator-pending** — `scripts/vercel-listings-check.ts` smokes the live page AND the protected-route gate. Exact step: push to git (auto-deploy), then `node --env-file=.env --import tsx scripts/vercel-listings-check.ts` (asserts ≥3 listing cards and `POST /api/ingest/daily` → 401 without token / non-auth with token; token never printed).

Re-run findings (WS2 re-run, 2026-06-09) — surface was code-incomplete on auth hardening and ops docs; gaps closed:

- [x] Hardened the protected-route token gate: `lib/ingest/auth.ts` now uses a **constant-time** compare (SHA-256 digest + `timingSafeEqual`) instead of `===`, so neither token length nor content leaks via timing. Both ingest routes already read the token server-side (`process.env.INGEST_JOB_TOKEN`), gate via `validateIngestToken`, and return 401 unauthenticated / 503 when unconfigured. `tests/ingest-auth.test.ts` extended to cover length-mismatch rejection, empty-expected rejection, and Authorization-over-`x-ingest-token` precedence (37 tests pass).
- [x] `lib/firebase-admin.ts` audited against firebase-admin **v13** official guidance (idempotent `getApps()` guard, `cert(serviceAccount)`, `getFirestore(app, "abode-alerts")` named database — all correct). Hardened: the inline-JSON parse error no longer echoes the raw value (could leak a private-key fragment), and a missing `firestoreDatabaseId` now throws an explicit error.
- [x] Created `docs/operations/env-and-deploy.md`: the full env canon (app-runtime vs operator-only lanes), Firebase Admin credential resolution order (inline JSON → file path), the exact Vercel REST API env-push recipe (`POST /v10/projects/{id}/env`, `type: encrypted`, all three targets, `upsert=true`, placeholders only), the automatic-`git push` deploy model (no cron), the auth-domain step, and an honest verified-vs-operator-pending split.
- [x] `.env.example`: confirmed it documents every app-read env (grep-verified: `GEMINI_API_KEY`/`GOOGLE_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `PATH_TO_FIREBASE_ADMIN_SDK`/`GOOGLE_APPLICATION_CREDENTIALS`, optional `GOOGLE_SEARCH_*`); added an operator-only optional-script-input section (`AUTH_DOMAINS`, `PROD_URL`, `SMOKE_URL`, `GOOGLE_TEST_*`). Names only, no values.
- [x] `scripts/vercel-listings-check.ts`: removed the stale hardcoded session temp path (violated the repo-artifact boundary), now writes to an OS temp dir and adds a protected-route smoke (401/403 without token, non-auth status with token; token never printed).

Pass 2 audit (WS2 re-run, 2026-06-09) — independent re-audit of the full WS2 surface; **stream is quiet, no code fix required**:

- [x] Token gate re-verified: `constantTimeEquals` hashes both inputs to fixed-length SHA-256 digests before `timingSafeEqual`, so neither token length nor content leaks via timing; empty/missing token and empty expected-token both reject (no throw); Authorization-bearer takes precedence over `x-ingest-token`. Both `app/api/ingest/{daily,backfill}/route.ts` read `INGEST_JOB_TOKEN` server-side, return **503** when unconfigured and **401** when unauthorized before any work runs. Covered by `tests/ingest-auth.test.ts` (7 cases).
- [x] `lib/firebase-admin.ts` re-verified against the **installed** firebase-admin (13.10.0): `getApps()` idempotency guard, inline-JSON (`FIREBASE_SERVICE_ACCOUNT_JSON`) preferred over file path, `cert(serviceAccount)`, and `getFirestore(app, "abode-alerts")` named-database overload all confirmed present in the shipped typings (`getFirestore.length === 2`). No error path echoes the service-account JSON or private key. Settings (`ignoreUndefinedProperties`) applied once.
- [x] `.env.example` cross-checked by grep against every `process.env.*` the app reads via `lib/env.ts` — all app-runtime names present (`GEMINI_API_KEY`/`GOOGLE_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `PATH_TO_FIREBASE_ADMIN_SDK`/`GOOGLE_APPLICATION_CREDENTIALS`, optional `GOOGLE_SEARCH_*`); operator-only lane separated; names only, no values. No `vercel.json` exists (correct — deploys are automatic on `git push`, no deploy cron).
- [x] `docs/operations/env-and-deploy.md` re-read: accurate, secret-free, verified-vs-operator-pending split is honest.

Exit criteria:

- [x] Runtime envs present and encrypted on the Vercel project across production/preview/development (readback-confirmed, prior WS2 pass).
- [x] Firebase Admin initializes from inline env JSON (Vercel) or local path (dev); local readback returned 88 properties. Init verified against firebase-admin v13 official docs.
- [x] Protected ingest routes gate on `INGEST_JOB_TOKEN` (constant-time compare): unauthorized returns 401, unconfigured returns 503, authenticated proceeds. Covered by `tests/ingest-auth.test.ts`; production smoke (`scripts/vercel-listings-check.ts`) is operator-pending against the live URL.
- [x] No secrets in tracked files (`.env`/`.env.local` gitignored; service-account JSON never committed; `.env.example` is names-only).

Suggested verification:

- `npm run verify` (lint, typecheck, format:check, 37 tests, build — green 2026-06-09). Operator-pending live smokes: Vercel env readback via REST API; `scripts/vercel-listings-check.ts` (production listings + `POST /api/ingest/daily` returns 401 without token, non-auth with token); `scripts/add-auth-domains.ts` against the live project.

## Workstream 3: Contracts, Schemas, Env Validation, And Firestore Model

Goal: Define durable typed contracts for listings, alerts, provider runs, media, provenance, and env readiness before adding provider automation.

Depends on:

- [x] WS1 command baseline.
- [x] WS11 fake-data removal (parallel-safe).

Enables:

- [ ] Provider adapters, backfill, daily refresh, automatic ingestion, security rules, docs, and tests.

Primary areas:

- `types/listings.ts`, `lib/schemas/*`, `lib/env.ts`, `lib/repositories/*`, `config/firebase/firestore.rules`, `.env.example`, `docs/architecture/data-model.md`

Implementation tasks:

- [x] Add a runtime schema library or handwritten validators for listing, media, alert, and ingest-run payloads.
- [x] Expand listing contract with `sourceProvider`, `sourceUrl`, `sourceListingId`, `sourceUpdatedAt`, `ingestedAt`, `provenance`, `media[]`, `rawHash`, `dedupeKey`, `radiusCenter`, and `distanceMiles`.
- [x] Add backward-compatible additive extensions: `enrichment` (cited `sources[]`, schools, neighborhood, walkability, `realtyApiDetailFetchedAt`) and `history[]` (dated price/status trail), with handwritten validators that reject malformed citations.
- [x] Define provider run records with status, started/finished timestamps, key alias, quota used, result counts, error counts, and idempotency key; extend `IngestRun.type` to `backfill | daily | email | poll` for the email/poll pipelines.
- [x] Add env validation for `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON`, optional `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID`, and optional Firebase env promotion values.
- [x] Write repository functions for listings, alerts, and ingest runs.
- [x] Document schema ownership and migrations in `docs/architecture/data-model.md`.

Re-run findings (WS3 audit pass 2, 2026-06-09) — surface was already largely complete; gaps closed:

- [x] Added an explicit server-only deny block for `provider_quota/{YYYY-MM}` in `config/firebase/firestore.rules` so the base access model matches the Collection Map exactly (`ingest_runs` and `provider_quota` both `allow read, write: if false`). The `ProviderQuotaMonth` type/repo still land with WS5; only the base-model rules deny is in WS3 lane.
- [x] Extended `tests/firestore-rules-structure.test.ts` to assert the WS3 base model (global deny-by-default, public `properties` read, owner-scoped `alerts`/`alert_matches`, server-only `ingest_runs`/`provider_quota`) — previously it covered only the WS4 preference/compare paths.
- [x] Reconciled the `docs/architecture/data-model.md` Tests list and added the `provider_quota` rules note (no contract drift found in schemas/repositories/env vs. live code).
- [x] Audited validators (`lib/schemas/*`): all handwritten, uniform `ValidationResult`/`fail`/`ok` style, reject malformed payloads, and stay backward-compatible with the 88 live listings (which carry every required provider field). Repositories all validate-before-write and persist ISO-8601 timestamps + provenance with one consistent pattern. `lib/env.ts` accepts inline JSON or local path with actionable per-var errors. No further changes needed.

Exit criteria:

- [x] API routes and scripts validate external/provider payloads before writing Firestore.
- [x] Firestore writes include provenance and dedupe metadata.
- [x] Env failures are explicit and actionable before any provider call runs.

Suggested verification:

- `npm run typecheck`, `npm run lint`, targeted repository/schema tests once a harness exists.

## Workstream 4: User Listing Preferences Contract

Goal: Per-user interested, favorite, hidden, and compare-set state in Firestore.

Depends on:

- [x] WS3 base contracts/repositories (shared types).

Enables:

- [ ] WS12 listing dialog actions, WS13 CMA row actions, WS16 rules.

Primary areas:

- `types/listings.ts`, `lib/schemas/listing-preferences.ts`, `lib/repositories/listing-preferences.ts`, `config/firebase/firestore.rules`

Implementation tasks:

- [x] Define `ListingUserState`: `interested | notInterested | favorite | hidden`, with `updatedAt`/`createdAt` timestamps and an optional `note` (`types/listings.ts`; handwritten validator in `lib/schemas/listing-preferences.ts`, uniform with the other schemas).
- [x] Repository CRUD scoped to the owner uid, stored under `users/{uid}/listingPreferences/{listingId}` — `get`/`list`/`upsert` (set/clear via state)/`delete`, validating before every write and carrying timestamps (`lib/repositories/listing-preferences.ts`).
- [x] Compare set under `users/{uid}/compareQueue/{COMPARE_QUEUE_DOC_ID}` (canonical doc id `main`, exported from `types/listings.ts`), capped at `MAX_COMPARE_LISTINGS = 4` with explicit errors when exceeded; repo `add`/`remove`/`set`/`get` helpers.
- [x] Rules: an owner can read/write ONLY their own `listingPreferences` and `compareQueue` docs (non-owners denied); deny-by-default preserved. `compareQueue` modeled as a `{queueId}` subcollection doc so the path is uniform with `listingPreferences`. Both `create` and `update` on a preference enforce `incoming().listingId == listingId` (body id must equal the doc/path id), so the stored `listingId` can never diverge from the path. Full cross-collection hardening still lands in WS16.

Exit criteria:

- [x] Rules unit/emulator tests pass for own-only access — `npm run test:rules` is GREEN (7 emulator cases: owner read/write, cross-user deny on prefs + queue, optional note, userId-spoof deny, listingId/path-mismatch deny, compareQueue cap-of-4 deny). Schema/repo covered by `tests/listing-preferences.test.ts`; rules shape asserted by `tests/firestore-rules-structure.test.ts`.

Suggested verification:

- `npm run test:rules` (Firestore emulator + Java); `npm run verify` for the standard gate.

## Workstream 5: RealtyAPI And Search Provider Adapters

Goal: Add real provider ports for structured listing fetches and permitted public enrichment, with key rotation and quota accounting.

Depends on:

- [ ] WS3 contracts and env validation.

Enables:

- [ ] WS6 baseline backfill and WS8 daily refresh.

Primary areas:

- `lib/providers/realty-api.ts`, `lib/providers/google-search.ts`, `lib/providers/types.ts`, `lib/providers/errors.ts`, `lib/providers/quota.ts`, `types/provider-quota.ts`, `lib/schemas/provider-quota.ts`, `lib/repositories/provider-quota.ts`, `.env.example`, `docs/operations/provider-ingestion.md`

Implementation tasks:

- [x] Implement RealtyAPI adapter for active listings within radius/ZIP criteria (`lib/providers/realty-api.ts`, `/search/bylocation` pagination).
- [x] Accept comma-separated `REALTY_API_KEYS` (and `rt_` aliases) and rotate by run/key alias without logging values. Rotation is deterministic; key values never enter logs, errors, or stats (asserted by `tests/realty-key-rotation.test.ts`).
- [x] **Fixed quota accounting to MONTHLY (no shim).** RealtyAPI free is **250 req/MONTH per key** (verified against the realtyapi.io pricing page 2026-06-09 — monthly, not daily). Implemented `ProviderQuotaMonth` (`types/provider-quota.ts`), a handwritten validator (`lib/schemas/provider-quota.ts`), and a Firestore-backed `lib/repositories/provider-quota.ts` (`MonthlyQuotaStore`) that PERSISTS per-key monthly usage to `provider_quota/{YYYY-MM}` via the Admin SDK (transactional reserve) and refuses to spend past the per-key ceiling (~2,000/month over 8 keys). The adapter reserves against this durable store before each live call; the in-memory `QuotaTracker` remains only a per-run rotation fast path (renamed off "daily"; `DEFAULT_DAILY_QUOTA_PER_KEY` kept as a deprecated alias of `REALTY_API_MONTHLY_QUOTA_PER_KEY`). Injection seam (`MonthlyQuotaStore` + `createInMemoryMonthlyQuotaStore`) makes it unit-testable with no live Firestore/RealtyAPI.
- [x] Normalize RealtyAPI records into the listing schema with source provenance and `media[]` (`normalizeRealtyApiListing`).
- [x] **Composite dedupe key (reconciled).** `buildDedupeKey` now folds normalized address + locality + rounded coordinates + canonical source URL (`realtyapi:addr=...|geo=...|url=...`), collapsing the same physical home even under a re-issued provider id; falls back to `realtyapi:id=<id>` only for sparse payloads. This resolves the WS6 finding that the key was provider-id-only. Doc + tests updated to agree.
- [x] Implement public search enrichment adapter behind `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID` (`lib/providers/google-search.ts`, Custom Search JSON API; endpoint/quota verified 2026-06-09). Fills only missing non-authoritative fields, ALWAYS returns source URLs/citations, never invents data, clear no-op when envs absent. Behind the port; not called from UI.
- [x] Add provider error classes for rate limit, auth, provider outage, malformed payload, no-results (and quota-exhausted) — RealtyAPI + Google-search variants in `lib/providers/errors.ts`, used by both adapters.
- [x] Document provider setup and expected envs (`docs/operations/provider-ingestion.md`, `.env.example`).

Exit criteria:

- [x] Provider calls are isolated from UI and Firestore write code (ports under `lib/providers/`; UI never imports them).
- [x] Key rotation is deterministic and inspectable without exposing keys (verified by `tests/realty-key-rotation.test.ts` incl. a no-key-leakage assertion).
- [x] Quota exhaustion degrades to partial run results, not silent failure (`ProviderFetchStats.partial`; PARTIAL on monthly-budget exhaustion).

Re-run findings (WS5, 2026-06-09) — surface was scaffolded but the flagged monthly-quota bug, the composite dedupe reconciliation, and the Google-search adapter were outstanding; all closed:

- [x] Monthly quota is now durable (Firestore `provider_quota/{YYYY-MM}`) and enforced before each live call, with an in-memory injection seam for tests. The "daily" mislabel is gone.
- [x] Composite dedupe implemented in the adapter (the principled option); the WS6 provider-id-only finding is resolved and the ops doc + idempotency tests now reflect the composite key.
- [x] `lib/providers/google-search.ts` added (citation-bearing, env-gated no-op, behind the port). Error taxonomy extended with Google-search variants.
- [x] Test count: gate moved from 51 → 72 (added `provider-quota`, `realty-key-rotation`, `google-search`, `provider-errors`; updated `backfill-idempotency`, `backfill-run`, `schemas` for the new dedupe key + `partial` stat). No live RealtyAPI/Google calls in any test.

Pass 2 audit (WS5 re-run, 2026-06-09) — independent re-audit of the feature-heavy pass-1 surface; one real durable-budget integrity gap closed, the rest verified quiet:

- [x] **Quota-document validator hardened** (`lib/schemas/provider-quota.ts`). `provider_quota/{YYYY-MM}` is the durable budget authority, but the pass-1 validator accepted internally-inconsistent docs: fractional/NaN call counts, a per-key count ABOVE the monthly ceiling (i.e. the reserve gate having been bypassed), and a `totalSpent` that disagreed with `sum(perKey)`. The validator now requires non-negative **integer** counts, enforces `perKey[alias] <= monthlyLimitPerKey`, and rejects any `totalSpent !== sum(perKey)`. A corrupt durable doc now fails closed (the Firestore store's `read()` returns `null` → the reserve transaction rebuilds from a clean base) instead of silently trusting bad accounting. Added 2 validator tests (gate 72 → 74).
- [x] **Re-verified the rest of the lane against the live code, no churn applied:** the durable reserve is a real Firestore transaction (atomic read-modify-write; concurrent invocations cannot both slip past the ceiling); the in-memory `QuotaTracker` is only a per-run rotation hint and cannot let spend exceed the durable budget (every live call reserves durably first, and a key the durable store refuses is marked locally exhausted + rotated past, never retried forever); key rotation is deterministic and the adapter never logs/serializes key values (asserted by `realty-key-rotation`); the durable injection seam (`createInMemoryMonthlyQuotaStore`) keeps every test off live Firestore/RealtyAPI; `google-search.ts` uses the correct Custom Search JSON API endpoint/params, always returns citations, never fabricates fields, no-ops cleanly when envs are absent, and is not imported by any UI component (grepped); the composite `buildDedupeKey` is stable/deterministic and agrees with what `lib/ingest/backfill.ts` + `upsertListing` rely on (composite dedupeKey collapses re-issued provider ids onto the existing doc id, so WS6 idempotency holds); the error taxonomy maps every failure path to a distinct class with no bare throws leaking provider internals/keys.

Suggested verification:

- `npm run verify` (lint, typecheck, format:check, 74 tests, build); adapter tests with sanitized fixtures. **Operator-pending:** live smoke with one low-limit key only after env is present (RealtyAPI credentials/quota); Google-search live smoke once `GOOGLE_SEARCH_*` envs are set.

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

- [x] Define radius center for ZIP `44224` and radius `10` miles (`lib/ingest/constants.ts`).
- [x] Fetch active listings from RealtyAPI across available accounts/keys until complete or quotas are safely exhausted (~88 listings ingested; not all keys burned).
- [x] Dedupe by a **composite** key (normalized address + locality + rounded coordinates + canonical source URL: `realtyapi:addr=...|geo=...|url=...`), deterministic and stable across runs, with a `realtyapi:id=<id>` fallback for sparse payloads — built by `buildDedupeKey` in `lib/providers/realty-api.ts` (WS5) and verified by `tests/backfill-idempotency.test.ts`. **Resolved 2026-06-09 by WS5** (was provider-id-only); the composite collapses the same physical home even under a re-issued provider id.
- [x] Persist listings with source provenance (`sourceProvider`, `sourceUrl`, `sourceListingId`, `ingestedAt`, `media[]`, `rawHash`, `dedupeKey`, `radiusCenter`, `distanceMiles`, `provenance`), media URLs, timestamps, and raw hash. Real media only — no stock/placeholder path.
- [x] Record a baseline run document via the runs repo with counts, key aliases used, quota used, and errors.
- [x] Add an operator script that can run locally (`npm run backfill`, `--env-file=.env`) and a protected API route for hosted trigger (`POST /api/ingest/backfill`, `INGEST_JOB_TOKEN`-gated).
- [ ] Verify the dashboard renders baseline records without static fallbacks (re-verify after WS11/WS12/WS13 land).

Re-run findings (WS6 re-run, 2026-06-09) — backfill was functional but not production-shaped on run lifecycle and dry-run cost safety; gaps closed:

- [x] **Orphaned `running` run fixed** (`lib/ingest/backfill.ts`): a thrown fetch/upsert error previously left the `ingest_runs` record stuck in `running` forever. The fetch+upsert is now wrapped so any throw closes the run as `failed` (best-effort status write) and the result carries `status`.
- [x] **Dry-run is now truly side-effect-free** (`lib/ingest/backfill.ts`, `scripts/backfill-44224.ts`): `--dry-run` previously still called `fetchAllActiveListings`, spending the scarce ~250/MONTH RealtyAPI budget just to preview. Dry-run now validates env + run wiring, writes nothing, and makes **no live provider calls**; the script logs this and returns `status: "completed"` with zero counts. The script exits non-zero only when `status === "failed"`.
- [x] **Idempotency/dedupe tests added** (`tests/backfill-idempotency.test.ts`, sanitized fixtures, no live calls): dedupeKey + doc-id determinism across runs, independence from timestamp/alias/runId, in-batch collapse of repeated `listing_id`, `property_id` fallback, `rawHash` change-detection, and the full persisted provenance set. (Run-lifecycle coverage added in pass 2; see below — gate now 49 tests.)
- [x] **Durable ops doc created** (`docs/operations/provider-ingestion.md`, indexed in `docs/README.md`): provenance, idempotency/dedupe, dry-run + token-gated run, and cost posture.
- [x] **WS5 finding — RESOLVED 2026-06-09 (in WS5):** the dedupe key is now a composite (normalized address + coordinates + canonical source URL, `buildDedupeKey` in `lib/providers/realty-api.ts`), and `lib/providers/quota.ts` is no longer mislabeled "daily" — monthly accounting is persisted in Firestore `provider_quota/{YYYY-MM}` (`lib/repositories/provider-quota.ts`) and enforced before each live call. See the WS5 section.

Pass 2 audit (WS6 re-run, 2026-06-09) — independent re-audit of the full WS6 lane; one real coverage gap closed, the rest verified quiet:

- [x] **Run-lifecycle + dry-run guarantees were untested at the function level** — pass 1's idempotency tests only exercised the normalization layer (`normalizeRealtyApiListing`/`hashRawPayload`), so the dry-run cost-safety guard and the "never left `running`" run-closure logic could have regressed silently. Made `runBackfill44224` testable by adding a backward-compatible `BackfillOptions.deps` injection seam (defaults to the real env/provider/repository implementations; no behavior change in production). Added `tests/backfill-run.test.ts` (5 cases, injected in-memory fakes, **zero** live RealtyAPI calls / **zero** Firestore writes): dry-run constructs no client and performs no fetch/upsert/run-record write; success closes the run `completed`; fetch+upsert errors with zero upserts close it `failed`; a thrown provider error opens then closes the run (never left `running`); a mixed result closes it `partial`. Gate now 49 tests.
- [x] Re-verified the route/script/doc surface against the live code: `app/api/ingest/backfill/route.ts` is `INGEST_JOB_TOKEN`-gated via `lib/ingest/auth.ts` (503 when unconfigured, 401 unauthorized, constant-time compare) before any work runs; `scripts/backfill-44224.ts` exits non-zero only on `status === "failed"` and logs the no-live-calls dry-run posture; `docs/operations/provider-ingestion.md` is accurate and secret-free. No churn applied to already-correct code.

Exit criteria:

- [x] Re-running the backfill updates existing records idempotently (deterministic dedupeKey + stable doc id; verified by `tests/backfill-idempotency.test.ts`).
- [!] Firestore contains real current active listings for the target radius (~88 previously confirmed). **Operator-pending** — live readback needs RealtyAPI credentials/quota; re-confirm via `npm run backfill` then a Firestore count + sample-record provenance audit.
- [!] Every listing has source provenance and no stock/fake media. Code guarantees full provenance + real-media-only on every write; **live readback operator-pending** (same credential gate).

Suggested verification:

- `npm run backfill -- --dry-run` (env + wiring smoke, zero writes, zero provider calls); `npm run test` (idempotency + normalization, no live calls). Operator-pending: real `npm run backfill` + Firestore readback count and sample-record provenance audit.

## Workstream 7: Email-Triggered Ingestion Pipeline (Primary Flow) + Multiselect Filter

Goal: A new realtor-alert email in `jamienavinhill@gmail.com` triggers the full pipeline automatically and near-real-time — no manual scan — enriching each listing from free lanes before it lands in Firestore.

Depends on:

- [x] WS2 server envs, WS3 contracts, WS9 toasts, WS5 provider adapters; OAuth scopes already in `dashboard.tsx`.

Enables:

- [ ] WS8 alert evaluation/refresh, WS17 verification.

Primary areas:

- `app/api/gmail/push/route.ts` (Pub/Sub push handler), `app/api/gmail/watch/route.ts` (register/renew `watch`), `app/api/gmail/connect/route.ts` (encrypted refresh-token persist), `app/api/gmail/scan/route.ts` (manual scan on the same pipeline)
- `lib/gmail/` (`client.ts` message fetch + OAuth access-token mint, `platforms.ts` query builder, `pubsub-push.ts` OIDC verifier)
- `lib/ingest/pipeline.ts` + `email-pipeline-runner.ts` + `email-normalize.ts` (extract → enrich → gate → validate → upsert → evaluate → notify)
- `lib/enrich/` (Gemini extractor, free web-search enrichment, RealtyAPI property-detail gate), `lib/crypto/token-cipher.ts` (AES-256-GCM)
- Firestore: `users/{uid}/gmailSync` (historyId, watch expiry, emailAddress→uid map), encrypted refresh token; server-only rules deny
- `components/dashboard.tsx` ingest tab; `components/views/IngestPlatformSelector.tsx`; `components/views/AlertsWizardView`

Implementation tasks:

- [x] Persist the Google refresh token securely after sign-in (server route `app/api/gmail/connect/route.ts`, AES-256-GCM via `lib/crypto/token-cipher.ts` with `TOKEN_ENCRYPTION_KEY`, user-scoped in `users/{uid}/gmailSync.refreshTokenEnc`) so the pipeline runs without a browser session. The Firebase ID token authenticates the caller; the server exchanges the one-time GIS `serverAuthCode` for the refresh token (never trusts a client uid; never returns the token).
- [x] **Gmail `watch` registration** → Cloud Pub/Sub topic; store `historyId` + watch expiry (`app/api/gmail/watch/route.ts`, `INGEST_JOB_TOKEN`-gated, single-uid or all connected mailboxes). Push notifications hit `app/api/gmail/push/route.ts`, which verifies the Pub/Sub **OIDC JWT** (issuer `accounts.google.com`, service-account `email`/`email_verified`, signature via google-auth-library) plus a defense-in-depth shared `?token=` secret. Verified against official Pub/Sub + Gmail-push docs (2026-06-09).
- [x] On push: decode `{ emailAddress, historyId }`, map `emailAddress → uid`, fetch new messages since the stored `historyId` (filtered to the platform query); for each, run the pipeline. Idempotent: ACKs (2xx) even on "no mailbox"/processing error so Pub/Sub stops hot-redelivery; the historyId watermark only advances on success.
- [x] **Pipeline (`lib/ingest/pipeline.ts`)**: Gemini structured extract from the email → normalize (provenance + dedupe + dated history entry) → free-lane enrich (Google-search port, cited) → RealtyAPI `property-detail` GATE (only on an authoritative gap, within monthly budget, persisting `realtyApiDetailFetchedAt` so it never re-spends; derives `imageUrl` from provider media) → validate (WS3 schema) → upsert (dedupe-aware) → evaluate saved alerts → persist matches → notifier hook. `IngestRun.type = "email"`. Note: a `RealtyDetailPort` is wired only once an authoritative property-detail endpoint exists (WS8 owns RealtyAPI spend); free-lane enrichment always runs.
- [x] Query composer from selected platforms + optional custom string, with live preview (`components/views/IngestPlatformSelector.tsx`); multiselect with the five baseline platforms + extensions; selection persisted to `users/{uid}/gmailSync` via `/api/gmail/connect`.
- [x] Manual "Scan Gmail" advanced action: `/api/gmail/scan` runs the SAME server-side pipeline (query-scan mode, stored encrypted refresh token, shared provenance/dedupe/enrichment) and is the programmatic fallback used by the WS8 safety-net poll. NOTE (reconciled 2026-06-09): the dashboard's in-tab "Scan Gmail" button still uses the legacy client-token `parse_gmail` **preview-and-commit** path (`/api/properties`) so the user reviews harvested rows before any shared-catalog write — a deliberate WS11/WS15 UX. The two coexist; the server pipeline at `/api/gmail/scan` is wired and tested but not yet bound to that button.
- [x] Update `AlertsWizardView` platform list to the five baseline platforms.

Exit criteria:

- [!] A real/seeded alert email triggers ingestion via Pub/Sub push with no button click; listing appears within minutes. (Code complete + unit-verified; awaits the operator dependencies below — Pub/Sub topic, OAuth consent scopes, Vercel envs — before a live push smoke.)
- [x] Each listing is enriched from free lanes first; RealtyAPI is touched only when justified, within monthly budget, and never re-spent (persisted `realtyApiDetailFetchedAt` guard). Unit-verified by `tests/realty-detail-gate.test.ts` + `tests/email-pipeline.test.ts` (idempotent re-run does not re-spend).
- [x] Provenance + dedupe preserved (`tests/email-pipeline.test.ts`); selecting Redfin + Zillow generates the correct composed query (`tests/gmail-query-builder.test.ts`).

WS7 verification (2026-06-09): `npm run verify` green — lint, typecheck, format:check, **105 tests**, build. New WS7 tests: `tests/gmail-query-builder.test.ts`, `tests/token-cipher.test.ts` (AES-GCM round-trip + tamper/wrong-key rejection), `tests/realty-detail-gate.test.ts`, `tests/gmail-push-auth.test.ts` (forged/absent/wrong-issuer/wrong-SA token rejection, shared-secret pre-filter), `tests/email-pipeline.test.ts` (happy path + no-listing + idempotent no-re-spend). No live Gmail/Pub/Sub/RealtyAPI/Gemini calls — all ports injected with fakes.

WS7 hardening pass 2 (2026-06-09, fresh context) — three real fixes; `npm run verify` (105 tests) + `npm run test:rules` (8 tests) both green:

- [x] **Watermark no longer advances on message loss (no-message-loss invariant enforced).** `lib/ingest/email-pipeline-runner.ts` previously advanced the `historyId` watermark unconditionally at the end of every run, contradicting the documented "advances only on success" invariant — a transient Gmail fetch/process error would have skipped the missed message on the next push (silent message loss). Fixed: the runner now tracks `messagesLost` (messages whose fetch/process threw) and advances `historyId` ONLY when `messagesLost === 0`; otherwise it records `lastProcessedAt` as a heartbeat but leaves `historyId` unchanged so the next `listHistory` replays from the same point. Validation skips (deterministic) and best-effort enrichment errors do NOT hold the watermark (they would otherwise cause infinite Pub/Sub redelivery). `newHistoryId` is reported to callers only when actually committed.
- [x] **Push handler fails closed when the OIDC service-account env is missing.** `app/api/gmail/push/route.ts` passed `expectedServiceAccountEmail: env.pubsubServiceAccountEmail` straight through; with `PUBSUB_SERVICE_ACCOUNT_EMAIL` unset the verifier checks only issuer + signature, so ANY Google-signed OIDC token would pass and the shared `?token=` secret becomes the sole gate (which the Locked Decision forbids). The route now returns 503 with no processing when `PUBSUB_SERVICE_ACCOUNT_EMAIL` is unset, rather than silently weakening auth. (Confirms the operator-pending env below is load-bearing, not optional.)
- [x] **`gmailSync` server-only rule now has an emulator test.** Added a `tests/emulator/firestore-rules-emulator.test.ts` case asserting the OWNER's own authenticated client is denied BOTH read and write on `users/{uid}/gmailSync/main` (the encrypted refresh token never reaches the browser; Admin SDK only). Green under `npm run test:rules` (now 8 rules tests).

Audited solid, no churn: AES-256-GCM token cipher (random IV/encrypt, auth-tag verified on decrypt, 32-byte key validation, tamper/wrong-key rejection — `tests/token-cipher.test.ts`); OIDC push verifier (issuer/SA-email/email_verified/signature + constant-time shared-secret pre-filter — `tests/gmail-push-auth.test.ts`); idempotent persisted-enrichment RealtyAPI gate (no re-spend even when detail supplies media — `tests/email-pipeline.test.ts` + `tests/realty-detail-gate.test.ts`); query composer (Redfin+Zillow → correct OR query — `tests/gmail-query-builder.test.ts`); `IngestRun.type="email"`; no plaintext refresh token logged or returned.

Operator dependencies (`[!]` — real external setup, NOT faked):

- [!] Create the Cloud Pub/Sub topic and grant `gmail-api-push@system.gserviceaccount.com` the Pub/Sub Publisher role on it; create the push subscription pointed at `https://<app>/api/gmail/push?token=<PUBSUB_PUSH_TOKEN>` with the OIDC service account.
- [!] Set Vercel envs: `TOKEN_ENCRYPTION_KEY` (base64 32-byte), `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_PUBSUB_TOPIC`, `PUBSUB_PUSH_TOKEN`, `PUBSUB_SERVICE_ACCOUNT_EMAIL` (names added to `.env.example`).
- [!] OAuth consent-screen scopes `gmail.readonly` + `gmail.send` and app verification; client must request offline access (`access_type=offline`, `prompt=consent`) to yield a refresh token at `/api/gmail/connect`.
- [!] Live Gmail-push smoke against the operator account once the above are in place (WS8 owns the weekly re-watch + business-hours poll Actions that call `/api/gmail/watch`).

Suggested verification:

- Live Gmail push smoke with the operator account; Firestore readback of the new enriched listing; unit tests for the query builder + RealtyAPI enrichment gate + token cipher + push auth + pipeline happy-path (all green); browser selection smoke.

## Workstream 8: Watch Renewal, Safety-Net Poll, And Alert Data Flow

Goal: Keep the email pipeline alive (renew the Gmail `watch`), backstop it with a business-hours poll, periodically refresh the zone, evaluate saved alerts, and persist actionable matches — all without a browser session and within budget.

Depends on:

- [x] WS3 contracts/repositories, WS5 provider adapters, WS6 baseline, WS9 toasts.

Enables:

- [x] Reliable production monitoring and WS15 alert read paths.

Primary areas:

- `lib/ingest/daily-refresh.ts`, `app/api/ingest/daily/route.ts`, `app/api/gmail/watch/route.ts`, `.github/workflows/gmail-rewatch.yml` + `.github/workflows/ingest-poll.yml` (free public-repo Actions — NOT deploy crons), `config/firebase/firestore.rules`, `types/listings.ts`

Implementation tasks:

- [x] Protected routes require `INGEST_JOB_TOKEN` (token in GitHub Actions secret, server-side only). Both `app/api/ingest/daily/route.ts` and `app/api/gmail/watch/route.ts` gate on `INGEST_JOB_TOKEN` via the shared constant-time `validateIngestToken` (`lib/ingest/auth.ts`): 503 when the token is not configured, 401 on missing/wrong token (Bearer or `x-ingest-token`).
- [x] **Weekly Gmail `watch` re-registration** Action (`.github/workflows/gmail-rewatch.yml`): `schedule: "17 6 * * 1"` (Mondays, well inside Gmail's ~7-day watch expiry) + `workflow_dispatch`. Calls `POST /api/gmail/watch` with `Authorization: Bearer ${{ secrets.INGEST_JOB_TOKEN }}` against `${{ vars.INGEST_BASE_URL }}`. No secrets inline; not a deploy trigger.
- [x] **Business-hours safety-net poll** Action (`.github/workflows/ingest-poll.yml`): `schedule: "*/15 0,10-23 * * *"` (UTC; covers ET business hours across DST — hours 10–23 UTC span EDT, and the extra hour 0 UTC catches the final EST evening hour where 19:xx ET = 00:xx UTC) with a runtime `America/New_York` hour guard that runs only 06:00–19:59 ET and skips both the quiet window and the out-of-hours UTC-0 ticks. Calls `POST /api/ingest/daily?type=poll`; `concurrency` prevents overlapping polls; idempotent against the email pipeline (matches keyed by `alertId_listingId`).
- [x] Periodic zone refresh: `runDailyRefresh` fetches via the WS5 `RealtyApiClient` (which reserves against the durable monthly quota store before each live call), upserts, marks unseen RealtyAPI listings `Off Market`, and **appends a dated price/observation snapshot to each listing's `history[]`** (idempotent within a day — unchanged price/status is a no-op). Injectable deps; `dryRun` performs zero writes.
- [x] Persist alert-match records (`upsertAlertMatch`, `lib/repositories/matches.ts`) with listing id, alert id, match reason, `firstSeenAt`/`lastSeenAt`, user id; idempotent via the `alertId_listingId` doc id so retries update `lastSeenAt` rather than duplicate.
- [x] Surface matches via the toast system (WS9 — `success` toast with "Inspect lead") + a UI read path for persisted matches: `components/dashboard.tsx` subscribes to `alert_matches` (owner-scoped `onSnapshot`) and renders them with match reason, so matches are visible after sign-in, not only in-session.
- [x] Record run status on the `IngestRun` (`type` `daily`/`poll`): listings fetched/upserted/skipped, alert matches created/updated, per-run `quotaUsed` by key alias, and the running **monthly** RealtyAPI total read back from the durable `provider_quota/{YYYY-MM}` store (surfaced as `monthlyRealtyApiCalls`), plus errors.

Exit criteria:

- [x] Pipeline survives indefinitely (watch auto-renewed weekly); the business-hours poll backstops push every ~15 min during ET business hours, so no listing is missed by more than the poll interval (push remains primary; quiet 8pm–6am ET).
- [x] Refresh/alert evaluation run without a browser session (token-gated server routes + GitHub Actions); persisted matches are visible after sign-in via the owner-scoped `alert_matches` read path.
- [x] RealtyAPI monthly spend is tracked durably (transactional per-key reservation in `provider_quota/{YYYY-MM}`) and never exceeds the ~250/MONTH-per-key ceiling; the run status records the running monthly total.

Operator-pending `[!]` (record, do not fake):

- [!] Set `INGEST_JOB_TOKEN` as a GitHub Actions **secret** and `INGEST_BASE_URL` (e.g. `https://abode-alerts.vercel.app`) as a repository **variable**; confirm `INGEST_JOB_TOKEN` matches the Vercel server env.
- [!] Confirm the repo is **public** so the scheduled Actions run on free unlimited minutes.
- [!] First live re-watch + poll run (and Action-log confirmation of successful `watch` renewal + poll).

Pass-2 audit (WS8 re-run, 2026-06-09, fresh context) — independent re-verification against the live codebase. Confirmed already at spec: token-gated routes (503 unconfigured / 401 missing-or-wrong, constant-time `validateIngestToken`); both Actions use only `secrets.INGEST_JOB_TOKEN` + `vars.INGEST_BASE_URL`, fail visibly on non-2xx, `concurrency` overlap-safe, neither is a deploy trigger; `runDailyRefresh` reserves durable monthly quota per live call, appends same-day-idempotent `history[]`, marks unseen RealtyAPI listings `Off Market`, records `daily`/`poll` `IngestRun` counts/errors and the durable `monthlyRealtyApiCalls`, closes the run `failed` (never left `running`) on a thrown fetch, and dry-run writes nothing; alert matches keyed `alertId_listingId` with `firstSeenAt` preserved on retry; dashboard reads owner-scoped `alert_matches` via `onSnapshot`. One stale doc fact corrected: the poll cron is `*/15 0,10-23 * * *` (not `*/15 10-23 * * *`); the roadmap text above was reconciled to match the shipped workflow (the extra UTC hour 0 covers the EST evening hour). No code changes were required. `npm run verify` green (lint, typecheck, format:check, 116 tests, build); `npm run test:rules` run separately (Firestore emulator).

Suggested verification:

- Protected-route unauthorized request returns 401 (503 when token unconfigured); dry-run produces no writes; idempotent match (no dup on retry); monthly-budget stop closes the run PARTIAL/`failed` and records the monthly total; history append (and same-day idempotence). Covered by `tests/daily-refresh.test.ts` (injected fakes, no live calls). Action YAML validated (schedule expressions, secrets-only token, no inline secrets). `npm run verify` green (lint, typecheck, format:check, 116 tests, build).

## Workstream 9: Toast Notification System

Goal: Uniform, non-layout-shifting notifications with timeout and manual dismiss.

Depends on:

- [ ] None.

Enables:

- [ ] WS7, WS8, WS12, WS13 notifications.

Primary areas:

- `components/ui/toast.tsx` (new), `components/dashboard.tsx`, `app/layout.tsx` (portal host if needed)

Implementation tasks:

- [x] Implement a toast provider: queue, auto-dismiss (7000ms default, per-toast configurable via `duration`, `0` = sticky), manual close (`X` button), max-visible stack of 3 with overflow queued, and `success`/`info`/`error` variants. (`components/ui/toast.tsx`) Visible + queued toasts live in a single state array sliced to `MAX_VISIBLE`, so `toast()` is a pure append (no side-effects inside the state updater) and React Strict Mode's double-invoked updater can neither duplicate nor drop a toast on rapid bursts; per-toast auto-dismiss timers run only while a toast is visible and are cleared on dismiss/unmount.
- [x] Position fixed (`bottom-4 right-4`), `z-50`, rendered via a React portal into `document.body`; container is `pointer-events-none` with each toast `pointer-events-auto`. Zero impact on `main` layout or scrollbar gutter (browser smoke confirms identical header/main boxes and unchanged document width).
- [x] Remove the `#alert-toast` banner and the `logMessage` strip entirely. (Both deleted from `components/dashboard.tsx`; `recentMatch`/`logMessage` state removed.)
- [x] Wire the alert-match check (and all workspace action confirmations/errors: Gmail harvest, direct parse, commit, Sheets export, Calendar booking, alert create/delete, property delete, auth) to `toast(...)` instead of the banner/log strip. Alert matches raise a `success` toast with an "Inspect lead" action.

Accessibility & integration notes:

- [x] Each toast renders `role="status"` (info/success, implicit `aria-live="polite"`) or `role="alert"` (error, implicit `aria-live="assertive"`); close button is labelled "Dismiss notification". The portal container is a labelled `role="region"` (`aria-label="Notifications"`), not a live region, so toasts are not double-announced by nested live regions. Auto-dismiss pauses on hover/focus and resumes (not restarts) on leave/blur; entry animation is gated behind `prefers-reduced-motion`.
- [x] `ToastProvider` mounted once in `app/layout.tsx` (wraps all routes). Reuses existing Tailwind/`primary-*` tokens; no one-off styles.
- [x] Non-React entry point: provider listens for a `window` `abode:toast` CustomEvent (`detail = ToastOptions`) so server/global handlers (and the smoke) can raise toasts without React context. Not a test-only hook.

Exit criteria:

- [x] Playwright asserts no layout shift when a toast appears (header + main/listings bounding boxes and document width unchanged). (`scripts/browser-toast-noshift-check.ts` — local run 2026-06-09: header `{0,0,1280,65}` unchanged, main `{0,0,1280,15457}` unchanged, scrollWidth 1280→1280: PASS.)
- [x] Toasts auto-time out and can be manually closed. (Smoke: auto-timeout PASS, manual close PASS.)

Suggested verification:

- `scripts/browser-toast-noshift-check.ts` (no credentials; runs against `npm run dev` or `SMOKE_URL`). Local run 2026-06-09 (WS9 pass 2, post-refactor) — all 5 assertions PASS (header/main boxes and document width unchanged, auto-timeout PASS, manual close PASS). `npm run verify` green (lint, typecheck, format:check, 74 tests, build).

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
- [x] `GoogleSignInButton`: glyph + "Sign in" label only (not "Sign in with Google"). The component now hardcodes the "Sign in" label (no `label` prop).
- [x] Signed-out: sign-in button only, no avatar. Signed-in: avatar only, no standalone sign-in/sign-out in the header bar. Sign-in and avatar are mutually exclusive (header renders `ProfileMenu` when `user`, else `GoogleSignInButton`).
- [x] Profile dropdown on avatar click: user name (+ email when distinct) + Sign out; removed the header logout button. Menu is keyboard-closable (Escape) and click-outside-to-close, with `role="menu"`/`menuitem` and `aria-haspopup`/`aria-expanded`.
- [x] Remove the "Connect Google" secondary header button. Workspace reconnect already lives in the Ingest tab ("Authorize Google Services" when no `accessToken`); no duplicate header control remains.
- [x] ThemeControls: collapsed to an accent-tinted palette icon only; the native color input is hidden (`opacity-0`, `pointer-events-none`, `tabIndex=-1`, `aria-hidden`) and triggered by clicking the icon button; the duplicate visible swatch was removed. The `Palette` glyph is tinted with the current accent color and persistence (`localStorage["app-accent-color"]`) is unchanged.

Re-run findings (WS10 re-run, 2026-06-09) — baseline was marked `[x]` but did not meet the User Requirements I spec; brought to full exit criteria:

- [x] `components/dashboard.tsx`: header chrome rebuilt to the mutually-exclusive sign-in/avatar spec. Added a `ProfileMenu` (avatar trigger + dropdown with name/email + Sign out), removed the standalone header logout button and the "Connect Google" header button, and fixed the sign-in label to "Sign in". Avatar `alt`/`aria-label` decoration trimmed (menu button owns the accessible name).
- [x] `components/theme-controls.tsx`: collapsed to an icon-only accent control — palette icon tinted with the live accent, hidden native color input triggered by the icon click, duplicate swatch removed. Persistence preserved.
- [x] `scripts/browser-google-oauth-check.ts`: updated assertions to the new chrome (sign-in matched as `/^sign in$/i`, fallback-avatar selector no longer requires `[aria-label]`) and redirected the hardcoded prior-session temp dir to an OS temp path (`os.tmpdir()`), keeping ephemeral artifacts off the repo/parent paths.

Pass-2 audit (WS10 re-run, 2026-06-09, fresh context) — independent re-verification against Exit criteria + Requirements §I. Header chrome and theme controls confirmed already at spec (mutually-exclusive `GoogleSignInButton`/`ProfileMenu`, glyph + "Sign in" label, no avatar when signed out, no header sign-out, accent-tinted palette icon with hidden color input, no swatch). One residual rough edge fixed: the Gmail-harvest "token required" log message in `components/dashboard.tsx` still told users to click the removed `Connect Google Services` header button; updated to point at the in-tab `Authorize Google Services` control on the Ingest tab. No other WS10 gaps found. `npm run verify` green (lint, typecheck, format:check, 49 tests, build).

Exit criteria:

- [x] Signed-out shows no avatar; signed-in shows no sign-in/sign-out in the header bar. (Browser smoke on a clean signed-out load: exactly 1 "Sign in" button, 0 "Sign in with Google", 0 avatars, no console errors.)
- [x] Accent control is icon-only (1 palette button, exactly 1 hidden color input, no visible swatch; icon tinted `rgb(244,63,94)` = `#f43f5e`), accepts arbitrary color, and persists across refreshes via `localStorage`.

Suggested verification:

- `scripts/browser-google-oauth-check.ts` updated assertions; Playwright auth-chrome smoke (signed-out smoke run 2026-06-09 — pass). `npm run verify` green (lint, typecheck, format:check, 49 tests, build).

## Workstream 11: UI Honesty, No-Fake-Data, And Regional Defaults

Goal: Make the app honest: Firestore-only listings, no stock/listing placeholders, correct regional defaults, and clean lint/type state.

Depends on:

- [ ] Current UI implementation in `components/dashboard.tsx`, `components/theme-controls.tsx`, `components/views/ListingsGrid.tsx`.

Enables:

- [ ] Real baseline data and final copy without fake rows contaminating results.

Primary areas:

- `components/dashboard.tsx`, `components/views/ListingsGrid.tsx`, `app/globals.css`, `app/api/properties/route.ts`, `types/listings.ts`

Implementation tasks:

- [x] Remove static property baseline merging and delete the seeded property source file. (`lib/static_properties.ts` confirmed absent; dashboard reads `properties` via `onSnapshot` only.)
- [x] Change extraction prompts to return empty `imageUrl` when no real listing media exists. (`app/api/properties/route.ts` prompt: "If no real listing media URL is present, return an empty string. Never invent or substitute stock photos." Austin sample title also replaced with a Stow, OH example.)
- [x] Add no-media rendering in listing cards/modals. (`ListingsGrid.tsx` `NoListingMedia` honest state on empty `imageUrl`; verified 0 broken images across the live 88-listing render.)
- [x] Remove unused dashboard state/imports and fix all lint/type findings. (`npm run lint` clean at `--max-warnings 0`; `npm run typecheck` clean.)
- [x] Rename user-facing brand from `Realty Monitor`/`Realty` to `Abode Alerts` across UI and docs where appropriate. (Header, footer, docs view, layout metadata all "Abode Alerts"; remaining route-copy "Realty Monitor" in the Calendar event description fixed.)
- [x] Replace Austin defaults with the `44224` Stow/Akron-area defaults. (`lib/ingest/constants.ts`: `DEFAULT_ALERT_CITY="Stow"`, `DEFAULT_ALERT_STATE="OH"`, `BASELINE_ZIP="44224"`, `BASELINE_CENTER` Stow coords; consumed by `dashboard.tsx`.)
- [x] Add empty-state copy that guides baseline backfill and ingestion rather than implying filters are wrong. (`ListingsGrid.tsx` empty state distinguishes empty-inventory vs filtered, points to the 44224 backfill / Gmail ingestion.)

Pass 2 audit (WS11 re-run, 2026-06-09) — independent fresh-context re-audit of the full WS11 surface:

- [x] Fixed a remaining stale AI-Studio brand string in a SHIPPED path: `app/api/properties/route.ts` set the `GoogleGenAI` client `User-Agent` to `"aistudio-build"` (AI-Studio export boilerplate) on every server-side Gemini call. Changed to `"abode-alerts"`. No behavior change; `npm run verify` stays green (49 tests, build).
- [x] Re-ran the `rg -i unsplash|pexels|picsum|placeholder|austin|texas|\bTX\b|realty monitor|aistudio|ai studio|lorem|mock|seed|sample` sweep across `app/`, `components/`, `lib/`: after the fix, every remaining hit is legitimate — HTML `placeholder` attributes, honest CMA "no simulated/placeholder data" copy, "Stow" example placeholders, and `RealtyApiClient` adapter references. No fake data, stock media, Austin/TX default, or AI-Studio/Realty-Monitor brand string remains in a shipped path.
- [x] Confirmed `lib/static_properties.ts` absent; no shipped component builds a hardcoded `ListingProperty[]` array — listings come only from Firestore `onSnapshot`, Gmail-parsed email, or the RealtyAPI adapter.
- [x] Confirmed the extraction prompt returns an empty `imageUrl` for no media ("If no real listing media URL is present, return an empty string. Never invent or substitute stock photos.") and the no-media render is honest (`NoListingMedia` icon+label in both card and modal; `images` filters falsy URLs).
- [x] Confirmed 44224/Stow/OH regional defaults are consistent (`lib/ingest/constants.ts` → `dashboard.tsx`, `layout.tsx` metadata, footer, docs) and shipped user-facing brand is "Abode Alerts" everywhere.

Exit criteria:

- [x] Fresh Firestore with zero listings shows a truthful empty state. (`ListingsGrid` renders "No listings loaded yet" + 44224 backfill guidance when `totalPropertyCount === 0`; verified by code path.)
- [x] No runtime path imports or merges fake listing data. (`rg` for unsplash/stock hosts, static/mock/seed property arrays in shipped paths: none; the only listing arrays are populated from Firestore, Gmail-parsed email, or the RealtyAPI adapter.)

Suggested verification:

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run verify` (49/49 tests pass) all GREEN. Signed-out local browser smoke: title "Abode Alerts", no "Realty Monitor", regional Stow/44224 copy present, real Firestore listings only, zero stock/broken images.

## Workstream 12: Listing Dialog, Actions, And Grid Density

Goal: Compact floating listing dialog with actionable controls and professional typography.

Depends on:

- [x] WS4 listing preferences contract, WS9 toasts.

Enables:

- [ ] WS13 row actions reuse, WS15 page wiring. (WS13 may reuse the shared `components/ui/dialog.tsx` shell shipped here.)

Primary areas:

- `components/views/ListingsGrid.tsx`, `PropertyProfileModal`, `components/dashboard.tsx` filters (respect hidden)

Implementation tasks:

- [x] Replace the `max-w-5xl` split modal with a compact centered dialog (`max-w-lg`–`max-w-xl`), scrollable body, not a full-page takeover unless media requires it. (New focus-trapped `components/ui/dialog.tsx`; modal is now `size="lg"` = `max-w-xl`, Escape/click-outside close, aria dialog roles. Pass-2 hardening: added body scroll-lock with scrollbar-width compensation — no layout shift — and routed `onClose` through a ref so unstable inline `onClose` props no longer tear down the focus trap / steal focus on unrelated parent re-renders.)
- [x] Action bar: Interested, Not interested, Favorite, Hide, Compare, Analyze (Gemini-backed, cited/qualified — no invented facts), plus Export/Schedule fitted into the compact pattern. (Analyze calls server route `app/api/listings/analyze/route.ts`; Export/Schedule/Delete folded behind a compact toggle in the dialog footer.)
- [x] Grid cards: smaller type scale, professional dense hierarchy, remove wasteful stat blocks and decorative giant numbers. (Cards now 4-up at xl, inline bd/ba/sqft row, reuses `NoListingMedia`; per-user favorite/interested/compare badges.)
- [x] Filter toggles: show/hide hidden listings, favorites-only view (hidden excluded from default grid, recoverable). (Pure helper `lib/listings/filter.ts` + dashboard toggles; covered by `tests/listing-filter.test.ts`.)
- [x] Compare view route or dialog tab for side-by-side/tabular comparison of 2+ listings. (`components/views/CompareDialog.tsx`, opened from the listings toolbar; compare queue capped at 4 via WS4 contract with a clear toast.)

Exit criteria:

- [x] A user can favorite and hide a listing; a hidden listing disappears from the default grid and is recoverable. (Persisted to `users/{uid}/listingPreferences/{listingId}` via owner-scoped client SDK; "Show hidden" toggle recovers them. Verified by code review + `tests/listing-filter.test.ts`; live signed-in browser smoke remains operator/CI-pending — see below. Pass-2 hardening: `setState` now omits `createdAt` on merge-updates so the original creation time is preserved instead of being overwritten on every state toggle; still rules-valid because the merged resource carries the prior `createdAt`.)
- [x] Detail opens only in the compact floating dialog. (Inline breakout removed; detail is dialog-only.)

Suggested verification:

- Browser flow with signed-in user; Firestore preference readback. **Status: operator/CI-pending** — `npm run lint`/`typecheck`/`format:check`/`test` (123 tests) and `npm run build` are GREEN. The favorite→hide→recover and compact-dialog-open behavior is verified by code review and the `filterListings` unit tests; a live signed-in Firestore readback smoke still needs a real Google sign-in session.

## Workstream 13: CMA Analytics Page

Goal: Balanced analytics layout with paginated/sorted tables and additional charts grounded in real inventory.

Depends on:

- [x] WS6 baseline data; WS4 (optional row actions); WS12 dialog reuse.

Enables:

- [ ] WS15 page wiring.

Primary areas:

- `components/views/CMAView.tsx`, `components/ui/data-table.tsx` (reusable paginated table), `lib/cma/analytics.ts` (pure sort/pagination/derived-metric helpers)

Implementation tasks:

- [x] Extract a reusable `DataTable` with column sort and page size default **10**, options **20 / 30 / 100**; apply to all CMA tables. (`components/ui/data-table.tsx`; sort/pagination logic in `lib/cma/analytics.ts`.)
- [x] Reflow layout: charts row on top, table full width below (or tabbed Charts | Data); fix the awkward side-by-side chart/table. (Tabbed Charts | Data; full-width table.)
- [x] Add charts: price distribution histogram, $/sqft by type, listings by city (top N), property-type mix, status breakdown — Firestore inventory only. (All five render; honest "Not enough data" empty states; status breakdown spans full inventory.)
- [x] Replace the three oversized metric cards with compact metric chips. (Six compact chips: Active, Avg price, Median, Avg $/sqft, Low, High.)
- [x] Row click opens the listing dialog; add a compare checkbox column and drill-down/filter affordances. (Row click opens a compact drill-down reusing the shared WS12 `Dialog`; compare checkbox column wired to the WS4 compare queue, cap enforced by `useListingPreferences`.)

Exit criteria:

- [x] The ~88-listing table paginates at 10 rows default and sorts by price. (Browser smoke: default page size 10, "Page 1 of 9" across 88 listings, price column sorts.)
- [x] Layout is balanced with multiple charts; no oversized metric strips. (Charts | Data tabs; compact metric chips replace the three large cards.)

Suggested verification:

- Browser CMA smoke; unit test for sort/pagination helpers.

Verification (2026-06-09, pass 1):

- `tests/cma-analytics.test.ts` — 29 unit tests for sort (stable, asc/desc, locale-numeric), pagination (clamp/empty/short last page/large sizes), and derived metrics/chart builders (median, $/sqft honest nulls, histogram spread guard, top-N city grouping). All pass.
- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, and full `npm run test` (152 tests) green.
- Playwright CMA smoke against real Firestore inventory (88 active listings): heading + compact chips render, 11 recharts surfaces draw, Data tab defaults to 10 rows ("1–10 of 88", "Page 1 of 9"), price column sortable and reorders, no console errors. Compare column appears only when signed in (per-user WS4 queue).

Hardening (2026-06-09, pass 2):

- Audit confirmed metric/chart math, DataTable pagination clamps, compare-queue wiring (cap via `useListingPreferences`), and the WS12 `Dialog` reuse are correct and honest (no synthetic/0/NaN values; empty inventory shows the honest "not loaded" state).
- Fixed a real sort bug in `sortByAccessor`: missing values (e.g. null `$/sqft` from zero-sqft listings) were sorted by `±1` then multiplied by the direction factor, so they flipped to the TOP under descending sort. They now always sink to the bottom regardless of direction, with input order preserved among ties. (`lib/cma/analytics.ts`.)
- A11y: completed the tablist pattern — Charts/Data tabs now carry `id` + `aria-controls`, and each panel is a `role="tabpanel"` linked back via `aria-labelledby`.
- Extended `tests/cma-analytics.test.ts` with 3 sort cases (missing sinks last in asc + desc, stable among multiple missing). Suite now 32 CMA tests / 155 total. `npm run verify` green (lint, typecheck, format:check, tests, build).
- Drill-down note (carried): the CMA dialog reuses the shared WS12 `Dialog` shell but renders a slimmer, CMA-focused body. It is intentionally NOT the full `ListingsGrid` modal; sharing the full modal body would require restructuring WS12 internals beyond importing an export, so it is left as a deliberate compact drill-down.

## Workstream 14: Docs Layout And Content Expansion

Goal: Pinned TOC, independent main scroll, and richer documentation.

Depends on:

- [ ] Durable docs canon (parallel to UI streams).

Enables:

- [ ] WS17 verification.

Primary areas:

- `components/views/DocsView.tsx`, `docs/` canonical copies where durable

Implementation tasks:

- [x] Split layout: `aside` fixed height `100vh - header` (`h-[calc(100vh-64px)]`, header is `h-16`) as a self-contained `overflow-y-auto` panel; `main` `overflow-y-auto` as the sole scroll container for content anchors.
- [x] Use `scroll-mt-*` on section anchors; anchor navigation calls a programmatic `container.scrollTo` on the `main` column (not the document), so only the main column scrolls and the TOC never jumps.
- [x] Add sections: Automatic Email Ingest, Env/Vercel Setup, Listing Actions, CMA, Alerts, Operator Ingest — content grounded in live code (WS7 push/scan, WS8 daily/poll, WS12 actions, WS13 CMA) and durable docs.
- [x] Reduce decorative prose/badges (removed the "Official Guide" badge, hero `font-extrabold`, and decorative card grid); professional compact `prose-sm` typography; honest claims only (no MLS completeness, no guaranteed real-time).
- [x] Active-section TOC highlight (nice-to-have) via `IntersectionObserver` scoped to the `main` scroll container.
- [x] Pass 2: fix mount-context scroll bug. `DocsView` renders inside the dashboard's centered, padded `<main className="mx-auto max-w-7xl grow px-4 py-8 sm:px-6 lg:px-8">` with the window as the document scroll container (sticky 64px header in normal flow). The pass-1 `h-[calc(100vh-64px)]` block sat below that wrapper's `py-8`, overflowed the viewport by ~64px, and scrolled the whole window — dragging the "pinned" TOC away. Fixed within the DocsView lane: the root now cancels the wrapper's vertical padding (`-my-8`) and bleeds past its horizontal padding (responsive `-mx-4 sm:-mx-6 lg:-mx-8`) so it occupies exactly the `100vh - 64px` region under the header, keeping the inner `main` the single scroll container and the window static. Added `overflow-hidden` on the root so neither column leaks scroll to the document.
- [x] Pass 2: respect `prefers-reduced-motion` — programmatic anchor scroll uses `behavior: "auto"` when reduced motion is preferred, and the `main` carries `motion-reduce:scroll-auto` alongside `scroll-smooth`.

Exit criteria:

- [x] Clicking Quickstart scrolls main only; TOC position stays stable in the viewport. (Verified by code review: the root is pinned to `100vh - 64px` under the sticky header with `overflow-hidden`, the wrapper padding is cancelled (`-my-8`/`-mx-*`) so the block does not overflow the window, and `main` is the sole `overflow-y-auto` container scrolled via programmatic `container.scrollTo`. Live browser smoke is operator/CI-pending — the docs tab lives inside the auth-gated dashboard shell and Google OAuth is unavailable in this environment.)

Suggested verification:

- Playwright docs navigation screenshot comparison (operator/CI-pending; requires authenticated dashboard session).

## Workstream 15: Product Flows, Metadata, And Page Wiring

Goal: Wire every visible page/view to real data and final Abode Alerts copy: listings, ingest, alerts, setup, CMA, docs, and metadata.

Depends on:

- [x] WS11 UI cleanup, WS6 baseline data, WS8 alert matches, WS12 listing dialog, WS13 CMA. (All closed and consumed via their components/exports.)

Enables:

- [x] Polished production experience.

Primary areas:

- `app/layout.tsx`, `config/app/metadata.json`, `components/dashboard.tsx`, `components/views/*`, `README.md`, `docs/README.md`

Implementation tasks:

- [x] Update app metadata, title, descriptions, social metadata, and icons for Abode Alerts and the deployed domain. Done via the Next 15 App Router `metadata` export in `app/layout.tsx` (`metadataBase` = `https://abode-alerts.vercel.app`, title template, applicationName, OpenGraph, Twitter, robots), a file-based `app/icon.svg`, and a generated `app/opengraph-image.tsx` (1200×630). `config/app/metadata.json` content reconciled (name/description). Verified via served HTML head + 200s on `/icon.svg` and `/opengraph-image`.
- [x] Ensure the setup/wizard explains the one-email sign-up flow for the baseline platforms and others without embedding account credentials. `AlertsWizardView` and the in-app Docs/Quickstart describe subscribing to Zillow/Trulia/Homes.com/Redfin/realtor.com email alerts; no account credentials are collected or stored.
- [x] Wire CMA to real baseline and comparable records; hide or replace any synthetic chart values. (WS13 `CMAView` derives every figure from the Firestore inventory passed in; consumed unchanged.)
- [x] Wire the Docs view to current docs or remove in-app docs if stale. (WS14 `DocsView` reflects the live flows; consumed unchanged.)
- [x] Ensure Google Workspace flows show precise permissions and failure states. Harvester auth-required state names the OAuth requirement; ingest/scan/export/schedule all return surfaced toasts on failure; wizard now renders an honest provider-error state instead of an undefined response.
- [x] Add loading, empty, partial-data, and provider-error states across views. Listings (empty inventory vs filtered-empty), harvester (auth-required, loading, empty buffer, no-media preview), wizard (loading / provider-error / empty / result), alerts (signed-out, no-alerts, no-matches, listing-pending), CMA + Docs (closed streams) all carry honest states.

Exit criteria:

- [x] No page depends on fake data or obsolete AI Studio copy. Removed "0% hallucinatory metrics" / "Sourced Listings Inbox Buffer" copy and the `// Simulate generation` path; fixed `text-white`-on-white headings that were illegible in light mode and the residual `animate-bounce` alert icon.
- [x] Metadata and user-facing copy match Abode Alerts and the deployed domain.
- [x] Every visible action has an end-to-end data path or is removed until it does. Scan Gmail (`parse_gmail`), direct parse (`parse_raw_text`), commit (`setDoc` properties), export (`export_sheets`), schedule (`create_calendar_event`), analyze (`/api/listings/analyze`), and the wizard guide (`/api/gemini`) are all wired to real routes.

Suggested verification:

- `npm run lint`, `npm run typecheck`; browser smoke across every tab.

## Workstream 16: Auth, Firestore Rules, And Secret Hardening

Goal: Lock down user-owned data, operator-only ingestion, listing preferences, and OAuth/provider secrets before production growth.

Depends on:

- [ ] WS3 final collection model, WS4 preferences model, WS7/WS8 scheduled routes.

Enables:

- [ ] Production launch confidence and safe multi-user usage.

Primary areas:

- `config/firebase/firestore.rules`, `lib/firebase.ts`, `app/api/*`, `docs/architecture/auth-and-secrets.md`, `docs/operations/development-workflow.md`

Implementation tasks:

- [ ] Audit `config/firebase/firestore.rules` for listings read access, user alert ownership, alert-match ownership, listing-preference own-only access, and admin/operator writes.
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
- [ ] Production runbook: sign-in → profile-menu sign-out; ~88 listings with compact dialog + one action; toast on simulated alert match without layout shift; docs TOC pinned; CMA pagination; protected ingest route returns 401 without token / 200 with token.

Exit criteria:

- [ ] `npm run verify` is the reliable local release gate.
- [ ] CI runs equivalent gates once a GitHub repo exists.
- [ ] The production smoke checklist is documented, repeatable, and passes.

Suggested verification:

- `npm run verify`; Playwright critical-path smokes; CI run once a repository exists.

## Workstream 18: Account Sharing & Collaboration (Invite + Roles)

Goal: A user can invite another person into their workspace by email with a **viewer** or **editor** role, so they can work on the same database together. Simple, not abstract RBAC.

Depends on:

- [ ] WS3 final collection model (the owner's data scope), WS16 rules engine.

Enables:

- [ ] Multi-user collaboration (e.g. the operator + their mother on one workspace).

Primary areas:

- `types/`, `lib/schemas/`, `lib/repositories/account-members.ts`, `config/firebase/firestore.rules`
- `components/` (invite UI in the profile menu; pending-invite acceptance)
- `app/api/` (create/accept/revoke invite)

Model (keep it simple):

- An **account** is owned by the owner `uid` (their existing data is the workspace). `accounts/{ownerUid}/members/{memberUid}` holds `{ role: "viewer" | "editor", invitedAt, acceptedAt }`. `invites/{token}` holds `{ ownerUid, email, role, status }` for pending email invites.
- **viewer** = read-only across the owner's listings, alerts, matches, preferences, profile.
- **editor** = everything the owner can do **except delete the owner's account** (and except removing the owner). Editors may add/remove other members at/below editor.
- Membership is resolved server-side and in `config/firebase/firestore.rules`; a member's `request.auth.uid` is checked against the owner's `members` subcollection.

Implementation tasks:

- [x] Define `AccountMember` / `AccountInvite` schemas and a repository with create-invite, accept-invite, list-members, change-role, revoke. (`types/sharing.ts`, `lib/schemas/sharing.ts`, `lib/repositories/account-members.ts`)
- [x] Invite flow: owner enters an email + role → invite record + (optional) email via the owner's Gmail with an accept link. Accepting (signed-in Google user) writes the membership. (`app/api/account/{invite,accept,revoke,members}/route.ts`, `lib/account/route-helpers.ts`; accept is a verified-email transaction)
- [x] Profile-menu UI: "Share workspace" → list members + roles, invite form, revoke control. Visible to owner and editors. (`components/sharing/ShareWorkspaceDialog.tsx`, ProfileMenu entry in `components/dashboard.tsx`; pending-invite acceptance at `app/invite/[token]/`)
- [x] `config/firebase/firestore.rules`: reads/writes on owner-scoped collections allow the owner and any `members` entry per role; **only the owner can delete the account**; editors cannot delete the account or demote/remove the owner. (`canReadWorkspace`/`canEditWorkspace` helpers; owner-only profile delete; invites client-write-denied)
- [x] Read paths resolve "which workspace am I viewing" (own vs. one I'm a member of) and a simple workspace switcher if the user belongs to more than one. (`lib/hooks/useWorkspaces.ts`; header switcher shown only when >1 workspace)

Exit criteria:

- [x] Owner can invite by email, choose viewer/editor, and the invitee gains exactly that access after accepting. (routes + transactional accept; rules grant viewer-read / editor-write proven in emulator)
- [x] Editor can perform all workspace actions except deleting the account; viewer is strictly read-only. (emulator: editor writes prefs/compare/alerts + members ≤ editor; viewer denied all writes; owner-only profile delete)
- [x] Rules tests prove a non-member has no access and a viewer cannot write. (`tests/emulator/sharing-rules-emulator.test.ts`, 16 cases; `npm run test:rules` 24/24)

Suggested verification:

- Firebase rules tests for owner/editor/viewer/non-member; two-account browser flow (invite → accept → edit/view); revoke removes access.

_Status 2026-06-10: built end-to-end; `npm run verify` GREEN (175 unit tests + lint/type/format/build), `npm run test:rules` GREEN (24/24 incl. 16 WS18). Two-account live browser flow is operator-pending (needs the Gmail watch/Pub-Sub + OAuth consent that also gate any shared user's account being live)._

## Workstream 19: Repository Structure & Root Hygiene

Goal: keep only tooling-required files at the repository root; give the growing set of Firebase config and other stray root files a proper home in a subdirectory; update every reference so `npm run verify`, `npm run test:rules`, `npm run build`, and the Firebase CLI all stay green. Operator preference: "only the required root files; everything else gets a proper home."

Depends on:

- [ ] WS16 final Firestore rules location/content and WS18 sharing rules (so the rules file is relocated once, after its content churn settles).

Enables:

- [x] A clean, uniform repo root for WS17 release-gate and future contributors.

Primary areas:

- Repo root, the `config/` directory, `firebase.json`, `lib/firebase.ts`, `lib/env.ts`, `tests/`, `scripts/`, `package.json` script paths, `docs/README.md` + relevant architecture/operations docs.

Constraints (verify against official tooling docs before moving anything):

- **MUST stay at root** (tool discovery is path-fixed): `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.prettierrc.mjs`, `.prettierignore`, `.gitignore`, `.env.example`, `README.md`, `AGENTS.md`, and `firebase.json` (the Firebase CLI resolves it from the working directory).
- **Moved under `config/` with reference updates**: `config/firebase/firestore.rules` (`firebase.json`, emulator tests, structure tests), `config/firebase/client-config.json` (`lib/firebase.ts`, `lib/firebase-admin.ts`, operator scripts, emulator tests), `config/firebase/blueprint.json`, and `config/app/metadata.json`. Empty untracked `mcps/` and `output/` leftovers plus the ignored `firestore-debug.log` were removed from the root. `firestore.indexes.json` is not present.
- No file moves that break a tool default, no broad path shims, no behavior change — only relocation plus exact reference updates. Each moved file's new home must be referenced from the canonical config, not duplicated.

Implementation tasks:

- [x] Inventory every root file; classify must-stay vs relocatable; confirm each relocatable file's readers via `rg`.
- [x] Create the config subdirectory and move the relocatable Firebase/config files into it.
- [x] Update `firebase.json` rules path, `lib/firebase.ts`/`lib/env.ts` imports, emulator/structure tests, scripts, and `package.json` paths; delete genuinely-unused leftovers (record why).
- [x] Update `docs/README.md` and any architecture/operations doc that names a moved path.

Exit criteria:

- [x] Repo root contains only tooling-required files (per the must-stay list) plus owned source/doc directories.
- [x] `npm run verify` and `npm run test:rules` green after the moves; the Firebase CLI still resolves rules.

Suggested verification:

- `npm run verify`; `npm run test:rules`; `git mv` history preserved; `rg` shows no dangling references to old paths.

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
- [ ] If Git exists, stage only intentional files, commit, and push according to `AGENTS.md`.
- [ ] Move the superseded "Production Shape" and "Product Polish & Automation" roadmaps under `docs/_legacy/roadmaps/` after durable docs carry ongoing rules.
- [ ] Promote permanent decisions into `docs/decisions/`.

## Acceptance Criteria

- [ ] Abode Alerts runs locally and builds for production with clean lint, type, format, and build gates; `npm run verify` passes.
- [ ] Single Vercel project `realtor` (account `jamie-navin`, `https://abode-alerts.vercel.app/`) with runtime envs set; deploys are automatic on `git push`; the protected ingest route is reachable and token-gated. No deploy cron, no second project.
- [ ] Firebase Admin initializes on Vercel serverless via inline service-account JSON; Firebase client config stays public in `config/firebase/client-config.json`.
- [ ] `REALTY_API_KEYS` contains the full key list; docs state the keys were not all exhausted for the `44224` baseline; rotation provides resilience/failover.
- [ ] Firestore contains real active listings within 10 miles of `44224` (~88), all with provenance and no invented/stock media; re-running backfill is idempotent.
- [ ] A new realtor-alert email in `jamienavinhill@gmail.com` triggers the pipeline **automatically and near-real-time** (Gmail `watch` → Pub/Sub push) — no manual scan, listing surfaced within minutes during the day; manual scan remains only as advanced fallback; automatic path preserves provenance and dedupe.
- [ ] Each new listing is **enriched generously from free lanes** (Gemini/Vertex + free web search) and from RealtyAPI property-detail **only when authoritative data is otherwise unavailable**; enrichment is persisted so no listing costs a repeat call.
- [ ] Ingest filter is a multiselect including **Zillow, Trulia, Homes.com, Redfin, realtor.com** plus extensions and an optional custom query, with a live composed-query preview.
- [ ] Refresh/poll evaluates alerts idempotently and persists alert matches viewable after sign-in without a browser session; the Gmail `watch` is auto-renewed weekly by a free public-repo Action; safety-net poll runs business hours, quiet 8pm–6am.
- [ ] **RealtyAPI spend respects the real ~2,000/MONTH budget** — `QuotaTracker` enforces monthly (not fictional daily) accounting; discovery never spends RealtyAPI; runs record per-key monthly usage.
- [ ] Google/free search enrichment stores citations and never presents inferred fields as provider-verified.
- [ ] **Account sharing works**: owner invites by email → viewer or editor; viewer is read-only; editor does everything except delete the account; non-members have no access (rules-proven).
- [ ] **$0 out-of-pocket**: Blaze + Vertex/AWS/IBM trial credits cover all compute; no billable step is enabled without explicit operator sign-off; budget alert configured.
- [ ] Toasts are uniform, dismissible, time out, surface alert/ingest/error/confirmation events, and cause zero layout shift.
- [ ] Auth chrome: "Sign in" label only when signed out (no avatar); avatar + profile menu (name, Sign out) when signed in (no header sign-in/sign-out); sign-in and avatar mutually exclusive.
- [ ] Accent control is an icon-only color picker tinted with the current accent, with arbitrary persisted color (no presets, no duplicate swatch).
- [ ] Listing detail is a compact floating dialog (no large breakout views) with professional dense typography and interested/favorite/hide/compare/analyze actions plus export/schedule; hidden listings leave the default grid and are recoverable.
- [ ] CMA tables paginate (10 default, 20/30/100) and sort; layout is balanced with multiple real-inventory charts and compact metric chips; rows open the listing dialog.
- [ ] Docs TOC is pinned; the main content column scrolls independently; content is expanded with the required sections and honest claims.
- [x] No shipped path contains fake listings, seeded baseline data, stock listing images, or prototype/MVP copy; fixtures live only under tests. (WS11 re-run 2026-06-09: audited via `rg`; honest empty/no-media states; real-Firestore-only render verified.)
- [ ] Firebase Auth/Firestore remain the baseline storage/auth stack with clear upgrade triggers and budget guardrails; rules restrict users to their own alert/match/preference docs and block unauthorized shared writes.
- [ ] Vercel production envs and Firebase authorized domains (production + local dev) are documented and verified.
- [ ] Docs and agent prompts are project-specific, current, and reusable.

## Implementation Order

1. [x] Consolidate the active roadmap under `docs/roadmaps/`.
2. [x] Install/configure linting, typecheck, formatting, verify, `.gitignore`, `.env.example` (WS1).
3. [x] Add project-specific `AGENTS.md`, `README.md`, and docs index (WS1).
4. [x] Remove static listing baseline and stock-image fallback behavior (WS11).
5. [x] Replace auth-header and accent-picker baseline behavior (WS10 baseline).
6. [x] Define `44224` radius backfill and ingest ~88 real listings with provenance (WS6).
7. [x] **WS2** — Confirm the single Vercel `realtor` project, push runtime envs via PAT, add inline Firebase Admin JSON, clean `.env`/`.env.example`. (No deploy cron — deploys are automatic on push.)
8. [x] **WS3** — Schemas, env validation, repositories, Firestore base model.
9. [x] **WS4** — User listing preferences contract + rules scaffold.
10. [x] **WS5** — RealtyAPI and Google search provider adapters (finalize).
11. [x] **WS9** — Toast system (unblocks notification UX).
12. [x] **WS10** — Auth chrome + theme density (quick, visible polish).
13. [x] **WS11** — Finish UI honesty, regional defaults, lint/type cleanup. (Re-run 2026-06-09: brand/regional/no-fake-data exit criteria met; verify GREEN 49/49.)
14. [x] **WS7** — Multiselect ingest filter + email-triggered ingestion (Gmail `watch` → Pub/Sub push pipeline + enrichment fan-out). _Built in code; live Gmail `watch`/Pub-Sub registration + OAuth verification remain operator-pending._
15. [x] **WS8** — Refresh/alert evaluation + persisted matches; weekly re-watch + business-hours safety-net poll (free public-repo Actions); monthly RealtyAPI quota accounting.
16. [x] **WS12** — Compact listing dialog + actions + grid density.
17. [x] **WS13** — CMA analytics rebuild (paginated tables + charts).
18. [x] **WS14** — Docs layout + content expansion.
19. [~] **WS15** — Wire all views/metadata to final Abode Alerts copy and data. _Pass 1 landed (`db669711`); pass-2/closeout audit not yet run._
20. [x] **WS18** — Account sharing & collaboration (invite + viewer/editor roles). _Built end-to-end: types/schemas/repository, `/api/account/*` routes, member-aware Firestore rules, ProfileMenu share UI + workspace switcher + invite-accept page; verify GREEN, rules 24/24. Live two-account browser flow operator-pending (Gmail watch/OAuth)._
21. [ ] **WS16** — Harden auth/security rules, OAuth token persistence, sharing rules, and production envs.
22. [x] **WS19** — Repository structure & root hygiene (relocate Firebase/config files; root keeps only tooling-required files). _Completed early (config/firebase relocation + deprecated-tool removal) ahead of WS16/WS18; re-confirm references after the sharing-rules churn settles._
23. [ ] **WS17** — Tests/CI/release gate and complete production smoke.
24. [ ] Promote lasting rules to durable docs and retire the two superseded roadmaps.

## Orchestrator Checkpoints

Directive: drive the ENTIRE roadmap to completion -- exhausted, verified, polished. Every workstream gets >=2 fresh-context AUDIT/EXECUTE passes, serialized on shared surfaces, gated and checkpointed. Orchestrator coordinates; subagents execute.

### Completed (re-run to production shape, two passes each, CLOSED)

| Stream           | Commits               | Result                                                                                               |
| ---------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| WS1 tooling      | `c4978d0e`,`6298b1d7` | fixed RED verify gate (react-is@19, rules-unit-testing@5, emulator test relocated); dev-workflow doc |
| WS2 env/admin    | `098209fc`,`b31ac438` | constant-time token compare, no key-leak admin init, env-and-deploy doc, auth-domain reconcile       |
| WS3 contracts    | `12b64b3c`,`323b3703` | enrichment/history/run-type contracts; provider_quota rules deny; +tests/doc                         |
| WS4 prefs        | `9ad47979`,`a4729cb5` | compareQueue path fixed (`main`); optional note; create-rule listingId==docId; `test:rules` 7/7      |
| WS6 backfill     | `59a15a8a`,`e426739a` | fixed orphaned-run + dry-run-burns-quota bugs; DI seam + idempotency/lifecycle tests                 |
| WS10 auth chrome | `d3a7a40d`,`e877b514` | "Sign in" label only, mutually-exclusive sign-in/avatar, ProfileMenu, icon-only accent picker        |
| WS11 UI honesty  | `da44fca1`,`072b172e` | removed AI-Studio/Austin/Realty-Monitor residue; honest empty/no-media states; 44224 defaults        |

### Forward streams (in progress / pending)

| Stream                                                                    | Status                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| WS5 RealtyAPI + search adapters                                           | CLOSED `2529a462`,`58c1b4ee` (persisted monthly quota; google-search adapter; composite dedupe; 74 tests)                         |
| WS9 toast system                                                          | CLOSED `55731441`,`e9699ec3` (portal toast host; banner removed; no-shift smoke 5/5)                                              |
| WS7 email-triggered ingestion + multiselect                               | CLOSED `6836b75f`,`c5fe5647` (connect/watch/push/scan routes; OIDC+AES-GCM; multiselect; 105 tests, rules 8)                      |
| WS8 refresh/alert eval + re-watch/poll + monthly quota accounting         | CLOSED `f58fd7b7`,`f605d80e` (Actions, history append, poll type, run-fail-close; 116 tests, rules 8)                             |
| WS12 compact listing dialog + actions                                     | CLOSED `295a1af2`,`79e8a05` (compact dialog shell, action bar, prefs hook, analyze route, compare, density; 123 tests)            |
| WS13 CMA analytics rebuild                                                | CLOSED `8c1beebf`,`16cff95f` (DataTable 10/20/30/100+sort, 5 charts, chips, compare col, drill-down; 155 tests, browser-verified) |
| WS14 docs layout + content                                                | CLOSED `651ac9e7`,`c1698b9b` (pinned TOC, isolated main scroll, expanded grounded content; browser-proved no window-scroll)       |
| WS15 product flows / metadata / page wiring                               | pass 1 landed (`db669711`); pass-2/closeout pending                                                                               |
| WS18 account sharing                                                      | CLOSED `829ed301` (types/schemas/repo; `/api/account/{invite,accept,revoke,members}`; member-aware rules + `canRead/EditWorkspace`; ShareWorkspaceDialog + workspace switcher + `/invite/[token]`; 175 unit + 24 rules tests). Live two-account flow operator-pending (Gmail watch/Pub-Sub + OAuth consent). |
| WS16 auth/rules/secret hardening                                          | paired with WS18 on the same firestore.rules; hardening + sharing rules land together                                             |
| WS19 repository structure & root hygiene (relocate Firebase/config files) | DONE — config/firebase relocated + deprecated tools removed (pulled forward); re-confirm refs after sharing-rules churn           |
| WS17 tests/CI/release gate + production smoke                             | pending — final gate after WS18/WS16 + WS15 closeout                                                                              |

Operator-pending (account/dashboard, cannot be done in code): run `add-auth-domains.ts` + `vercel-listings-check.ts` against prod; GCP budget alert; live 44224 re-backfill + Firestore readback; Gmail `watch`/Pub/Sub registration; OAuth consent-screen scopes/verification.

### Current Pickup State (reconciled 2026-06-10)

Reconciled against the live repo (files + git history + `config/firebase/firestore.rules`), not roadmap checkboxes. Earlier status surfaces in this file had drifted; they are corrected above.

- **Done and committed:** WS1–WS14 (two fresh-context passes each) and **WS19** (config/firebase relocation + deprecated-tool removal, pulled forward out of order).
- **Partial:** **WS15** — pass 1 landed (`db669711`); the pass-2/closeout audit has not run.
- **Not started — remaining queue:**
  1. **WS18 + WS16, built together.** They share one file (`config/firebase/firestore.rules`), so they are a single coupled effort, not sequential (this resolves the former circular "needs WS16 / needs WS18" note). WS18 introduces the `accounts/{ownerUid}/members/{memberUid}` + `invites/{token}` model and rewrites the currently owner-only `users/{uid}/*` gates (`isOwner` at `firestore.rules`) to honor membership; WS16 finalizes/hardens those rules plus OAuth token persistence and production envs. Operator decision 2026-06-10: build the **full** flow — invite/accept/revoke with **viewer and editor** roles (editor does everything except delete the account / remove the owner). The first concrete user is the operator inviting their mother as a viewer.
  2. **WS15 pass-2 closeout** — product-flow/metadata final audit.
  3. **WS17** — tests/CI/release gate + full production smoke (final gate).
- **Operator-pending (cannot be done in code), independent of the build queue:** live Gmail `watch`→Pub/Sub registration and OAuth consent-screen verification — these make the already-built automatic ingestion actually live, and are also prerequisites for any invited/shared user's account to function; plus the GCP/Firebase budget alert, a live 44224 re-backfill + Firestore readback, and `vercel env ls` + authorized-domain confirmation.

No feature code was written in this reconciliation pass — only stale status language was refreshed so the run is ready to continue.

## Expansion Track

- [ ] Provider marketplace adapters for additional real estate APIs if RealtyAPI coverage gaps remain.
- [ ] Map visualization with Google Maps only after listing coordinates and billing guardrails are verified.
- [ ] Image cache/proxy with provider-term review and Cloud Storage budget guardrails.
- [ ] Push notifications (web push / mobile) after alert-match persistence is stable.
- [ ] Side-by-side compare print/export.
- [ ] Saved-search templates per platform with deep links.
- [ ] Owner/operator dashboard for provider quota, run health, and failed-enrichment triage.
- [ ] Formal decision records for Firebase/Firestore, scheduler choice, provider adapter contracts, media caching, and OAuth token persistence.
