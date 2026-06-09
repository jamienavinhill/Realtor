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

- **`dedupeKey`** = a **composite** of normalized street address + locality + rounded
  coordinates (~11 m) + canonical source URL, built by `buildDedupeKey` in
  `lib/providers/realty-api.ts`. Format:
  `realtyapi:addr=<...>|geo=<lat,lng>|url=<host/path>`. It is stable across runs and
  independent of timestamp, key alias, or run id. Because it is keyed on the physical
  listing rather than the provider id, the same home collapses to one record even if
  the provider re-issues it under a different `listing_id`/`property_id`. A sparse
  payload with no address/coords/url falls back to `realtyapi:id=<id>`.
- **Doc id** = the sanitized provider listing id (falling back to `property_id`) — the
  upsert writes to the same `properties/<id>` document on every run.

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

Composite-dedupe determinism is covered by `tests/backfill-idempotency.test.ts`
(including a re-issue under a different provider id collapsing to one key, and the
sparse-payload id fallback).

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

RealtyAPI's free plan is **250 requests/MONTH per key** (not per day — verified
against the realtyapi.io pricing page on 2026-06-09). With ~8 keys the effective
budget is ~2,000 calls/month. The backfill spends only a few pages per run, but the
budget is monthly and scarce, so:

- Use `--dry-run` for any wiring/env check — it spends zero provider quota.
- Treat real backfill runs as deliberate; discovery of new listings comes free from
  the email pipeline, not from re-sweeping RealtyAPI.

### Durable monthly quota accounting

The monthly budget is **persisted in Firestore** so it survives serverless cold
starts — an in-memory counter alone would reset every invocation and silently
overspend. One document per calendar month lives at `provider_quota/{YYYY-MM}`
(`ProviderQuotaMonth`: `perKey`, `monthlyLimitPerKey`, `totalSpent`, `updatedAt`).
This collection is **server-only** — never client-readable (the `provider_quota` deny
is in `config/firebase/firestore.rules`).

Before every live RealtyAPI call the adapter (`lib/providers/realty-api.ts`) reserves
one call against the next key via `MonthlyQuotaStore.reserve`
(`lib/repositories/provider-quota.ts`), which runs a Firestore transaction so
concurrent invocations cannot both slip past the per-key ceiling. When a key is at its
monthly limit the adapter rotates to the next key; when **all** keys are exhausted the
fetch **degrades to a PARTIAL result** (listings already gathered are returned, the run
is marked `partial`, and a monthly-quota reason is recorded) rather than crashing or
silently failing. The in-memory `QuotaTracker` remains only as a per-run rotation fast
path; the Firestore store is the durable authority.

The store exposes an injection seam (`MonthlyQuotaStore` interface +
`createInMemoryMonthlyQuotaStore`) so quota behavior is unit-tested with **no live
Firestore or RealtyAPI** — see `tests/provider-quota.test.ts` and
`tests/realty-key-rotation.test.ts` (deterministic rotation, stop-before-ceiling,
no key-value leakage).

## Google public-search enrichment (optional, free lane)

`lib/providers/google-search.ts` is the permitted public-search enrichment port
(Google Custom Search JSON API — endpoint `https://www.googleapis.com/customsearch/v1`,
free tier 100 queries/day, up to 10 results/request; verified 2026-06-09). It is
**behind the provider port** — UI never calls it directly.

- Activates only when **both** `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID`
  are set; otherwise it is a clear no-op (`configured: false`, no citations, never
  throws).
- Fills **only missing non-authoritative** fields (neighborhood narrative, school
  references, commute notes). It never overwrites authoritative provider data and never
  invents values.
- **Always returns source URLs/citations.** Every result without a usable URL is
  dropped rather than cited, and each citation yields a `ListingEnrichmentSource`
  (`provider: "google-search"`, `field`, `url`, `fetchedAt`) ready to append to
  `ListingProperty.enrichment.sources`.
- Errors map through the shared taxonomy (`GoogleSearchAuthError`,
  `GoogleSearchRateLimitError` for daily-quota 429, `GoogleSearchOutageError`).

Covered by `tests/google-search.test.ts` (citation shape, env-absent no-op, error
mapping) — no live calls.

## Verification

- `npm run test` — includes `tests/backfill-idempotency.test.ts`,
  `tests/backfill-run.test.ts` (run lifecycle + dry-run cost safety, injected fakes),
  `tests/realty-normalize.test.ts`, `tests/realty-key-rotation.test.ts` (rotation +
  monthly-quota stop, injected in-memory quota store + stub fetch),
  `tests/provider-quota.test.ts` (validator + stop-before-ceiling),
  `tests/google-search.test.ts` (citation shape + env-absent no-op), and
  `tests/provider-errors.test.ts` (taxonomy mapping) — all no live calls.
- `npm run backfill -- --dry-run` — env + wiring smoke, zero side effects.
- A real run + Firestore readback (count + sample-record provenance audit) is
  **operator-pending**: it needs live RealtyAPI credentials/quota.
