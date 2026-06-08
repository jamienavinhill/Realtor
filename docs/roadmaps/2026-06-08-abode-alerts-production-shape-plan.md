# Abode Alerts Production Shape Implementation Plan

Date: 2026-06-08
Status: [~] Active
Source reports: `README.md`, `package.json`, `app/api/properties/route.ts`, `app/api/gemini/route.ts`, `app/globals.css`, `components/dashboard.tsx`, `components/theme-controls.tsx`, `components/views/ListingsGrid.tsx`, `lib/firebase.ts`, `types/listings.ts`, `firebase-applet-config.json`, `firestore.rules`, `docs/research/INBOX_PARSING.md`, Google Cloud Free Program, Firebase pricing, Firestore pricing, Firebase AI Logic pricing
Owner: Abode Alerts engineering agents
Surface: Next.js app, Firebase Auth/Firestore, Gemini extraction, Google Workspace OAuth, provider ingestion jobs, Vercel production deployment at `abode-alerts.vercel.app`

## Purpose

Build Abode Alerts into its final production-shaped real estate monitoring workspace: real Google sign-in, real listing ingestion, real media, real baseline backfill for a 10-mile radius around `44224`, durable daily alert rotation, clean docs/tooling, and no seeded/mock listing behavior in shipped surfaces.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked or needs explicit operator/account action

## Source Findings

- The app is a Next.js 15 App Router project with React 19, TypeScript, Tailwind CSS 4, Firebase, Gemini SDK, and Google Workspace-oriented routes in `package.json`, `app/api/properties/route.ts`, and `lib/firebase.ts`.
- Production domain is `abode-alerts.vercel.app`; local docs still contained AI Studio boilerplate before this cleanup in `README.md`.
- Firebase Auth and Firestore are wired through `lib/firebase.ts` using `firebase-applet-config.json`; Firestore uses database id `ai-studio-abd39654-12ad-4613-a439-79d6fc549d9d`.
- `components/dashboard.tsx` listens to `properties` and `alerts`, signs in through Google OAuth, requests Gmail/Sheets/Calendar/Drive scopes, parses Gmail and pasted text, commits listings to Firestore, exports Sheets rows, and creates Calendar events.
- The prior listing baseline came from hardcoded `lib/static_properties.ts` and was merged into Firestore results in `components/dashboard.tsx`; this is not acceptable for the final product shape.
- The prior extraction prompt in `app/api/properties/route.ts` allowed stock Unsplash fallback images; final behavior must only store real listing media URLs or an explicit no-media state.
- `components/theme-controls.tsx` used a small preset accent list; the required product behavior is a real color picker with persisted arbitrary color selection.
- `components/views/ListingsGrid.tsx` assumed a listing image existed and needed no-media handling once fake image fallbacks were removed.
- `firestore.rules` exists and must be audited before launch-hardening any backfill, saved search, or user-owned collections.
- `docs/engineering/standards/planning-style.md`, `docs/engineering/standards/report-style.md`, and `docs/engineering/agents/orchestration-reliability.md` define the planning/reporting/orchestration style that must remain intact but point at this project.
- Official Firebase pricing sources state that Firebase Authentication is no-cost for most sign-in options, Firestore has free quota of 1 GiB stored data, 50K reads/day, 20K writes/day, 20K deletes/day, and 10 GiB/month egress, and Google Cloud free credits can apply to many Google Cloud/Firebase paid services but not Gemini Developer API usage when using that provider.
- Official Firebase AI Logic pricing states the Google Cloud `$300` credit can be used for Vertex AI Gemini API and most paid Firebase/Google Cloud services, but not Gemini Developer API costs.

## Locked Decisions

- [x] Product name in docs is **Abode Alerts**. Internal package name may remain `realty-monitor` until a package rename is intentionally done.
- [x] Keep the deployed Next.js app on Vercel at `abode-alerts.vercel.app`.
- [x] Keep Firebase Auth and Firestore as the production auth/storage baseline. Firebase free quota is generous enough for current listings, alerts, users, and backfill metadata. Upgrade to Blaze only when a required Google Cloud/Firebase feature needs billing or quota exceeds Spark/free limits.
- [x] Do not use Firebase Storage for third-party listing images by default. Store source media URLs and metadata first; add an image cache/proxy only if provider terms allow caching and product performance requires it.
- [x] Use Gemini server-side only for extraction/enrichment. `GEMINI_API_KEY` remains a Vercel/server env var. Do not expose it to the browser.
- [x] Use RealtyAPI as the primary structured provider for the `44224` radius baseline and daily refresh. Store all RealtyAPI keys in a single server env var, rotate them server-side, and never expose them to the browser.
- [x] Use Google Workspace OAuth for user-owned Gmail, Sheets, Calendar, and Drive file workflows. User access tokens stay in memory only until a server-side encrypted token persistence design is implemented.
- [x] Use a protected scheduled ingestion endpoint plus a daily GitHub Actions or Vercel Cron trigger. Default schedule is daily at `11:00 UTC` / `06:00 America/New_York`.
- [x] Baseline backfill target is all current active listings within 10 miles of ZIP `44224`, centered on Stow, Ohio. Persist source provenance, fetch timestamp, provider account id/key alias, dedupe key, coordinates, media URLs, and raw provider payload hash.
- [x] Google/free search enrichment can fill gaps only with permitted public/indexed data and source citations. Do not scrape behind auth, evade rate limits, or invent values.
- [x] No mock listings, placeholder property rows, stock real estate images, or prototype copy in shipped product paths. Fixtures belong under tests only.
- [x] Engineering tooling baseline is npm, ESLint, Prettier, TypeScript, Next build, and `npm run verify`.

## Scope Boundaries

- Security: secrets live only in local `.env`, Vercel env vars, GitHub Actions secrets, or provider secret stores. Never commit keys, PATs, Firebase service accounts, account credentials, or raw OAuth tokens.
- Runtime exposure: browser code may access Firebase client config and Google OAuth sign-in only. Provider keys, Gemini keys, scheduled-job tokens, PATs, and service credentials stay server-side.
- Provider behavior: use official APIs, user-authorized inbox data, or permitted public search results. Record source URLs and extraction confidence. Do not present inferred data as provider-verified fact.
- Migrations: Firestore collection/schema changes must be additive first, backfilled with scripts, then read paths can rely on them after verification.
- Public claims: no claim of MLS completeness, exclusive access, guaranteed real-time freshness, or investment advice unless backed by source contracts and legal review.
- Cost: Firebase Spark/free tier remains the default. Enable Blaze/paid Google Cloud only for an explicit capability and with budget alerts.

## Repo Guidance

- Read `AGENTS.md`, this roadmap, and relevant files before editing.
- Use `rg` or project search before changing shared flows.
- Keep responsibilities explicit: UI renders state, API routes validate/authenticate/orchestrate, provider adapters fetch data, Firestore stores source-owned records, docs capture durable rules.
- Replace fake data by removing the dependency, not by hiding it behind different labels.
- Every ingestion record must carry provenance and be traceable back to source and run id.
- Any daily job must be idempotent and safe to rerun.
- Prefer small provider ports over direct fetch calls embedded in UI/components.
- Keep generated or volatile provider data out of durable docs. Put examples in fixtures/tests with sanitized payloads.

## Target Repository Shape

- `app/`
  - `page.tsx`, `layout.tsx`, `globals.css`
  - `api/properties/route.ts` for user-initiated Google Workspace actions while this route exists
  - `api/ingest/backfill/route.ts` protected baseline ingestion endpoint
  - `api/ingest/daily/route.ts` protected daily refresh endpoint
  - `api/gemini/route.ts` or a consolidated Gemini service route after route ownership is cleaned up
- `components/`
  - Auth header with Google avatar/sign-in button
  - Real color picker theme controls
  - Listing cards with real-media/no-media states
  - Alert setup, listing grid, CMA, docs, and ingestion views wired to typed data
- `lib/`
  - `firebase.ts` client SDK adapter
  - `env.ts` server/client env validation
  - `providers/realty-api.ts` RealtyAPI adapter and key rotation
  - `providers/google-search.ts` permitted search enrichment adapter
  - `ingest/backfill.ts` ZIP/radius baseline orchestration
  - `ingest/daily-refresh.ts` alert/listing refresh orchestration
  - `repositories/listings.ts`, `repositories/alerts.ts`, `repositories/runs.ts`
  - `schemas/listing.ts`, `schemas/alert.ts`, `schemas/ingest.ts`
- `scripts/`
  - `backfill-44224.ts` local/operator baseline runner
  - `verify-env.ts` env readiness check
- `types/`
  - shared listing/alert/run contracts, or generated exports from schema files
- `.github/workflows/`
  - scheduled daily refresh workflow if GitHub is initialized and selected as scheduler
- `docs/`
  - `README.md` index
  - `roadmaps/2026-06-08-abode-alerts-production-shape-plan.md`
  - `operations/development-workflow.md`
  - `operations/provider-ingestion.md`
  - `architecture/data-model.md`
  - `architecture/auth-and-secrets.md`
  - `decisions/` for durable decisions promoted out of this roadmap
- Tooling
  - `eslint.config.mjs`, `.prettierrc.mjs`, `.prettierignore`, `.gitignore`, `.env.example`
  - `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm run build`, `npm run verify`

## Cross-Stream Dependency Map

- Workstream 1 creates tooling and repo guidance used by all streams.
- Workstream 2 removes fake UI/data assumptions before ingestion lands.
- Workstream 3 defines contracts and env validation consumed by provider adapters, routes, scripts, docs, and tests.
- Workstream 4 implements provider adapters consumed by baseline and daily jobs.
- Workstream 5 backfills `44224` and validates source provenance before dashboards claim real inventory.
- Workstream 6 daily alert rotation depends on provider adapters, data contracts, and backfilled records.
- Workstream 7 security rules and auth hardening depend on final collection ownership.
- Workstream 8 docs/ops finalize once commands, envs, and jobs are real.
- Workstream 9 production verification runs after code, rules, envs, and data paths are complete.

## Workstream 1: Tooling, Docs, And Agent Operating Baseline

Goal: Give every engineer/agent a clear project entrypoint, real quality gates, and current docs that match this codebase.

Depends on:

- [x] Existing `package.json`, docs standards, and current app files.

Enables:

- [ ] All implementation streams.

Primary areas:

- `package.json`
- `eslint.config.mjs`
- `.prettierrc.mjs`
- `.prettierignore`
- `.gitignore`
- `.env.example`
- `AGENTS.md`
- `README.md`
- `docs/README.md`
- `docs/engineering/agents/goal.md`
- `docs/engineering/standards/docs-standards.md`
- `docs/engineering/agents/orchestration-reliability.md`

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
- [ ] New agents can start from `AGENTS.md` and the active roadmap without stale Studio/Jami references.
- [ ] No tracked file contains secret values.

Suggested verification:

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`
- `git diff --check` when Git exists

## Workstream 2: UI Cleanup, Auth Chrome, And No-Fake-Data Behavior

Goal: Make the current app honest and polished: Google avatar/sign-in, arbitrary accent color, Firestore-only listings, and no stock/listing placeholders.

Depends on:

- [x] Current UI implementation in `components/dashboard.tsx`, `components/theme-controls.tsx`, and `components/views/ListingsGrid.tsx`.

Enables:

- [ ] Real baseline backfill and alert monitoring without fake rows contaminating results.

Primary areas:

- `components/dashboard.tsx`
- `components/theme-controls.tsx`
- `components/views/ListingsGrid.tsx`
- `app/globals.css`
- `app/api/properties/route.ts`
- `types/listings.ts`

Implementation tasks:

- [x] Replace display-name/email header block with standard Google sign-in button and Google avatar.
- [x] Replace preset accent picker with `<input type="color">` and generated theme shades persisted to local storage.
- [x] Remove static property baseline merging and delete seeded property source file.
- [x] Change extraction prompts to return empty `imageUrl` when no real listing media exists.
- [x] Add no-media rendering in listing cards/modals.
- [ ] Remove unused dashboard state/imports and fix all lint/type findings.
- [ ] Rename user-facing brand from `Realty Monitor`/`Realty` to `Abode Alerts` across UI and docs where appropriate.
- [ ] Replace Austin defaults with the `44224` Stow/Akron-area defaults.
- [ ] Add empty-state copy that guides baseline backfill and ingestion rather than implying filters are wrong.

Exit criteria:

- [ ] Fresh Firestore with zero listings shows a truthful empty state.
- [ ] Signing in shows Google avatar only; no redundant profile name/email display in header.
- [ ] Accent control accepts arbitrary color values and persists across refreshes.
- [ ] No runtime path imports or merges fake listing data.

Suggested verification:

- `npm run lint`
- `npm run typecheck`
- Manual browser smoke: sign out, sign in, avatar visible, color pick persists, listings empty without fake rows.

## Workstream 3: Contracts, Schemas, Env Validation, And Firestore Model

Goal: Define durable typed contracts for listings, alerts, provider runs, media, provenance, and env readiness before adding provider automation.

Depends on:

- [ ] Workstream 1 command baseline.
- [ ] Workstream 2 fake-data removal.

Enables:

- [ ] Provider adapters, backfill, daily refresh, security rules, docs, and tests.

Primary areas:

- `types/listings.ts`
- `lib/schemas/*`
- `lib/env.ts`
- `lib/repositories/*`
- `firestore.rules`
- `.env.example`
- `docs/architecture/data-model.md`

Implementation tasks:

- [ ] Add a runtime schema library or handwritten validators for listing, media, alert, and ingest run payloads.
- [ ] Expand listing contract with `sourceProvider`, `sourceUrl`, `sourceListingId`, `sourceUpdatedAt`, `ingestedAt`, `provenance`, `media[]`, `rawHash`, `dedupeKey`, `radiusCenter`, and `distanceMiles`.
- [ ] Define provider run records with status, started/finished timestamps, key alias, quota used, result counts, error counts, and idempotency key.
- [ ] Add env validation for `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, optional `GOOGLE_SEARCH_API_KEY`, optional `GOOGLE_SEARCH_ENGINE_ID`, and optional Firebase env promotion values.
- [ ] Write repository functions for listings, alerts, and ingest runs.
- [ ] Update `firestore.rules` to match final user-owned/admin-owned collection boundaries.
- [ ] Document schema ownership and migrations in `docs/architecture/data-model.md`.

Exit criteria:

- [ ] API routes and scripts validate external/provider payloads before writing Firestore.
- [ ] Firestore writes include provenance and dedupe metadata.
- [ ] Env failures are explicit and actionable before any provider call runs.

Suggested verification:

- `npm run typecheck`
- `npm run lint`
- targeted repository/schema tests once test harness exists

## Workstream 4: RealtyAPI And Search Provider Adapters

Goal: Add real provider ports for structured listing fetches and permitted public enrichment, with key rotation and quota accounting.

Depends on:

- [ ] Workstream 3 contracts and env validation.

Enables:

- [ ] Baseline backfill and daily refresh.

Primary areas:

- `lib/providers/realty-api.ts`
- `lib/providers/google-search.ts`
- `lib/providers/types.ts`
- `lib/ingest/quota.ts`
- `.env.example`
- `docs/operations/provider-ingestion.md`

Implementation tasks:

- [ ] Implement RealtyAPI adapter for active listings within radius/ZIP criteria.
- [ ] Accept comma-separated `REALTY_API_KEYS` and rotate by run/key alias without logging values.
- [ ] Track daily quota consumption per key and stop before limits are exceeded.
- [ ] Normalize RealtyAPI records into listing schema with source provenance and media arrays.
- [ ] Implement public search enrichment adapter behind `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID` only for missing non-authoritative fields and source URLs.
- [ ] Add provider error classes for rate limit, auth, provider outage, malformed payload, and no-results.
- [ ] Document provider setup and expected envs.

Exit criteria:

- [ ] Provider calls are isolated from UI and Firestore write code.
- [ ] Key rotation is deterministic and inspectable without exposing keys.
- [ ] Quota exhaustion degrades to partial run results, not silent failure.

Suggested verification:

- `npm run typecheck`
- adapter tests with sanitized fixtures
- live smoke with one low-limit provider key only after env is present

## Workstream 5: 44224 Ten-Mile Baseline Backfill

Goal: Populate Firestore with all current active listings within 10 miles of `44224`, with real media and auditable provenance.

Depends on:

- [ ] Workstream 3 contracts/repositories.
- [ ] Workstream 4 RealtyAPI adapter.
- [ ] At least one valid `REALTY_API_KEYS` value in local/Vercel operator secrets.

Enables:

- [ ] Real listing dashboard, CMA, alert setup, and daily refresh.

Primary areas:

- `lib/ingest/backfill.ts`
- `scripts/backfill-44224.ts`
- `app/api/ingest/backfill/route.ts`
- `lib/repositories/listings.ts`
- `lib/repositories/runs.ts`
- `docs/operations/provider-ingestion.md`

Implementation tasks:

- [ ] Define radius center for ZIP `44224` and radius `10` miles.
- [ ] Fetch active listings from RealtyAPI across available accounts/keys until complete or quotas are safely exhausted.
- [ ] Dedupe by provider id, normalized address, coordinates, and canonical source URL.
- [ ] Persist listings with `status=Active`, source provenance, media URLs, timestamps, and raw hash.
- [ ] Record a baseline run document with counts, key aliases used, and unresolved gaps.
- [ ] Add an operator script that can run locally and a protected API route for hosted trigger.
- [ ] Verify dashboard renders baseline records without static fallbacks.

Exit criteria:

- [ ] Firestore contains real current active listings for the target radius.
- [ ] Every listing has source provenance and no stock/fake media.
- [ ] Re-running the backfill updates existing records idempotently.

Suggested verification:

- `npm run typecheck`
- `npm run lint`
- `node --env-file=.env scripts/backfill-44224.ts --dry-run` once script exists
- Firestore readback count and sample record provenance audit

## Workstream 6: Daily Alert Rotation And Notification Data Flow

Goal: Refresh listings daily, evaluate saved alerts, and persist actionable alert matches without relying on a browser session.

Depends on:

- [ ] Workstream 3 contracts/repositories.
- [ ] Workstream 4 provider adapters.
- [ ] Workstream 5 baseline backfill.

Enables:

- [ ] Reliable production monitoring.

Primary areas:

- `lib/ingest/daily-refresh.ts`
- `app/api/ingest/daily/route.ts`
- `.github/workflows/daily-refresh.yml` or Vercel Cron config
- `firestore.rules`
- `types/listings.ts`

Implementation tasks:

- [ ] Implement a protected daily route that requires `INGEST_JOB_TOKEN`.
- [ ] Add daily refresh orchestration: fetch new/changed listings, upsert records, mark stale records, evaluate active alerts.
- [ ] Persist alert match records with listing id, alert id, match reason, first seen, latest seen, and user id.
- [ ] Add scheduler default: daily at `11:00 UTC`, with GitHub Actions as default if repo is initialized; Vercel Cron can replace it if plan/support is confirmed.
- [ ] Add idempotency so retries do not duplicate alert matches.
- [ ] Add UI read path for persisted alert matches instead of only in-session toast.

Exit criteria:

- [ ] Daily refresh runs without a browser session.
- [ ] Users can see persisted alert matches after sign-in.
- [ ] Failed provider keys or partial quotas are recorded in run status.

Suggested verification:

- protected-route unauthorized request returns 401/403
- dry-run daily refresh produces no writes
- live scheduled smoke after env is present

## Workstream 7: Auth, Firestore Rules, And Secret Hardening

Goal: Lock down user-owned data, operator-only ingestion, and OAuth/provider secrets before production growth.

Depends on:

- [ ] Workstream 3 final collection model.
- [ ] Workstream 6 scheduled routes.

Enables:

- [ ] Production launch confidence and safe multi-user usage.

Primary areas:

- `firestore.rules`
- `lib/firebase.ts`
- `app/api/*`
- `docs/architecture/auth-and-secrets.md`
- `docs/operations/development-workflow.md`

Implementation tasks:

- [ ] Audit `firestore.rules` for listings read access, user alert ownership, alert match ownership, and admin/operator writes.
- [ ] Move provider writes through server/admin paths if client writes are too permissive for shared collections.
- [ ] Add App Check or documented mitigation path if abuse risk rises.
- [ ] Define OAuth token persistence decision: in-memory only now; encrypted server-side persistence only when needed for background user inbox actions.
- [ ] Verify Firebase authorized domains include `abode-alerts.vercel.app` and local development domain.
- [ ] Confirm Vercel envs: `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, optional search envs, and any scheduler secrets.
- [ ] Add budget alerts if Blaze or paid Google Cloud is enabled.

Exit criteria:

- [ ] Users cannot write arbitrary shared listing state from the browser unless explicitly allowed.
- [ ] Scheduled endpoints cannot be triggered without the job token.
- [ ] Auth domains and production envs are documented and verified.

Suggested verification:

- Firebase rules tests once harness exists
- manual denied/allowed Firestore operations
- `npm run build`

## Workstream 8: Product Flows, Metadata, And Page Wiring

Goal: Wire every visible page/view to real data and final copy: listings, ingest, alerts, setup, CMA, docs, and metadata.

Depends on:

- [ ] Workstream 2 UI cleanup.
- [ ] Workstream 5 baseline data.
- [ ] Workstream 6 alert matches.

Enables:

- [ ] Polished production experience.

Primary areas:

- `app/layout.tsx`
- `metadata.json`
- `components/dashboard.tsx`
- `components/views/*`
- `README.md`
- `docs/README.md`

Implementation tasks:

- [ ] Update app metadata, title, descriptions, social metadata, and icons for Abode Alerts.
- [ ] Ensure setup/wizard explains the one-email sign-up flow for Zillow, Redfin, Realtor.com, Homes.com, and other listing alert sources without embedding account credentials.
- [ ] Wire CMA to real baseline and comparable records; hide or replace any synthetic chart values.
- [ ] Wire Docs view to current docs or remove in-app docs if it is stale.
- [ ] Ensure Google Workspace flows show precise permissions and failure states.
- [ ] Add loading, empty, partial-data, and provider-error states across views.

Exit criteria:

- [ ] No page depends on fake data or obsolete AI Studio copy.
- [ ] Metadata and user-facing copy match Abode Alerts and the deployed domain.
- [ ] Every visible action has an end-to-end data path or is removed until it does.

Suggested verification:

- `npm run lint`
- `npm run typecheck`
- browser smoke across every tab

## Workstream 9: Tests, Verification, And Production Release Gate

Goal: Add enough automated and manual verification to keep this app clean while moving fast.

Depends on:

- [ ] Workstreams 1-8.

Enables:

- [ ] Reliable production operation and future agent handoffs.

Primary areas:

- `package.json`
- `tests/` or framework-native test paths
- `scripts/*`
- `.github/workflows/*`
- `docs/operations/development-workflow.md`

Implementation tasks:

- [ ] Add a test harness appropriate for Next/React logic and provider adapters.
- [ ] Add sanitized fixtures for RealtyAPI, Gmail extraction, and search enrichment.
- [ ] Add schema/adapter/repository tests.
- [ ] Add a browser smoke checklist or Playwright smoke once routes stabilize.
- [ ] Add CI workflow when Git is initialized.
- [ ] Define release gate: lint, typecheck, format check, tests, build, env verification, protected route smoke, Firestore rules verification.

Exit criteria:

- [ ] `npm run verify` is the reliable local release gate.
- [ ] CI runs equivalent gates once GitHub repo exists.
- [ ] Production smoke checklist is documented and repeatable.

Suggested verification:

- `npm run verify`
- CI run once repository exists

## Final Verification And Closeout

Required before marking this plan complete:

- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run build`.
- [ ] Run `npm run verify`.
- [ ] Run targeted provider/schema/repository tests once they exist.
- [ ] Run the `44224` backfill dry run and live run with secrets present.
- [ ] Read back a Firestore sample of persisted listings, provider run records, alerts, and alert matches.
- [ ] Confirm Vercel envs and Firebase authorized domains.
- [ ] Confirm no tracked file contains secrets or private account tokens.
- [ ] Update `README.md`, `docs/README.md`, operations docs, architecture docs, and changelog/source-map records.
- [ ] If Git exists, stage only intentional files, commit, and push according to `AGENTS.md`.
- [ ] Move superseded roadmap material under `docs/_legacy/roadmaps/` after durable docs carry ongoing rules.

## Acceptance Criteria

- [ ] Abode Alerts runs locally and builds for production with clean lint, type, format, and build gates.
- [ ] Header auth uses Google sign-in and avatar; no custom profile-name/email display occupies the header.
- [ ] Accent control is an actual color picker with arbitrary persisted color, not presets.
- [ ] No shipped path contains fake listings, seeded baseline data, stock listing images, or prototype/MVP copy.
- [ ] Firestore contains real active listings within 10 miles of `44224`, all with provenance and no invented media.
- [ ] Daily refresh rotates RealtyAPI keys safely, records run status, and evaluates alerts idempotently.
- [ ] Google/free search enrichment stores citations and never presents inferred fields as provider-verified.
- [ ] Firebase Auth/Firestore remain the baseline storage/auth stack with clear upgrade triggers and budget guardrails.
- [ ] Vercel production envs are documented and verified.
- [ ] Firebase authorized domains include production and local development domains.
- [ ] Docs and agent prompts are project-specific, current, and reusable.

## Implementation Order

1. [x] Create active roadmap under `docs/roadmaps/` and point goal prompt at it.
2. [x] Install/configure linting, typecheck, formatting, verify, `.gitignore`, and `.env.example`.
3. [x] Add project-specific `AGENTS.md`, `README.md`, and docs index.
4. [x] Remove static listing baseline and stock-image fallback behavior.
5. [x] Replace auth header and accent picker behavior.
6. [ ] Run/fix lint, typecheck, format, and build for the cleanup pass.
7. [ ] Define schemas, env validation, repositories, and Firestore rules.
8. [ ] Implement RealtyAPI and Google search provider adapters.
9. [ ] Implement and run `44224` baseline backfill.
10. [ ] Implement daily refresh and persisted alert matches.
11. [ ] Harden auth/security rules and production envs.
12. [ ] Wire all views/metadata to final Abode Alerts copy and data.
13. [ ] Add tests/CI/release gate and complete production smoke.
14. [ ] Promote lasting rules to durable docs and retire superseded roadmap material.

## Expansion Track

- [ ] Provider marketplace adapters for additional real estate APIs if RealtyAPI coverage gaps remain.
- [ ] Map visualization with Google Maps only after listing coordinates and billing guardrails are verified.
- [ ] Image cache/proxy with provider-term review and Cloud Storage budget guardrails.
- [ ] Encrypted server-side OAuth token persistence for background Gmail ingestion if user-authorized inbox alerts become a primary scheduled source.
- [ ] Email/push notification delivery after alert match persistence is stable.
- [ ] Owner/operator dashboard for provider quota, run health, and failed enrichment triage.
- [ ] Formal decision records for Firebase/Firestore, scheduler choice, provider adapter contracts, and media caching.
