# Abode Alerts

Abode Alerts is a Next.js property-monitoring workspace for real listing ingestion, Google sign-in, Firestore-backed saved listings and alerts, and Google Workspace export flows.

Production domain: `https://abode-alerts.vercel.app`

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
npm run build
npm run verify
```

Use the narrowest meaningful gate while iterating, then run `npm run verify` before production changes land.

## Active Execution Plan

- Roadmap, data contracts, and Firestore collection map: `docs/roadmaps/`
- Repository agent guide: `AGENTS.md`
- Docs index: `docs/README.md`
