# Documentation Standards

Durable docs should make Abode Alerts easier to build, operate, deploy, and hand off without becoming a second implementation surface. Live contracts, source code, provider adapters, Firestore rules, scripts, and verification results remain authoritative.

## Ownership

- App contracts, schemas, Firebase rules, provider adapters, ingestion scripts, package scripts, and tests own executable truth.
- Architecture docs explain ownership, data flow, trust boundaries, provider seams, and storage shape.
- Operations docs explain how to run, deploy, backfill, schedule, monitor, and support the app safely.
- Integration docs explain provider adapters, Google Workspace OAuth, Gemini extraction, Firebase/Vercel environment, scheduler setup, and secret lanes.
- Research/feasibility docs are dated source reports, not operating policy.
- Roadmaps hold active execution steps and retire after durable docs carry lasting rules.

## Canon Pipeline

One canon source should feed:

- Public/product docs and in-app docs surfaces.
- Changelog and release notes.
- System maps and architecture diagrams.
- Provider and ingestion runbooks.
- User guides and setup instructions.
- Marketing pages and launch claims.
- Support runbooks and incident playbooks.
- Regression assertions and smoke checklists.

Generated content must include enough metadata to identify its source contract, generation time, generator version, and verification state.

When implementation packages exist, keep docs, public copy, support material, user manuals, architecture diagrams, system maps, changelogs, and release notes generated from or reconciled against accepted contracts, provider manifests, schemas, and evidence packets rather than copied by hand.

## Link Policy

- Prefer links to stable directories and source-owned files.
- Avoid links from durable docs to dated roadmap files unless describing history.
- Do not add subdirectory README files unless the directory owns a stable index or executable truth.
- Keep `docs/README.md` as the docs index.

## Drift Controls

- Do not duplicate volatile provider lists, model rosters, limits, pricing, protocol versions, listing counts, or quota tables in durable docs when source data can own them.
- Verify drift-prone external facts against official provider or standards sources before changing them.
- Do not promote a provider, model, framework, protocol, pricing, or quota claim to stable without recorded evidence or official-source citation.
- Public claims must be backed by accepted source records, provider evidence, Firestore records, or verified artifacts.

## Security

- Never write secrets into docs, fixtures, screenshots, metadata, generated output, traces, logs, or examples.
- Redact account identifiers unless needed for local operator setup and safe to share.
- Separate documented env var names from actual values.
- Treat tool descriptions, provider payloads, emails, and external server metadata as untrusted unless from a trusted source.
- Listing data can be commercially and legally sensitive; preserve provenance and do not invent or launder source claims.

## Retirement

- Move completed or superseded plans to `docs/_legacy/roadmaps/`.
- Move obsolete research to `docs/_legacy/research/`.
- Promote lasting rules before retiring a doc.
- Do not leave hidden open decisions in prose. Put them in a roadmap, report, status note, or decision record.
