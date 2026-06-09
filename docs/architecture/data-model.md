# Data Model

Abode Alerts stores a shared listing catalog, user-owned alerts and matches, and operator-only ingestion audit records in Firestore. TypeScript interfaces, runtime validators, repositories, and security rules each own a distinct layer — live code is authoritative over this doc.

## Ownership Layers

| Layer              | Location                                    | Responsibility                                                                                     |
| ------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Type contracts     | `types/listings.ts` (+ future `types/*.ts`) | Stable TypeScript shapes consumed by UI, API routes, adapters, and repositories.                   |
| Runtime validators | `lib/schemas/*.ts`                          | `validate*` functions that reject malformed external or Firestore payloads before writes.          |
| Repositories       | `lib/repositories/*.ts`                     | Collection paths, upsert/idempotency logic, and mandatory validation on every Admin SDK write.     |
| Provider adapters  | `lib/providers/*.ts`                        | Fetch third-party data, normalize into `ProviderListingProperty`, validate, and attach provenance. |
| Env readiness      | `lib/env.ts`                                | Fail closed with actionable errors when server secrets or credentials are missing.                 |
| Access policy      | `firestore.rules`                           | Client read/write boundaries; Admin SDK ingestion bypasses rules.                                  |

**Rule:** UI and API routes do not write provider-shaped listings directly. Ingestion scripts and `/api/ingest/*` routes call adapters → validators → repositories.

## Implemented Collections

| Path                      | Contract          | Read                         | Write (today)                                                               | Repository                     |
| ------------------------- | ----------------- | ---------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `properties/{listingId}`  | `ListingProperty` | public list/get              | signed-in client create/update (tightened in WS16); Admin SDK for ingestion | `lib/repositories/listings.ts` |
| `alerts/{alertId}`        | `PropertyAlert`   | owner (`userId == auth.uid`) | owner only                                                                  | `lib/repositories/alerts.ts`   |
| `alert_matches/{matchId}` | `AlertMatch`      | owner                        | Admin SDK only                                                              | `lib/repositories/matches.ts`  |
| `ingest_runs/{runId}`     | `IngestRun`       | denied to clients            | Admin SDK only                                                              | `lib/repositories/runs.ts`     |

### Provider-ingested listing fields

Server ingestion (RealtyAPI backfill/daily refresh) requires these provenance and dedupe fields on every write:

- `sourceProvider`, `sourceUrl`, `sourceListingId`, `ingestedAt`
- `media[]` (real listing URLs only)
- `rawHash` (SHA-256 of normalized provider payload)
- `dedupeKey` (stable provider-scoped key, e.g. `realtyapi:{listingId}`)
- `provenance` (`providerRunId`, `keyAlias`, `fetchPage` when applicable)
- `radiusCenter`, `distanceMiles` for geo-scoped sweeps

Client Gmail/manual extraction paths may write leaner documents today; WS16 will route those through server validation or tighten rules.

### Ingest run records

`IngestRun` documents audit every backfill and daily refresh:

- `type`: `backfill` | `daily` (future: `email`, `poll`)
- `status`: `running` | `completed` | `failed` | `partial`
- `idempotencyKey`, `startedAt`, `finishedAt`
- `keyAliasesUsed`, `quotaUsed`, result counts, `errors[]`

## Planned Collections (not yet implemented)

These paths are defined in the active roadmap and must follow the same `types/` → `lib/schemas/` → `lib/repositories/` → `firestore.rules` pattern when their workstreams land:

| Path                                         | Contract             | Workstream         |
| -------------------------------------------- | -------------------- | ------------------ |
| `users/{uid}/profile/main`                   | `UserProfile`        | WS6 preseed / WS15 |
| `users/{uid}/listingPreferences/{listingId}` | `ListingUserState`   | WS4                |
| `users/{uid}/compareQueue/main`              | `CompareQueue`       | WS4                |
| `users/{uid}/gmailSync/main`                 | `GmailSync`          | WS7                |
| `provider_quota/{YYYY-MM}`                   | `ProviderQuotaMonth` | WS5                |
| `accounts/{ownerUid}/members/{memberUid}`    | `AccountMember`      | WS18               |
| `invites/{token}`                            | `AccountInvite`      | WS18               |

## Validation Boundaries

1. **Provider payloads** — `lib/providers/realty-api.ts` validates search responses, normalizes each result, then runs `validateListingProperty` before returning.
2. **Repository writes** — `upsertListing`, `createIngestRun`, `updateIngestRun`, and `upsertAlertMatch` validate immediately before Firestore `set`.
3. **Ingest API routes** — `/api/ingest/backfill` and `/api/ingest/daily` authenticate with `INGEST_JOB_TOKEN`, call `validateServerEnv()` (503 on failure), then run ingest modules that re-validate at the repository layer.
4. **Operator scripts** — `scripts/backfill-44224.ts` and `scripts/daily-refresh.ts` call the same ingest modules; env is checked before any provider fetch.

## Environment Readiness

`lib/env.ts` (`getServerEnv` / `validateServerEnv`) requires before provider or Admin SDK work:

| Variable                                                                                               | Required | Purpose                                                   |
| ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| `GEMINI_API_KEY`                                                                                       | yes      | Server-side Gemini extraction (`GOOGLE_API_KEY` fallback) |
| `REALTY_API_KEYS` or `rt_*` aliases                                                                    | yes      | RealtyAPI key rotation                                    |
| `INGEST_JOB_TOKEN`                                                                                     | yes      | Protect `/api/ingest/*`                                   |
| `FIREBASE_SERVICE_ACCOUNT_JSON` **or** `PATH_TO_FIREBASE_ADMIN_SDK` / `GOOGLE_APPLICATION_CREDENTIALS` | yes      | Firebase Admin SDK                                        |
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID`                                                     | optional | Permitted public search enrichment                        |

Names only — values live in `.env` (local) or Vercel/GitHub encrypted secrets. See `.env.example`.

## Migration Policy

1. **Additive first** — new fields are optional in validators and `firestore.rules` until backfill scripts populate them.
2. **Backfill scripts** — one-off or idempotent scripts under `scripts/` migrate existing documents; record progress in `ingest_runs` when applicable.
3. **Read-path cutover** — UI and API routes may depend on new fields only after a verification readback confirms coverage.
4. **No destructive renames** — rename fields by writing the new key, backfilling, then deprecating the old key in a later pass.
5. **Dedupe safety** — listing upserts key on `dedupeKey` query before insert; reruns of backfill/daily jobs are idempotent.

## Tests

- `tests/schemas.test.ts` — listing validator + RealtyAPI normalization fixture
- `tests/ingest-auth.test.ts` — ingest token auth helper
- `tests/env.test.ts` — env validation error surfaces (no secrets required)
- `tests/ingest-schema.test.ts` — ingest run validator

Run `npm run test` after schema, env, or repository changes.
