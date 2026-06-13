# Documentation Index

Durable docs point to directories, not transient dated files — open the directory for the current artifact.

- `docs/roadmaps/` — active implementation roadmap(s): the historical full WS1–WS19 narrative lives in the 2026-06-08 file (preserved until retirement per its own rules). For the current production closeout/operator phase (2026-06-12): `docs/roadmaps/abode-alerts-production-closeout.md` (durable non-dated; focused on the exact remaining operator/account-console items, first CI/push, live OAuth-gated + deployed smokes, Gmail watch/Pub/Sub + consent + authorized domains + Vercel env + budget alert, final verification, canon parity, and retirement of the dated file only after this phase's ACs + durable docs carry the rules). The full prior workflow details (WS1–WS19 tasks, exit criteria, checkpoints) are not reduced here — see the 2026-06-08 source + the "Preserved Workflow Fidelity" declaration in the closeout file. (Closeout-8 final verification + canon complete 2026-06-12: gates green, coexisting tree for verif (source + durable in active roadmaps/), retire mv recorded as last post-commit operator step only, class C PASS, all ACs hold; see durable checkpoints + {SCRATCH}/final-continuation-verification-coexist-2026-06-12.log.)
- `docs/engineering/standards/` — durable engineering standards (planning style, report style, docs standards).
- `docs/engineering/agents/` — agent operating docs and run logs.
- `docs/research/` — research notes (e.g. Gmail/listing parsing in `INBOX_PARSING.md`).
- `docs/operations/` — durable operations docs. `development-workflow.md` covers local setup, the quality gates, the full release-gate ladder (CI vs operator/manual), and CI; `release-runbook.md` is the repeatable manual production smoke checklist (mapped to the Acceptance Criteria, incl. the WS18 two-account sharing flow and operator prerequisites); `env-and-deploy.md` covers the env canon and deploy model; `provider-ingestion.md` covers the 44224 baseline backfill (provenance, idempotency, dry-run, cost posture).
- `docs/architecture/` — durable architecture records: `data-model.md` (Firestore contracts + access table) and `auth-and-secrets.md` (auth, secret lanes, encrypted refresh token, rules posture, App Check path). `docs/decisions/` holds decision records, added as the roadmap executes.

Repository-owned configuration that is not tool-discovery-fixed lives under `config/`:
Firebase client config and Firestore rules are in `config/firebase/`; app metadata
for external tooling is in `config/app/`.
