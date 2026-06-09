# Development Workflow

How to set up, build, verify, and iterate on Abode Alerts locally. The live code,
`package.json` scripts, and `AGENTS.md` remain authoritative; this doc describes the
operating loop, not project-specific contracts.

## Prerequisites

- **Node.js** with `npm` (the repo uses ES modules and `tsx` for TypeScript scripts).
- **Windows is the development host.** Run commands in the available Windows shell
  against this checkout; do not pivot to WSL for installs, builds, tests, or dev servers.
- **Java** is required only for the Firestore rules emulator suite (`npm run test:rules`),
  which runs via `firebase emulators:exec`. It is not needed for the standard gate.

## Setup

```bash
npm install
```

`npm install` resolves cleanly with no `--force` or `--legacy-peer-deps` flags. If you
hit a peer-dependency error, treat it as a real version-alignment problem to fix in
`package.json`, not something to force past.

Copy the env template and fill in real values locally (never commit them):

```bash
cp .env.example .env
```

`.env` is gitignored. `.env.example` is the only tracked env file and contains names
only. The app reads its runtime env through `lib/env.ts`; see `README.md` for the
authoritative list of variables.

## Run the app

```bash
npm run dev
```

The local app runs at `http://localhost:3000`.

## Quality gates

Run the narrowest meaningful gate while iterating, then the full gate before changes land.

| Command                | Checks                                                      |
| ---------------------- | ----------------------------------------------------------- |
| `npm run lint`         | ESLint (flat config, `--max-warnings 0`)                    |
| `npm run typecheck`    | `tsc --noEmit`                                              |
| `npm run format:check` | Prettier (Tailwind-aware) in check mode                     |
| `npm run test`         | Node test runner over `tests/*.test.ts` (unit/contract)     |
| `npm run build`        | `next build` production compile                             |
| `npm run verify`       | lint → typecheck → format:check → test → build, in sequence |

`npm run verify` is the release gate. It must be green — with no force flags, shims, or
skipped steps — before production changes land.

### Auto-fix formatting

```bash
npm run format
```

### Firestore rules emulator suite

The security-rules tests live under `tests/emulator/` and need the Firestore emulator
(and Java). They are intentionally **excluded** from the default `test` glob and from
`verify`, because they require external processes the standard gate should not depend on:

```bash
npm run test:rules
```

This launches the Firestore emulator via `firebase emulators:exec`, runs the emulator
tests, and shuts the emulator down.

## Operator scripts

These read `.env` directly and require real provider/admin credentials. They are
operator actions, not part of the standard dev loop — run them only intentionally:

```bash
npm run backfill        # 44224 ten-mile baseline ingestion
npm run daily:refresh   # daily provider refresh + alert rotation
```

## Docs-only changes

For Markdown-only edits, read back the changed files and run `git diff --check`. Keep
durable docs in sync with `docs/engineering/standards/docs-standards.md`.

## Conventions

- Use `rg` for repository search.
- Keep secrets out of tracked files, logs, and outputs. `.env` is gitignored; only
  `.env.example` (names, no values) is tracked.
- Build artifacts (`.next/`, `out/`, `dist/`, `tsconfig.tsbuildinfo`) are gitignored and
  must not be committed.
- Deployment is automatic on `git push` (Vercel Git integration). There is no deploy
  cron or deploy GitHub Action.
