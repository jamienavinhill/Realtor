# Documentation Index

Durable docs point to directories, not transient dated files — open the directory for the current artifact.

- `docs/roadmaps/` — active implementation roadmap: data contracts, schemas, Firestore collection map, workstreams, and acceptance criteria.
- `docs/engineering/standards/` — durable engineering standards (planning style, report style, docs standards).
- `docs/engineering/agents/` — agent operating docs and run logs.
- `docs/research/` — research notes (e.g. Gmail/listing parsing in `INBOX_PARSING.md`).
- `docs/operations/` — durable operations docs. `development-workflow.md` covers local setup, the quality gates, and the verify release gate; `env-and-deploy.md` covers the env canon and deploy model; `provider-ingestion.md` covers the 44224 baseline backfill (provenance, idempotency, dry-run, cost posture).
- `docs/architecture/`, `docs/decisions/` — durable architecture and decision records, added as the roadmap executes.

Repository-owned configuration that is not tool-discovery-fixed lives under `config/`:
Firebase client config and Firestore rules are in `config/firebase/`; app metadata
for external tooling is in `config/app/`.
