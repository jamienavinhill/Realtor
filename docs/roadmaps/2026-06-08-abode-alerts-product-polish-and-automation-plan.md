# Abode Alerts Product Polish And Automation Plan

Date: 2026-06-08
Status: [~] Active
Source reports: `docs/engineering/agents/orchestrator-logs/2026-06-08-production-shape-goal.md`, `docs/research/INBOX_PARSING.md`
Owner: Orchestrator + workstream agents
Surface: Next.js app (`app/`, `components/`), server routes (`app/api/`), env/ops (`lib/env.ts`, `.env.example`, Vercel), Firestore contracts (`types/`, `firestore.rules`)

## Purpose

Ship a remarkably clean, smooth, powerful Abode Alerts workspace on the correct Vercel account (`jamienavinhill`), with automatic Gmail→Gemini→Firestore ingestion as the primary flow, professional compact UI, non-shifting toast notifications, paginated analytics, pinned docs navigation, and actionable listing workflows — without scope creep beyond the user requirements captured below.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked on external setup

---

## User Requirements Inventory (Every Detail)

### A. Vercel, accounts, and environment

1. Vercel project must live on account **jamienavinhill** (not `jami.studio`).
2. Rogue deploy on `jami.studio` is removed; production target is the correct linked project.
3. Connect Firebase and all required runtime envs to Vercel via **CLI + PAT** (full operator access).
4. Clean up env template and local env naming: rename confusing vars, remove unused vars, document only what the app actually reads.
5. Clarify RealtyAPI key strategy for Vercel: comma-separated full key list vs single key (see Locked Decisions).
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
2. Manual “Scan Gmail” remains **optional**, not primary.
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

1. Remove large inline “breakout” listing views that waste space; **detail opens in a floating dialog** only.
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
2. **Sign-in button** (signed out): Google icon + label **“Sign in”** only — not “Sign in with Google”, not “Connect with Google”.
3. **Signed out state**: show sign-in control only; **no avatar**.
4. **Signed in state**: show **profile avatar only**; no standalone sign-in or sign-out buttons in the header.
5. **Profile menu** on avatar click: small clean dropdown with **user name** and **Sign out**.
6. Sign-in and profile avatar are **mutually exclusive** — never shown together.

### J. Explicit non-goals for this plan

1. Do not reintroduce mock listings, stock media, or prototype-only data paths.
2. Do not change unrelated dirty/untracked local artifacts (`.playwright-cli/`, `agent-tools/`, etc.).
3. Do not expand scope beyond items A–I unless required as a direct dependency (e.g. Firestore rules for user listing preferences).

---

## Source Findings (Audit)

| Area               | Current state                                                                                                              | Gap                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel             | App deploys; user moved to `jamienavinhill`; no `vercel.json` cron                                                         | Env wiring via CLI unverified; Firebase admin uses **file path** only (`lib/firebase-admin.ts`) — incompatible with Vercel unless JSON-in-env support is added |
| RealtyAPI keys     | `lib/env.ts` accepts `REALTY_API_KEYS` comma-list or any `rt_` env aliases; `QuotaTracker` rotates keys at 250 req/key/day | 44224 backfill (~88 listings) used minimal quota; **not all 8 keys were exhausted** — rotation is for resilience                                               |
| Gmail ingest       | `POST /api/properties` `parse_gmail` works with client bearer token; manual button in `dashboard.tsx`                      | **No automatic trigger** — no Gmail watch, no polling cron, no server-stored refresh token                                                                     |
| Notifications      | Full-width `recentMatch` banner with `animate-bounce` shifts layout                                                        | Must become fixed toasts                                                                                                                                       |
| Ingest filter      | Raw string `gmailQuery` default `subject:"Redfin" OR subject:"Zillow"...`                                                  | Needs multiselect + optional custom input                                                                                                                      |
| Alerts wizard      | Zillow/Redfin links only; Gemini generates setup guide                                                                     | Needs five baseline platforms in multiselect UX                                                                                                                |
| CMA                | One bar chart + unpaginated full inventory table + 3 large metric cards                                                    | Layout imbalance; no pagination/sort                                                                                                                           |
| Docs               | TOC `sticky` but shares scroll container behavior with anchor jumps; 2 nav sections, thin content                          | TOC/main scroll not isolated; content sparse                                                                                                                   |
| Listing modal      | `PropertyProfileModal` is large `max-w-5xl` split layout                                                                   | Must shrink to compact floating dialog; add user actions                                                                                                       |
| User listing state | No `interested` / `favorite` / `hidden` on `ListingProperty`                                                               | Needs user-scoped Firestore subcollection or preferences doc + rules                                                                                           |
| Auth chrome        | Avatar + separate Connect/Logout buttons; sign-in says “Sign in with Google”                                               | Does not match compact profile-menu spec                                                                                                                       |
| Theme              | Palette icon + separate color input swatch                                                                                 | Duplicate chrome                                                                                                                                               |

---

## Locked Decisions

1. **RealtyAPI on Vercel**: set `REALTY_API_KEYS` to the **full comma-separated list** of all `rt_` keys. The adapter rotates across keys; 44224 ingest did not burn all keys, but multiple keys provide quota headroom and failover. A single key is sufficient for minimal smoke only — not recommended for production.
2. **Firebase Admin on Vercel**: add support for inline service account JSON via a new env (e.g. `FIREBASE_SERVICE_ACCOUNT_JSON`) while keeping path-based vars for local Windows dev. Never commit JSON to the repo.
3. **Automatic email ingest**: primary implementation is **scheduled Gmail poll + incremental history** per signed-in user (server-stored OAuth refresh token encrypted in Firestore) until Gmail `watch` + Pub/Sub is justified. Manual scan becomes secondary.
4. **Toasts**: single shared toast host (portal/fixed layer), top-right or bottom-right, `pointer-events` safe, no document flow participation.
5. **Listing user actions**: store under `users/{uid}/listingPreferences/{listingId}` (or equivalent) — not on shared catalog documents.
6. **Typography**: reduce `font-extrabold` / oversized hero headings on data surfaces; align with compact dashboard density.

---

## Scope Boundaries

- Provider data remains source of truth; Gemini extracts from email text only — no invented prices or photos.
- Gmail automation requires user OAuth consent with `gmail.readonly`; refresh token storage must be documented and rules-hardened.
- CMA charts reflect Firestore inventory only; empty states stay honest.
- UI components do not call RealtyAPI directly; server routes and scripts only.

---

## Repo Guidance

- Follow `AGENTS.md`, `docs/engineering/standards/planning-style.md`, `docs/engineering/agents/orchestration-reliability.md`.
- Windows local dev; Vercel production on `jamienavinhill`.
- Verification: `npm run verify` + targeted Playwright smokes for auth, toast non-shift, listing dialog, docs TOC, CMA pagination.
- Retire prior plan to `docs/_legacy/roadmaps/` only after this plan’s acceptance criteria are met.

---

## Cross-Stream Dependency Map

```
WS1 Vercel/Env ──┬──► WS3 Automatic Gmail ingest
                 └──► WS9 Production verification

WS2 Toast system ──► WS3, WS4, WS8 (notifications)

WS5 User listing prefs contract ──► WS8 Listing dialog actions

WS1 + WS5 ──► WS9

WS6 Auth chrome ──► WS9
WS7 Docs layout ──► WS9 (parallel)
WS4 CMA ──► WS9 (parallel)
WS8 Listing UX ──► WS9
```

---

## Workstream 1: Vercel Account, Env Canon, Firebase Admin

Goal: Production on `jamienavinhill` has complete, documented runtime envs and working Firebase Admin on serverless.

Depends on: User PAT + Vercel project link (operator).

Enables: WS3, WS9.

Primary areas:

- `.env.example`, `lib/env.ts`, `lib/firebase-admin.ts`
- Vercel project settings (CLI)
- `docs/operations/` (new env deploy note)

Implementation tasks:

- [ ] `vercel link` / confirm project under `jamienavinhill`; document production URL(s).
- [ ] Push envs via CLI: `GEMINI_API_KEY`, `REALTY_API_KEYS` (all keys comma-separated), `INGEST_JOB_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON` (or approved pattern), optional search keys.
- [ ] Extend `firebase-admin.ts` to accept JSON string env when path absent (write temp file or `cert(JSON.parse(...))` directly).
- [ ] Prune/rename `.env.example`: remove dead vars; add `FIREBASE_SERVICE_ACCOUNT_JSON`; clarify local-only path vars vs Vercel JSON.
- [ ] Add `vercel.json` cron for `/api/ingest/daily` with bearer auth header pattern.
- [ ] Redeploy production; readback 88 listings on production URL.

Exit criteria:

- [ ] Protected daily ingest succeeds on production URL.
- [ ] No secrets in tracked files.

Suggested verification:

- `vercel env ls`; production listings script; POST `/api/ingest/daily` 401/200.

---

## Workstream 2: Toast Notification System

Goal: Uniform, non-layout-shifting notifications with timeout and dismiss.

Depends on: None.

Enables: WS3, WS4, WS8.

Primary areas:

- `components/ui/toast.tsx` (new), `components/dashboard.tsx`
- `app/layout.tsx` (toast portal host if needed)

Implementation tasks:

- [ ] Implement toast provider: queue, auto-dismiss (~6–8s configurable), manual close, max visible stack.
- [ ] Position fixed (e.g. `bottom-4 right-4`), `z-50`, no impact on `main` layout or scrollbar gutter.
- [ ] Remove `#alert-toast` banner and `logMessage` strip if redundant with toasts (or demote log strip to dev-only).
- [ ] Wire alert-match Firestore listener to toast instead of banner.

Exit criteria:

- [ ] Playwright asserts no layout shift when toast appears (bounding box of header/listings unchanged).

Suggested verification:

- Browser smoke + CSS/layout assertion script.

---

## Workstream 3: Automatic Gmail Ingestion (Primary Flow)

Goal: New listing emails are processed automatically without manual scan.

Depends on: WS1 (server envs), WS2 (toasts), OAuth scopes already in `dashboard.tsx`.

Enables: WS9.

Primary areas:

- `app/api/gmail/` or extend `app/api/properties/route.ts`
- `lib/gmail/` (poll, history id, query builder from multiselect)
- Firestore: `users/{uid}/gmailSync` state
- `components/dashboard.tsx` ingest tab

Implementation tasks:

- [ ] Persist Google refresh token securely after sign-in (server route, encrypted, user-scoped).
- [ ] Build query composer from multiselect platforms + optional custom string.
- [ ] Cron or Vercel scheduled function: poll new messages since `historyId` / internal date watermark.
- [ ] For each new message: Gemini structured extract → validate → upsert listing → evaluate alerts → toast user.
- [ ] Keep manual scan as secondary collapsed “Advanced” action.
- [ ] Update `AlertsWizardView` platform list to Zillow, Trulia, Homes.com, Redfin, realtor.com.

Exit criteria:

- [ ] Test email (or seeded Gmail fixture in CI mock-free integration) triggers ingest without button click.
- [ ] Provenance and dedupe preserved.

Suggested verification:

- Live Gmail smoke with operator account; readback new listing in Firestore.

---

## Workstream 4: Ingest Multiselect Filter UI

Goal: Platform multiselect + optional custom query controls the Gmail search string.

Depends on: WS3 query composer (can land UI first with manual scan, then auto).

Primary areas:

- `components/dashboard.tsx` ingest panel
- `lib/gmail/query-builder.ts` (new)

Implementation tasks:

- [ ] Multiselect dropdown component with baseline five platforms + extensions.
- [ ] Optional text input appended with AND/OR rules documented in UI helper text.
- [ ] Live preview of composed Gmail query string.
- [ ] Persist user selection in `localStorage` or Firestore user prefs.

Exit criteria:

- [ ] Selecting Redfin + Zillow generates correct `subject:"Redfin" OR subject:"Zillow"` style query.

Suggested verification:

- Unit test for query builder; browser selection smoke.

---

## Workstream 5: User Listing Preferences Contract

Goal: Per-user interested, favorite, hidden, and compare-set state in Firestore.

Depends on: None.

Enables: WS8.

Primary areas:

- `types/listings.ts`, `lib/schemas/`, `lib/repositories/listing-preferences.ts`
- `firestore.rules`

Implementation tasks:

- [ ] Define `ListingUserState`: `interested | notInterested | favorite | hidden`, timestamps.
- [ ] Repository CRUD scoped to `request.auth.uid`.
- [ ] Rules: user can read/write only own preference docs.
- [ ] Compare set: `users/{uid}/compareQueue` max N listings (e.g. 4).

Exit criteria:

- [ ] Rules unit tests or emulator tests pass.

Suggested verification:

- `npm run test`; Firebase rules validator.

---

## Workstream 6: Auth Chrome And Theme Density

Goal: Compact sign-in and profile menu per spec; accent icon only.

Depends on: None.

Primary areas:

- `components/dashboard.tsx`, `components/theme-controls.tsx`

Implementation tasks:

- [ ] `GoogleSignInButton`: glyph + “Sign in” label only.
- [ ] Signed-out: button only. Signed-in: avatar only.
- [ ] Profile dropdown: name + Sign out; remove header logout button.
- [ ] Remove “Connect Google” secondary button from header (workspace reconnect moves inside profile menu or ingest tab if still needed).
- [ ] ThemeControls: palette icon tinted with accent; hidden native color input triggered by icon click.

Exit criteria:

- [ ] Playwright: signed-out shows no avatar; signed-in shows no sign-in/sign-out in header bar.

Suggested verification:

- `scripts/browser-google-oauth-check.ts` updated assertions.

---

## Workstream 7: Docs Layout And Content Expansion

Goal: Pinned TOC, independent main scroll, richer documentation.

Depends on: None.

Primary areas:

- `components/views/DocsView.tsx`
- `docs/` canonical copies where durable

Implementation tasks:

- [ ] Split layout: `aside` fixed height `100vh - header` with `overflow-hidden`; inner TOC `overflow-y-auto` optional; `main` `overflow-y-auto` sole scroll container for content anchors.
- [ ] Use `scroll-margin-top` on headings; prevent TOC jump on anchor navigation.
- [ ] Add sections: Automatic Email Ingest, Env/Vercel Setup, Listing Actions, CMA, Alerts, Operator Ingest.
- [ ] Reduce decorative prose badges; professional compact doc typography.

Exit criteria:

- [ ] Clicking Quickstart scrolls main only; TOC position stable in viewport.

Suggested verification:

- Playwright docs navigation screenshot comparison.

---

## Workstream 8: Listing Dialog, Actions, And Grid Density

Goal: Compact floating listing dialog with actionable controls; professional typography.

Depends on: WS5, WS2.

Primary areas:

- `components/views/ListingsGrid.tsx`
- `components/dashboard.tsx` filters (respect hidden)

Implementation tasks:

- [ ] Replace `max-w-5xl` split modal with compact centered dialog (`max-w-lg`–`max-w-xl`), scrollable body.
- [ ] Action bar: Interested, Not interested, Favorite, Hide, Compare, Analyze, Export, Schedule.
- [ ] Grid cards: smaller type scale, remove wasteful stat blocks where redundant.
- [ ] Filter toggles: show/hide hidden, favorites-only view.
- [ ] Compare view route or dialog tab.

Exit criteria:

- [ ] User can favorite and hide a listing; hidden listing disappears from default grid.

Suggested verification:

- Browser flow with signed-in user; Firestore preference readback.

---

## Workstream 9: CMA Analytics Page

Goal: Balanced analytics layout with paginated/sorted tables and additional charts.

Depends on: WS5 (optional row actions).

Primary areas:

- `components/views/CMAView.tsx`
- `components/ui/data-table.tsx` (new reusable paginated table)

Implementation tasks:

- [ ] Extract reusable `DataTable` with sort, page size 10/20/30/100.
- [ ] Reflow layout: charts row top; table full width below (or tabbed Charts | Data).
- [ ] Add charts: price distribution histogram, $/sqft by type, listings by city (top N).
- [ ] Compact metric chips instead of three large cards.
- [ ] Row click opens listing dialog; compare checkbox column.

Exit criteria:

- [ ] 88 listings table paginates at 10 rows default; sort by price works.

Suggested verification:

- Browser CMA smoke; unit test for sort/pagination helpers.

---

## Workstream 10: Production Verification And Closeout

Goal: Prove all acceptance criteria on production with browser interaction.

Depends on: WS1–WS9.

Implementation tasks:

- [ ] `npm run verify`
- [ ] Production: sign-in → profile menu sign-out flow
- [ ] Production: 88 listings, compact dialog, one listing action
- [ ] Production: toast on simulated alert match without layout shift
- [ ] Production: docs TOC pinned behavior
- [ ] Production: CMA pagination
- [ ] Update orchestrator log; move production-shape plan to legacy when superseded.

Exit criteria:

- [ ] All acceptance criteria checked below.

---

## Final Verification And Closeout

- `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run verify`
- Playwright critical-path smokes (auth, listings, toast, docs, CMA)
- `git diff --check`; no secrets in diff
- Orchestrator log entry in `docs/engineering/agents/orchestrator-logs/`

---

## Acceptance Criteria

1. [ ] Vercel production under `jamienavinhill` with envs set via CLI; daily ingest cron protected and working.
2. [ ] `REALTY_API_KEYS` contains full key list; documentation states keys were not all exhausted for 44224 baseline.
3. [ ] Gmail ingest runs automatically on new mail; manual scan is optional/advanced.
4. [ ] Multiselect includes Zillow, Trulia, Homes.com, Redfin, realtor.com + optional custom query.
5. [ ] Toasts are uniform, dismissible, time out, and cause zero layout shift.
6. [ ] CMA tables paginate (10 default, 20/30/100) and sort; layout is balanced with multiple charts.
7. [ ] Docs TOC pinned; main content scrolls independently; content expanded.
8. [ ] Listing detail is a compact floating dialog with interested/favorite/hide/compare/analyze actions.
9. [ ] Auth chrome: “Sign in” only when signed out; avatar + profile menu (name, sign out) when signed in; accent icon only.
10. [ ] No mock data; provenance preserved; `npm run verify` passes.

---

## Implementation Order

1. **WS1** Vercel/env/Firebase admin JSON support
2. **WS2** Toast system (unblocks notification UX)
3. **WS5** Listing preferences contract + rules
4. **WS6** Auth chrome + theme (quick win, visible polish)
5. **WS4** Multiselect ingest filter UI
6. **WS3** Automatic Gmail ingestion (primary flow)
7. **WS8** Listing dialog + actions
8. **WS9** CMA page rebuild
9. **WS7** Docs layout + content
10. **WS10** Production verification

---

## Expansion Track (After Acceptance)

- Gmail `watch` + Pub/Sub push instead of polling
- Push notifications (web push / mobile)
- Side-by-side compare print/export
- Saved search templates per platform with deep links

---

## Orchestration Checkpoints

| Dispatch | Workstream | Pass | Agent ID | Next action                 |
| -------- | ---------- | ---- | -------- | --------------------------- |
| —        | —          | —    | —        | Awaiting first WS1 dispatch |
