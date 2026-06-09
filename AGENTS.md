# AGENTS.md

This is the development-agent entrypoint for the `Realtor` / Abode Alerts repository. Read it before doing anything; then read the active roadmap and any surface-specific docs below.

Abode Alerts is a **production-shaped property monitoring workspace**: a Next.js app on Vercel using Firebase Auth/Firestore, Gemini extraction, Google Workspace OAuth, and provider-backed listing ingestion. The app owns user experience, listing workflows, alert configuration, provider ingestion orchestration, and docs. External providers own source data; Abode Alerts must preserve provenance and never invent listings, media, or market facts.

## Repository Surfaces

- **Next.js app** (`app/`) — App Router pages, layout, global Tailwind CSS tokens, API routes, and server-side Gemini/provider orchestration.
- **UI components** (`components/`) — dashboard shell, auth chrome, theme controls, listing views, alert setup, ingestion views, CMA, and in-app docs surfaces.
- **Client/platform adapters** (`lib/`) — Firebase client SDK today; provider adapters, env validation, repositories, and ingestion modules as the roadmap executes.
- **Shared contracts** (`types/`) — listing and alert TypeScript contracts; expand through schema-owned contracts before provider automation.
- **Firebase config/rules** (`firebase-applet-config.json`, `firestore.rules`) — Firebase client configuration and Firestore access policy. Client config is not a secret; rules are security-critical.
- **Docs** (`docs/`) — active roadmaps under `docs/roadmaps/`, repo-wide engineering standards under `docs/engineering/`, research under `docs/research/`, and durable architecture/operations docs as they are created.

## Where To Start

- Active dependency-ordered plan: `docs/roadmaps/2026-06-08-abode-alerts-production-shape-plan.md`.
- Goal/orchestration prompt: `docs/engineering/agents/goal.md`.
- Repo-wide standards: `docs/engineering/standards/docs-standards.md`, `docs/engineering/standards/planning-style.md`, `docs/engineering/standards/report-style.md`, `docs/engineering/agents/orchestration-reliability.md`.
- Current stack and commands: `README.md` and `package.json`.

## Source Of Truth

- Live code, Firestore rules, package scripts, deployed environment behavior, and official provider docs override stale roadmap claims.
- The roadmap is the active execution guide, not proof of completion. Check files and run verification before marking anything done.
- Use `rg` first for repository search.
- Verify drift-prone facts against official sources before locking provider limits, pricing, API behavior, model names, Firebase/Auth rules, Vercel scheduler behavior, or Google OAuth scopes.
- Current drift hotspots: Firebase pricing/free quota, Firestore rules, Google OAuth scopes and verification, Gemini SDK/API model names, RealtyAPI limits/terms, Vercel cron plan behavior, Google search API limits, and third-party listing media caching rights.

## Work Boundaries

- This product is greenfield and should be built to final product shape. Do not introduce prototype-only paths, fake data, hidden demo rows, or stock listing media.
- No mock listings, placeholder property data, broad compatibility shims, or duplicate contract shapes in shipped code. Fixtures belong under tests only.
- Keep external dependencies behind explicit adapters/ports once runtime/provider code exists.
- UI components should not call third-party listing providers directly. API routes/scripts call provider adapters; adapters normalize into schema contracts; repositories write Firestore.
- Every stored listing or alert match must carry source provenance, timestamps, and enough metadata to audit how it was produced.
- Preserve unrelated user changes. If a file is untracked or dirty and outside the current task, leave it alone.
- Do not use destructive git commands such as `git reset --hard` or `git checkout --` unless the user explicitly requests them.
- Do not create, switch, or publish branches unless the user explicitly asks.
- If a code-owned issue blocks completion, fix it rather than documenting it as an external blocker.

## Local Workflow

- The development host is Windows. Use the available shell against this checkout; do not pivot to WSL for installs, builds, tests, or dev servers.

### Shell And Working Directory

- **Workspace root is the repo checkout** (`Realtor/`), not the parent `projects/` folder. Every shell command, script output, screenshot, log, and temp artifact belongs inside this repo or in OS temp — never in `C:\Users\james\projects\` parent paths.
- When running commands, pass `working_directory` / `cd` to the repo root explicitly if the shell cwd is uncertain.
- **Ephemeral agent outputs** go to OS temp (e.g. `%TEMP%\grok-goal-*`) or gitignored paths already listed in `.gitignore` (`terminals/`, `agent-tools/`, `.playwright-cli/`). Do not create new top-level folders in the repo for harness files.
- User shell profiles may land in `~/projects` for manual work; agents must not rely on that behavior and must stay scoped to the active workspace.
- Before editing, identify the owning files, contracts, tests, and docs.
- After editing, run the narrowest meaningful verification first, then broader gates required by the change.
- If a required gate does not exist yet, say so clearly and name the missing tool or command instead of inventing a substitute.
- For goal runs that coordinate subagents, follow `docs/engineering/agents/orchestration-reliability.md`: checkpoint dispatches/results in the active roadmap and keep orchestration resumable from repo state.

## Secrets And Safety

- Never commit secrets.
- Runtime secrets live only in local `.env`, Vercel environment variables, GitHub Actions secrets, Firebase/Google Cloud secret stores, or provider dashboards.
- `.env.example` is the only tracked env template and must contain names only, never values.
- Never write provider keys, PATs, OAuth refresh/access tokens, Firebase service-account JSON, account credentials, private listing URLs, or raw paid-provider payloads into docs, fixtures, screenshots, metadata, logs, UI output, or exported artifacts.
- Secret lanes stay separate:
  - **Operator scope** — credentials the agent/operator uses to deploy, inspect dashboards, run GitHub/Vercel/Firebase tooling, or trigger ingestion.
  - **App runtime secrets** — values the app reads at runtime, such as `GEMINI_API_KEY`, `REALTY_API_KEYS`, `INGEST_JOB_TOKEN`, optional search keys, and future service credentials.
- Firebase web client config is public configuration, not a secret. Firestore rules and server-side credentials provide security.
- Fail closed when auth, source policy, licensing, terms, or cost boundaries are unclear. Do not evade provider rate limits or terms.

## Quality Bar

- Implement the owning system, not a workaround.
- Build honest UI states: loading, empty, partial data, provider errors, auth required, and no-media states should be explicit and user-safe.
- Do not present inferred data as verified provider data. Store confidence/provenance for enriched fields.
- Provider jobs must be idempotent and safe to rerun.
- Shared contracts should have runtime validation before accepting external data.
- Firestore write paths must respect ownership: user-owned alerts/matches, shared listing catalog, and operator-only ingestion records.
- Docs, public copy, and in-app claims must match what the code and verified sources actually support.

## Docs

- Keep durable docs concise and stable.
- Put active implementation steps in the roadmap, not in `AGENTS.md`.
- Promote lasting rules from completed plans into durable architecture, operations, security, or decision docs; move obsolete plans to `docs/_legacy/`.
- Update docs when commands, gates, contracts, envs, safety boundaries, or operating procedures change.
- Use `docs/README.md` as the docs index. Do not add subdirectory README files unless the directory owns a stable index or executable truth.
- Do not leave open decisions hidden in prose. Put them in the active roadmap, a report, or a decision record.

## Verification Ladder

For docs-only changes:

- Read back the edited Markdown.
- `git diff --check` when Git exists.

For TypeScript/React/Next changes:

- `npm run lint`
- `npm run typecheck`
- `npm run format:check`
- `npm run build`

For full-app changes:

- `npm run verify`
- Browser smoke the touched route/tab.
- Confirm Vercel/Firebase env and auth-domain behavior when deployment/auth changes are involved.

For provider/protocol/auth changes:

- Verify current official docs first.
- Run narrow local gates.
- Run live provider/API smoke only when credentials are present and the action is intended.
- Record quota/cost implications and do not expose secrets in output.

## Closeout

- Run all gates required by the active stream before calling work done.
- For code changes, report focused tests plus any broader lint/type/format/build/integration checks run.
- For docs-only changes, read back edited Markdown and run `git diff --check` when Git exists.
- Confirm no forbidden live/paid provider action was run when not intended.
- Stop dev servers, scheduled jobs, browser automation, and helper processes started during the session unless the user asked to leave them running.
- If Git exists and a remote exists, stage only intentional changes, commit, and push according to the user's requested flow. Do not open a PR or create a branch unless asked.
- If staging would include unrelated dirty/untracked files, leave them out and note it.
- Never use `--no-verify`, never force push, and never amend a pushed commit unless explicitly requested.

## Reusable Workstream Prompt

The orchestrator's reusable subagent prompt lives in `docs/engineering/agents/goal.md` under "Reusable Workstream Prompt". Update both this file and that prompt together when contract rules change.
