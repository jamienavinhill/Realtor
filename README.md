# Abode Alerts

Abode Alerts is a Next.js property-monitoring workspace for the 10-mile radius around ZIP 44224 (Stow, Ohio). It ingests real listings with source provenance, signs users in with Google, stores listings and alerts in Firestore, and exports to Google Workspace. It never invents listings, media, or market facts, and it makes no MLS-completeness or guaranteed-real-time claims.

Production domain: `https://abode-alerts.vercel.app`

## What It Does

- **Automatic email ingestion (primary flow).** A new listing-alert email is the trigger: Gmail `watch` → Cloud Pub/Sub push → server pipeline → Gemini extraction (server-side) → validation, provenance, dedupe → Firestore upsert → alert evaluation → toast. A manual "Scan Gmail" and a paste-and-parse path remain as fallbacks.
- **Real baseline inventory.** An auditable, idempotent backfill populates active listings within 10 miles of 44224 with real media and full provenance.
- **Alerts.** Saved, owner-scoped search criteria evaluated server-side during ingestion and the daily refresh; matches are persisted and surfaced as non-shifting toasts.
- **Listing workspace.** A compact listing dialog with per-user actions (interested / not interested / favorite / hide / compare up to four) and a Gemini-backed analysis that reasons only from stored fields.
- **CMA.** Comparative Market Analysis charts and a sortable, paginated table derived entirely from the real Firestore inventory.
- **In-app docs.** The Docs tab documents the live flows; the durable operations/architecture docs live under `docs/`.

## Stack

- Next.js 15 App Router with React 19 and TypeScript
- Tailwind CSS 4 theme tokens in `app/globals.css`
- Firebase Auth and Firestore client SDK in `lib/firebase.ts`
- Gemini extraction API routes in `app/api/*`
- Google Workspace OAuth scopes for Gmail, Sheets, Calendar, and Drive file flows

## Local Development

```bash
npm install
npm run dev
```

The local app runs at `http://localhost:3000`.

## Required Environment

Runtime secrets stay in local `.env` files and Vercel environment variables only. Do not commit real values.

Runtime env names (see `.env.example` for the authoritative template):

- `GEMINI_API_KEY` — server-side Gemini extraction calls.
- `REALTY_API_KEYS` — comma-separated RealtyAPI keys (rotated server-side).
- `INGEST_JOB_TOKEN` — bearer token gating `/api/ingest/*` routes.
- Firebase Admin — `FIREBASE_SERVICE_ACCOUNT_JSON` (inline, on Vercel) or `PATH_TO_FIREBASE_ADMIN_SDK` (local file path).
- Optional: `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`.

Firebase web config lives in `firebase-applet-config.json` because Firebase client web config is not a secret. If this app moves to multi-environment Firebase projects, promote those values to `NEXT_PUBLIC_FIREBASE_*` variables and generate the client config from environment.

## Quality Gates

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test
npm run build
npm run verify
```

`npm run verify` runs lint, typecheck, format:check, test, and build in sequence. Use the narrowest meaningful gate while iterating, then run `npm run verify` before production changes land.

Firestore security rules have a dedicated emulator suite that is not part of `verify` (it needs the Firestore emulator and Java):

```bash
npm run test:rules
```

## Active Execution Plan

- Roadmap, data contracts, and Firestore collection map: `docs/roadmaps/`
- Repository agent guide: `AGENTS.md`
- Docs index: `docs/README.md`
