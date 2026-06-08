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

Required today:

- `GEMINI_API_KEY` — server-side Gemini extraction calls.

Firebase web config currently lives in `firebase-applet-config.json` because Firebase client web config is not a secret. If this app moves to multi-environment Firebase projects, promote those values to `NEXT_PUBLIC_FIREBASE_*` variables and generate the client config from environment.

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

- Roadmap: `docs/roadmaps/2026-06-08-abode-alerts-production-shape-plan.md`
- Agent goal prompt: `docs/engineering/agents/goal.md`
- Repository agent guide: `AGENTS.md`
