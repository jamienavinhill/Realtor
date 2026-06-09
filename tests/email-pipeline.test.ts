import assert from "node:assert/strict";
import test from "node:test";
import { processGmailMessage, type PipelineDeps } from "@/lib/ingest/pipeline";
import type { ExtractedListingDraft, ListingExtractor } from "@/lib/enrich/extractor";
import type { ListingEnricher } from "@/lib/enrich/enrich";
import type { ParsedGmailMessage } from "@/lib/gmail/client";
import type {
  AlertMatch,
  ListingProperty,
  ProviderListingProperty,
  PropertyAlert,
} from "@/types/listings";

const MESSAGE: ParsedGmailMessage = {
  id: "msg_001",
  subject: "New listing in Stow",
  from: "alerts@redfin.com",
  date: "2026-06-09T12:00:00.000Z",
  body: "sanitized fixture body — no real PII",
};

const DRAFT: ExtractedListingDraft = {
  title: "Renovated Colonial",
  address: "123 Maple St",
  city: "Stow",
  state: "OH",
  zipCode: "44224",
  price: 350000,
  beds: 3,
  baths: 2,
  sqft: 1800,
  propertyType: "Single Family",
  description: "Updated kitchen",
  imageUrl: "https://media.example.test/listing-001.jpg",
  sourceUrl: "https://www.redfin.com/OH/Stow/123-Maple-St/home/123",
  yearBuilt: 1996,
};

function fakeExtractor(drafts: ExtractedListingDraft[]): ListingExtractor {
  return {
    async extract() {
      return drafts;
    },
  };
}

const noopEnricher: ListingEnricher = {
  async enrich() {
    return { neighborhood: "Quiet, tree-lined", sources: [] };
  },
};

interface StoreState {
  upserts: ProviderListingProperty[];
  matches: AlertMatch[];
  store: Map<string, ListingProperty>;
}

function buildDeps(
  state: StoreState,
  alerts: PropertyAlert[],
  realtyDetail?: PipelineDeps["realtyDetail"],
): PipelineDeps {
  return {
    extractor: fakeExtractor([DRAFT]),
    enricher: noopEnricher,
    realtyDetail,
    loadActiveAlerts: async () => alerts,
    listings: {
      async upsert(listing) {
        state.upserts.push(listing);
        const created = !state.store.has(listing.dedupeKey);
        state.store.set(listing.dedupeKey, { ...listing, id: listing.id });
        return { id: listing.id, dedupeKey: listing.dedupeKey, created };
      },
      async findByDedupeKey(dedupeKey) {
        return state.store.get(dedupeKey) ?? null;
      },
    },
    matches: {
      async upsert(match) {
        const created = !state.matches.find((m) => m.id === match.id);
        state.matches.push(match);
        return { created };
      },
    },
    providerRunId: "run_test_1",
  };
}

test("happy path: extracts, normalizes with provenance+dedupe, enriches, upserts, matches an alert", async () => {
  const state: StoreState = { upserts: [], matches: [], store: new Map() };
  const alert: PropertyAlert = {
    id: "alert_1",
    userId: "user_1",
    name: "Stow under 400k",
    isActive: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    criteria: { maxPrice: 400000, city: "Stow", beds: 3 },
  };

  const result = await processGmailMessage(MESSAGE, buildDeps(state, [alert]), {
    platformId: "redfin",
  });

  assert.equal(result.listingsUpserted, 1);
  assert.equal(result.listingsCreated, 1);
  assert.equal(result.alertMatchesCreated, 1);
  assert.equal(result.realtyDetailCalls, 0, "no RealtyAPI spend when media + facts present");

  const upserted = state.upserts[0];
  assert.equal(upserted.sourceProvider, "gmail:redfin");
  assert.equal(upserted.source, "gmail");
  assert.ok(upserted.dedupeKey.startsWith("email:"));
  assert.equal(upserted.provenance?.providerRunId, "run_test_1");
  assert.equal(upserted.media[0].url, DRAFT.imageUrl);
  assert.equal(upserted.enrichment?.neighborhood, "Quiet, tree-lined");
  assert.ok(upserted.history && upserted.history.length === 1);

  assert.equal(state.matches[0].alertId, "alert_1");
  assert.equal(state.matches[0].listingId, upserted.id);
});

test("returns cleanly with no writes when the email contains no listing", async () => {
  const state: StoreState = { upserts: [], matches: [], store: new Map() };
  const deps = { ...buildDeps(state, []), extractor: fakeExtractor([]) };
  const result = await processGmailMessage(MESSAGE, deps);
  assert.equal(result.listingsUpserted, 0);
  assert.equal(result.errors.length, 0);
  assert.equal(state.upserts.length, 0);
});

test("idempotent re-run: same message does not duplicate, and never re-spends RealtyAPI", async () => {
  const state: StoreState = { upserts: [], matches: [], store: new Map() };
  // A draft missing media so the gate WOULD fire on the first pass.
  const draftNoMedia = { ...DRAFT, imageUrl: "" };
  let detailCalls = 0;
  const realtyDetail: PipelineDeps["realtyDetail"] = {
    async budgetAvailable() {
      return true;
    },
    async fetchDetail() {
      detailCalls += 1;
      return {
        patch: { media: [{ url: "https://media.example.test/from-realty.jpg" }] },
        detailFetchedAt: "2026-06-09T12:05:00.000Z",
      };
    },
  };

  const deps: PipelineDeps = {
    ...buildDeps(state, [], realtyDetail),
    extractor: fakeExtractor([draftNoMedia]),
  };

  const first = await processGmailMessage(MESSAGE, deps);
  assert.equal(first.realtyDetailCalls, 1, "first pass spends one detail call for missing media");
  assert.equal(detailCalls, 1);

  // Second pass: the persisted realtyApiDetailFetchedAt guard must prevent re-spend.
  const second = await processGmailMessage(MESSAGE, deps);
  assert.equal(second.realtyDetailCalls, 0, "second pass must not re-spend RealtyAPI");
  assert.equal(detailCalls, 1, "fetchDetail must not be called again");
  assert.equal(second.listingsCreated, 0, "same dedupe key -> update, not create");
});
