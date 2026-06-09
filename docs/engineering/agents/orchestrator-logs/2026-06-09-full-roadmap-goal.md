# Orchestrator Log: Full Roadmap Goal

Date: 2026-06-09
Status: Re-run of completed workstreams COMPLETE

## Directive

Re-run the "completed" workstreams (Implementation Order items 1–8: WS1, WS2, WS3, WS6, plus the WS10/WS11 baselines) to true production shape. Each stream got ≥2 fresh-context AUDIT/EXECUTE subagent passes, serialized on shared surfaces, gated and checkpointed. Orchestrator coordinated only; subagents executed.

## Result — all six streams CLOSED (two fresh-context passes each)

| Stream | Commits | What the re-run actually fixed |
| --- | --- | --- |
| WS3 (contracts/schemas/env/rules) | `12b64b3c`, `323b3703` | Added missing `enrichment`/`history` listing fields + `email`/`poll` run types with validators/tests; added explicit `provider_quota` server-only rules deny; base-model rule tests; data-model doc reconciled. |
| WS1 (tooling/docs) | `c4978d0e`, `6298b1d7` | **Fixed the RED verify gate** (recharts needed `react-is@19`; `@firebase/rules-unit-testing`→^5 for firebase@12, no shims); relocated emulator test out of the default `test` glob; untracked `tsconfig.tsbuildinfo`; added `development-workflow.md`; lockfile sync. |
| WS2 (Vercel/env/admin) | `098209fc`, `b31ac438` | Constant-time `INGEST_JOB_TOKEN` compare; firebase-admin init hardened (no private-key echo, correct named DB); auth-domain reconcile incl. local dev; `env-and-deploy.md`; +7 auth tests. |
| WS6 (44224 backfill) | `59a15a8a`, `e426739a` | **Fixed two real bugs**: orphaned `running` ingest-run on error; `--dry-run` was still calling RealtyAPI (burning the ~250/MONTH budget) — now side-effect-free. DI seam + idempotency/lifecycle tests; `provider-ingestion.md`. |
| WS11 (UI honesty) | `da44fca1`, `072b172e` | Removed residual AI-Studio/Austin/Realty-Monitor strings from shipped paths (Calendar copy, extraction-prompt sample, `aistudio-build` User-Agent); confirmed no static/stock data, honest empty/no-media states, 44224 defaults. |
| WS10 (auth chrome/theme) | `d3a7a40d`, `e877b514` | Rebuilt header to spec: "Sign in" label only, mutually-exclusive sign-in/avatar, `ProfileMenu` (name + Sign out, Escape/click-outside, aria), removed Connect/logout header buttons, icon-only accent picker (no duplicate swatch). Signed-out browser smoke. |

Test count grew 30 → 49 across the re-run. `npm run verify` GREEN at closeout.

## Carried forward (NOT in completed-re-run scope — for their own streams)

- **WS5 (not a completed stream):** `lib/providers/quota.ts` is in-memory and labels the RealtyAPI budget "daily" while the real limit is ~250 req/**MONTH** per key — needs persisted monthly accounting (`provider_quota/{YYYY-MM}`). Dedupe key is provider-id-only, not the address/coords/URL composite the roadmap claims. The `provider_quota` type/repo and a `google-search.ts` enrichment adapter are still unbuilt.
- **WS4:** `compareQueue` write returns PERMISSION_DENIED in `npm run test:rules` — a `firestore.rules` gap to close when WS4 is finished.
- **Operator-pending (account/dashboard, cannot be done in code):** run `scripts/add-auth-domains.ts` and `scripts/vercel-listings-check.ts` against production; set a GCP budget alert; run a live 44224 re-backfill + Firestore readback.
- **Forward workstreams unbuilt:** WS5, WS7, WS8, WS9, WS12, WS13, WS14, WS15, WS16, WS17, WS18 (per Implementation Order items 10–22).

## Notes

- Commits are local on `main`; not pushed (push auto-deploys to Vercel and was not requested).
- Pre-existing dirty `AGENTS.md` and `docs/engineering/agents/goal.md` (session/prior-orchestrator artifacts) left untouched throughout.
- No real secrets in tracked files: `firebase-applet-config.json` apiKey is public client config; `rt_alpha123`/`rt_beta456` are fake test fixtures.
- A stale `node` process from 2026-06-08 squats port 3000 (not serving HTTP); not ours — left alone.
