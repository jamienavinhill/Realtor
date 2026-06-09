# Provider Ingestion (44224 Baseline Backfill)

How the RealtyAPI-backed baseline backfill runs, what it persists, and how to operate
it safely. This is a durable operations doc; the live code under `lib/ingest/`,
`lib/providers/`, and `lib/repositories/` remains authoritative. No secret values
appear here or in any tracked file.

## What the backfill does

`runBackfill44224` (`lib/ingest/backfill.ts`) populates the shared `properties`
catalog with the current active listings within **10 miles of ZIP 44224** (center
Stow, OH — `BASELINE_CENTER` in `lib/ingest/constants.ts`). It:

1. Opens a run record in `ingest_runs` (status `running`) via the runs repository.
2. Fetches active listings from the RealtyAPI adapter (`lib/providers/realty-api.ts`),
   which paginates `/search/bylocation`, rotates across keys, and normalizes each
   result into a validated `ProviderListingProperty`.
3. Upserts listings through `lib/repositories/listings.ts` (dedupe-aware).
4. Closes the run record with counts, key aliases used, quota used, and errors
   (status `completed` / `partial` / `failed`).

Every persisted listing carries full provenance: `sourceProvider`, `sourceUrl`,
`sourceListingId`, `ingestedAt`, `media[]`, `rawHash`, `dedupeKey`, `radiusCenter`,
`distanceMiles`, and `provenance` (`keyAlias`, `providerRunId`, `fetchPage`). Media is
real source URLs only — there is no stock/placeholder media path.

## Idempotency and dedupe

Re-running the backfill updates existing records rather than duplicating them. This
relies on two deterministic keys derived from the provider payload:

- **`dedupeKey`** = `realtyapi:<listing_id || property_id>` — stable across runs,
  independent of timestamp, key alias, or run id.
- **Doc id** = the sanitized provider listing id — the upsert writes to the same
  `properties/<id>` document on every run.

`upsertListing` looks up an existing record by `dedupeKey`, preserves the original
`createdAt`, and merges the fresh payload (refreshing `updatedAt`/`ingestedAt`). The
adapter also de-dupes within a single fetch via an in-memory `seenDedupeKeys` set, so a
listing that appears on multiple pages is written once. `rawHash` changes only when the
underlying provider payload changes, giving an audit signal for "what actually moved."

Determinism is covered by `tests/backfill-idempotency.test.ts` (sanitized fixtures, no
live calls). Normalization shape is covered by `tests/realty-normalize.test.ts`. The run
lifecycle itself — dry-run cost safety (no client/fetch/upsert/run-record on a dry run)
and the "never left `running`" guarantee on success/partial/error paths — is covered at
the function level by `tests/backfill-run.test.ts`, which injects in-memory
env/provider/repository fakes (zero live calls, zero writes) via `BackfillOptions.deps`.

> Dedupe is keyed on the provider listing/property id today. A composite key that also
> folds normalized address + coordinates + canonical source URL is a **WS5 adapter**
> concern (the key is built in `lib/providers/realty-api.ts`); see the roadmap's WS5
> findings. The current key is robust and deterministic for the single-provider
> RealtyAPI baseline.

## Running it

Operator script (local), via the project env loader (`--env-file=.env`):

```bash
# Side-effect-free preview: validates env + run wiring, writes nothing, and makes
# NO live RealtyAPI calls (preserves the scarce monthly provider budget).
npm run backfill -- --dry-run

# Real run: fetches from RealtyAPI and upserts to Firestore.
npm run backfill
```

The script exits non-zero only when the run status is `failed`. A `--dry-run` returns
`status: "completed"` with zero fetched/upserted and performs no writes.

Hosted trigger: `POST /api/ingest/backfill` (`app/api/ingest/backfill/route.ts`),
protected by `INGEST_JOB_TOKEN` (constant-time check via `lib/ingest/auth.ts`). Without
a valid token it returns **401**; when the token env is unset it returns **503**. A
`?dryRun=true` query runs the same side-effect-free preview. The token is server-side
only and is never printed.

## Cost posture

RealtyAPI's free plan is **~250 requests/MONTH per key** (not per day — verify in the
key dashboards). The backfill spends only a few pages per run, but the budget is
monthly and scarce, so:

- Use `--dry-run` for any wiring/env check — it spends zero provider quota.
- Treat real backfill runs as deliberate; discovery of new listings comes free from
  the email pipeline, not from re-sweeping RealtyAPI.

> Known WS5 gap: `lib/providers/quota.ts` is in-memory and labels the budget "daily"
> (`DEFAULT_DAILY_QUOTA_PER_KEY = 250`). It does not enforce a real, persisted monthly
> ceiling. Tracked as a WS5 finding; not fixed here.

## Verification

- `npm run test` — includes `tests/backfill-idempotency.test.ts`,
  `tests/backfill-run.test.ts` (run lifecycle + dry-run cost safety, injected fakes),
  and `tests/realty-normalize.test.ts` (no live calls).
- `npm run backfill -- --dry-run` — env + wiring smoke, zero side effects.
- A real run + Firestore readback (count + sample-record provenance audit) is
  **operator-pending**: it needs live RealtyAPI credentials/quota.
