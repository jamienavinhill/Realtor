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

`npm run verify` is the **local release gate**. It must be green — with no force flags,
shims, or skipped steps — before production changes land.

Two gates run outside `verify` because they need external processes the standard gate
should not depend on:

| Command              | Checks                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `npm run test:rules` | Firestore security-rules emulator suite (needs Java + emulator)   |
| `npm run test:e2e`   | Playwright critical-path smokes (starts the app, headless Chrome) |

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

### Playwright critical-path smokes

The end-to-end smokes live under `e2e/` and run against the app started by Playwright's
`webServer` (`playwright.config.ts` runs `npx next dev` on port 3100 and sets a throwaway
`INGEST_JOB_TOKEN` so the protected-route gate is exercised rather than short-circuiting
to a 503 "not configured"):

```bash
npm run test:e2e
```

Chromium is the only browser project; install it once with
`npx playwright install --with-deps chromium` (CI does this automatically). The specs
cover the **honest reachable surface** without live Google OAuth:

| Spec                      | Covers                                                                | Runs |
| ------------------------- | --------------------------------------------------------------------- | ---- |
| `auth-chrome.spec.ts`     | Signed-out chrome: "Sign in" only, no avatar/profile menu             | yes  |
| `docs-toc.spec.ts`        | Docs TOC stays pinned while the docs `main` column scrolls            | yes  |
| `cma.spec.ts`             | CMA pagination (rows-per-page) + column sort on the public catalog\*  | yes  |
| `toast-noshift.spec.ts`   | Toast (shipped `abode:toast` event) causes zero layout shift          | yes  |
| `protected-route.spec.ts` | `POST /api/ingest/daily` → 401 without token, non-401 with token      | yes  |
| `auth-gated.spec.ts`      | Listing actions + WS18 share/invite — **`test.skip`, manual runbook** | skip |

\* The CMA renders from the **public** `properties` catalog (world-readable per the
Firestore rules), so it is reachable signed-out — but it needs the live catalog
populated. If the running host cannot reach the populated Firebase project, the CMA
shows its honest empty state and the pagination/sort assertions `test.skip` with that
reason instead of failing or faking data.

The auth-gated specs are intentionally skipped: a real signed-in session needs Firebase
Auth + Google OAuth (Workspace scopes), which is blocked headless/in CI, and the app
ships **no** auth backdoor. They are documented as manual steps in the release runbook
(`docs/operations/release-runbook.md`); the rules half of those flows is proven by
`npm run test:rules` (42 cases, incl. 24 WS18 owner/editor/viewer/non-member cases).

## The release gate (full ladder)

The complete gate before a production change is trusted. The rows marked **CI** run
automatically on every push and pull request to `main` via `.github/workflows/ci.yml`;
the rows marked **operator** require live credentials or a deployed build and are run
intentionally by the operator (they are not in CI because they would need real secrets
or live Google accounts).

| Rung | Check                            | Command / source                                       | Where                           |
| ---- | -------------------------------- | ------------------------------------------------------ | ------------------------------- |
| 1    | Lint                             | `npm run lint`                                         | CI (`verify`)                   |
| 2    | Typecheck                        | `npm run typecheck`                                    | CI (`verify`)                   |
| 3    | Format check                     | `npm run format:check`                                 | CI (`verify`)                   |
| 4    | Unit / contract tests            | `npm run test`                                         | CI (`verify`)                   |
| 5    | Production build                 | `npm run build`                                        | CI (`verify`)                   |
| 6    | Firestore rules                  | `npm run test:rules`                                   | CI (`rules`)                    |
| 7    | E2E critical-path smokes         | `npm run test:e2e`                                     | CI (`e2e`)                      |
| 8    | Env verification                 | `lib/env.ts` `validateServerEnv` / `tests/env.test.ts` | CI (rung 4) + operator readback |
| 9    | Protected-route smoke (deployed) | `scripts/vercel-listings-check.ts`                     | operator                        |
| 10   | Auth-gated UI + WS18 sharing     | manual two-account flow                                | operator                        |

Rungs 1–7 run with **no real secrets**: the Firebase web client config is public and
`next build` reads no runtime app secret at module load, so CI builds and smokes clean
on public config alone. Rung 9 (the deployed protected-route smoke) and rung 10 (the
OAuth-gated UI and the WS18 two-account flow) are the **operator/manual** residue — see
the release runbook.

## Continuous integration

`.github/workflows/ci.yml` runs three jobs on push + pull_request to `main`:

- **`verify`** — `npm ci` then `npm run verify` (rungs 1–5) on Node 24.
- **`rules`** — Node 24 + Temurin JDK 21 + cached Firebase emulator binaries, then
  `npm run test:rules` (rung 6). The Firestore emulator needs no Firebase login.
- **`e2e`** — `npx playwright install --with-deps chromium` then `npm run test:e2e`
  (rung 7); uploads the Playwright HTML report as an artifact.

The repo is **public**, so Actions minutes are free/unlimited; all three jobs run on
every push/PR. CI is **not** a deploy trigger — Vercel deploys automatically on
`git push`. Action versions are pinned (`checkout@v6`, `setup-node@v6`,
`setup-java@v5`, `cache@v4`, `upload-artifact@v7`), verified against official docs.

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
