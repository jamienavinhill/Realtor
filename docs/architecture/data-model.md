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
| Access policy      | `config/firebase/firestore.rules`           | Client read/write boundaries; Admin SDK ingestion bypasses rules.                                  |

**Rule:** UI and API routes do not write provider-shaped listings directly. Ingestion scripts and `/api/ingest/*` routes call adapters → validators → repositories.

## Implemented Collections

| Path                      | Contract          | Read                         | Write (today)                                                               | Repository                     |
| ------------------------- | ----------------- | ---------------------------- | --------------------------------------------------------------------------- | ------------------------------ |
| `properties/{listingId}`  | `ListingProperty` | public list/get              | server-only (Admin SDK): ingestion + `/api/properties` commit/delete (WS16) | `lib/repositories/listings.ts` |
| `alerts/{alertId}`        | `PropertyAlert`   | owner (`userId == auth.uid`) | owner only                                                                  | `lib/repositories/alerts.ts`   |
| `alert_matches/{matchId}` | `AlertMatch`      | owner                        | Admin SDK only                                                              | `lib/repositories/matches.ts`  |
| `ingest_runs/{runId}`     | `IngestRun`       | denied to clients            | Admin SDK only                                                              | `lib/repositories/runs.ts`     |

`config/firebase/firestore.rules` also carries an explicit server-only deny block for `provider_quota/{YYYY-MM}` (RealtyAPI monthly budget accounting) so the base access model matches the Collection Map. Its `ProviderQuotaMonth` contract type and repository land with WS5 — the rules deny is intentionally in place ahead of the writer so the path is never client-readable.

### Provider-ingested listing fields

Server ingestion (RealtyAPI backfill/daily refresh) requires these provenance and dedupe fields on every write:

- `sourceProvider`, `sourceUrl`, `sourceListingId`, `ingestedAt`
- `media[]` (real listing URLs only)
- `rawHash` (SHA-256 of normalized provider payload)
- `dedupeKey` (stable provider-scoped key, e.g. `realtyapi:{listingId}`)
- `provenance` (`providerRunId`, `keyAlias`, `fetchPage` when applicable)
- `radiusCenter`, `distanceMiles` for geo-scoped sweeps

The manual Gmail-scan / paste-commit flow produces leaner Gemini-extracted drafts; WS16 routes these through server validation: `POST /api/properties` (`action: commit`, Firebase ID-token verified) re-validates and re-provenances each draft via `lib/ingest/manual-normalize.ts` (synthesizing `source`, `sourceProvider`, `dedupeKey`, `rawHash`, timestamps) and writes via the Admin SDK. Client writes to `properties/*` are denied by the rules. See `auth-and-secrets.md`.

### Free-lane enrichment and history (additive, optional)

Two optional fields extend `ListingProperty` without breaking existing documents:

- `enrichment` — Gemini/web-search supplements, **always cited** and never presented as provider-verified. Carries `schools[]`, `neighborhood`, `walkability`, `commuteNotes`, a required `sources[]` array (`{ field, url, provider: "gemini" | "google-search" | "web", fetchedAt }`), and `realtyApiDetailFetchedAt` which gates against re-spending a RealtyAPI property-detail call on the same listing.
- `history[]` — a dated price/status trail (`{ observedAt, price, status, source }`) appended on each refresh so analysis tools accrue real time-series. Validators accept up to 500 entries.

`validateListingProperty` validates both when present and rejects malformed enrichment sources (bad provider, missing citation URL) — keeping the contract backward-compatible with the 88 live listings that carry neither field yet.

### Ingest run records

`IngestRun` documents audit every backfill and daily refresh:

- `type` (`IngestRunType`): `backfill` | `daily` | `email` | `poll` (the email pipeline and safety-net poll write `email`/`poll`)
- `status`: `running` | `completed` | `failed` | `partial`
- `idempotencyKey`, `startedAt`, `finishedAt`
- `keyAliasesUsed`, `quotaUsed`, result counts, `errors[]`

### Account sharing & collaboration (WS18)

A workspace is owned by a single owner `uid` — the owner's existing data IS the shared
workspace. The owner invites others by email and picks a role; a **viewer** is read-only
across the owner's workspace data and an **editor** can do everything the owner can on
that data EXCEPT delete the account or remove/demote the owner.

| Path                                      | Contract        | Read                                      | Write                                                         | Repository                            |
| ----------------------------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `accounts/{ownerUid}/members/{memberUid}` | `AccountMember` | owner + any member                        | owner/editor add/remove ≤ editor; never the owner; Admin SDK  | `lib/repositories/account-members.ts` |
| `invites/{token}`                         | `AccountInvite` | owner + the invited-email user (by token) | client-denied; minted/accepted/revoked via Admin SDK + routes | `lib/repositories/account-members.ts` |

- **Membership-aware rules.** `config/firebase/firestore.rules` gains `canReadWorkspace`
  / `canEditWorkspace` helpers that resolve the caller's role from
  `accounts/{ownerUid}/members/{auth.uid}`. The owner-scoped paths
  (`users/{userId}/profile`, `listingPreferences`, `compareQueue`) and the top-level
  `alerts` / `alert_matches` now allow a viewer to read and an editor to write into the
  owner's workspace. Owner-only delete of the account/profile is preserved;
  `gmailSync` and `provider_quota` stay server-only. The members subcollection write rule
  also forbids `memberUid == ownerUid`, so no client can mint an owner-as-member record.
- **Active-workspace client targeting (WS18 pass 2).** The dashboard resolves an active
  workspace owner uid (`lib/account/active-workspace.ts` → `resolveActiveOwnerUid`,
  default = own uid; or a workspace the user is a member of, via `useWorkspaces`). Every
  per-user listener and write — `alerts` / `alert_matches` (`where userId == activeOwnerUid`),
  and `useListingPreferences({ ownerUid, canWrite })` for `listingPreferences` /
  `compareQueue` — targets that owner's data, so a member viewing an owner's workspace
  truly sees (and, as editor, edits) the owner's data. Writes are owner-pinned (`userId`
  = the workspace owner). A viewer is read-only client-side (`canWrite` false: mutating
  controls hidden) and denied by the rules regardless; `properties` remains a public,
  workspace-independent catalog.
- **Owner-pinned validators.** Member writes by an editor carry the workspace owner's uid
  (not the writer's), so the rules use `*ForOwner` validator variants
  (`isValidListingPreferenceForOwner`, `isValidCompareQueueForOwner`,
  `isValidAlertForOwner`) that pin `userId` to the path owner.
- **Invite tokens** are 32 random bytes (base64url, ~256 bits), unguessable and never
  logged. Invites are minted, accepted (transactional, with a verified-email match), and
  revoked exclusively via the Admin SDK behind the authenticated `/api/account/*` routes;
  clients can only READ an invite (owner, or the invited-email user) to render the accept
  screen.
- **Optional invite email** is sent best-effort via the owner's connected Gmail (reusing
  the WS7 send path + stored encrypted refresh token); a send failure never fails the
  invite and the token-bearing accept URL is never logged.

## Planned Collections (not yet implemented)

These paths are defined in the active roadmap and must follow the same `types/` → `lib/schemas/` → `lib/repositories/` → `config/firebase/firestore.rules` pattern when their workstreams land:

| Path                                         | Contract             | Workstream         |
| -------------------------------------------- | -------------------- | ------------------ |
| `users/{uid}/profile/main`                   | `UserProfile`        | WS6 preseed / WS15 |
| `users/{uid}/listingPreferences/{listingId}` | `ListingUserState`   | WS4                |
| `users/{uid}/compareQueue/main`              | `CompareQueue`       | WS4                |
| `users/{uid}/gmailSync/main`                 | `GmailSync`          | WS7                |
| `provider_quota/{YYYY-MM}`                   | `ProviderQuotaMonth` | WS5                |

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

1. **Additive first** — new fields are optional in validators and `config/firebase/firestore.rules` until backfill scripts populate them.
2. **Backfill scripts** — one-off or idempotent scripts under `scripts/` migrate existing documents; record progress in `ingest_runs` when applicable.
3. **Read-path cutover** — UI and API routes may depend on new fields only after a verification readback confirms coverage.
4. **No destructive renames** — rename fields by writing the new key, backfilling, then deprecating the old key in a later pass.
5. **Dedupe safety** — listing upserts key on `dedupeKey` query before insert; reruns of backfill/daily jobs are idempotent.

## Tests

- `tests/schemas.test.ts` — listing validator (provenance, enrichment, history) over the RealtyAPI fixture
- `tests/realty-normalize.test.ts` — RealtyAPI normalization + raw-payload hashing
- `tests/ingest-schema.test.ts` — ingest run validator (status, quota, run types)
- `tests/env.test.ts` — env validation error surfaces (no secrets required)
- `tests/ingest-auth.test.ts` — ingest token auth helper
- `tests/firestore-rules-structure.test.ts` — base access model + WS4 preference/compare paths + WS18 sharing helpers/paths
- `tests/listing-preferences.test.ts` — WS4 preference/compare validators
- `tests/sharing-schema.test.ts` — WS18 `AccountMember` / `AccountInvite` validators + role/status guards
- `tests/account-members-repo.test.ts` — WS18 role-hierarchy helper (`roleAtOrBelow`)
- `tests/active-workspace.test.ts` — WS18 active-workspace owner-uid resolution + viewer write-gating (client targeting)
- `tests/emulator/sharing-rules-emulator.test.ts` — WS18 owner/editor/viewer/non-member rule proof + pass-2 adversarial cases (emulator)

Run `npm run test` after schema, env, or repository changes. Firestore-rules emulator coverage runs separately under `npm run test:rules`.
