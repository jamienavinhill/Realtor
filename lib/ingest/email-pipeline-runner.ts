import type { IngestRun, IngestRunType, ProviderListingProperty } from "@/types/listings";
import { getServerEnv } from "@/lib/env";
import { GmailClient, refreshTokenAccessProvider, parseGmailMessage } from "@/lib/gmail/client";
import { composeGmailQuery, DEFAULT_PLATFORM_SELECTION } from "@/lib/gmail/platforms";
import { createGeminiExtractor } from "@/lib/enrich/extractor";
import { createGoogleSearchEnricher } from "@/lib/enrich/enrich";
import {
  aggregateResults,
  processGmailMessage,
  type IngestNotifier,
  type PipelineDeps,
  type ProcessMessageResult,
} from "@/lib/ingest/pipeline";
import { listActiveAlerts } from "@/lib/repositories/alerts";
import { findListingByDedupeKey, upsertListing } from "@/lib/repositories/listings";
import { upsertAlertMatch } from "@/lib/repositories/matches";
import {
  getDecryptedRefreshToken,
  getGmailSync,
  upsertGmailSync,
} from "@/lib/repositories/gmail-sync";
import { createIngestRun, updateIngestRun } from "@/lib/repositories/runs";

/**
 * Production wiring for the email pipeline (WS7). Builds real ports and runs the
 * pipeline for a connected user — used by BOTH the Pub/Sub push handler and the manual
 * "Scan Gmail" advanced action, so the two share one code path.
 *
 * RealtyAPI property-detail is intentionally NOT wired as an automatic spend lane here:
 * the WS5 adapter only exposes `/search/bylocation` (discovery), and discovery is free
 * from the emails. The gate + budget plumbing exists in the pipeline; a detail port is
 * supplied only once an authoritative property-detail endpoint is available (WS8 zone
 * refresh owns RealtyAPI spend). Free-lane enrichment (cited) always runs.
 */
export interface EmailRunOptions {
  uid: string;
  /** Run type for the IngestRun record. */
  runType?: IngestRunType;
  /** Max messages to fetch when scanning by query. */
  maxResults?: number;
  /** When set, scan by composed query instead of history (manual scan / first run). */
  useQueryScan?: boolean;
  notifier?: IngestNotifier;
}

export interface EmailRunResult extends ProcessMessageResult {
  runId: string;
  messagesProcessed: number;
  newHistoryId?: string;
}

function newRunId(uid: string): string {
  return `email_${uid}_${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

/**
 * Resolve a GmailClient for a uid from the stored encrypted refresh token + OAuth client
 * creds. Throws a clear error when the prerequisites are not configured (operator must
 * connect the account and set the OAuth env), rather than silently no-op'ing.
 */
async function buildGmailClient(uid: string): Promise<GmailClient> {
  const env = getServerEnv();
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set; cannot mint Gmail access tokens.",
    );
  }
  const refreshToken = await getDecryptedRefreshToken(uid);
  if (!refreshToken) {
    throw new Error(`No stored Gmail refresh token for uid ${uid}; the user must connect Gmail.`);
  }
  return new GmailClient({
    accessTokenProvider: refreshTokenAccessProvider({
      clientId: env.googleOAuthClientId,
      clientSecret: env.googleOAuthClientSecret,
      refreshToken,
    }),
  });
}

function buildDeps(notifier?: IngestNotifier, providerRunId?: string): PipelineDeps {
  const env = getServerEnv();
  return {
    extractor: createGeminiExtractor({ apiKey: env.geminiApiKey }),
    enricher: createGoogleSearchEnricher(),
    listings: {
      async upsert(listing: ProviderListingProperty) {
        return upsertListing(listing);
      },
      async findByDedupeKey(dedupeKey: string) {
        return findListingByDedupeKey(dedupeKey);
      },
    },
    matches: {
      async upsert(match) {
        return upsertAlertMatch(match);
      },
    },
    loadActiveAlerts: listActiveAlerts,
    notifier,
    providerRunId,
  };
}

/**
 * Run the email pipeline for a uid. When `useQueryScan` is true (manual scan or a first
 * run with no historyId), it searches by the composed platform query; otherwise it
 * advances from the stored `historyId` watermark, fetching only newly-arrived messages.
 */
export async function runEmailPipelineForUser(options: EmailRunOptions): Promise<EmailRunResult> {
  const runId = newRunId(options.uid);
  const startedAt = new Date().toISOString();
  const runType: IngestRunType = options.runType ?? "email";

  const baseRun: IngestRun = {
    id: runId,
    type: runType,
    status: "running",
    startedAt,
    idempotencyKey: runId,
    keyAliasesUsed: [],
    quotaUsed: {},
    listingsFetched: 0,
    listingsUpserted: 0,
    listingsSkipped: 0,
    alertMatchesCreated: 0,
    alertMatchesUpdated: 0,
    errors: [],
  };
  await createIngestRun(baseRun);

  const sync = await getGmailSync(options.uid);
  const platformSelection =
    sync?.platformSelection && sync.platformSelection.length > 0
      ? sync.platformSelection
      : DEFAULT_PLATFORM_SELECTION;
  const query = composeGmailQuery({
    platformIds: platformSelection,
    customQuery: sync?.customQuery,
  });

  const client = await buildGmailClient(options.uid);
  const deps = buildDeps(options.notifier, runId);

  const messageIds: string[] = [];
  let newHistoryId: string | undefined;

  const useQueryScan = options.useQueryScan || !sync?.historyId;

  if (useQueryScan) {
    const search = await client.searchMessages(query, options.maxResults ?? 10);
    for (const m of search.messages ?? []) messageIds.push(m.id);
  } else {
    let pageToken: string | undefined;
    do {
      const history = await client.listHistory(sync!.historyId as string, { pageToken });
      newHistoryId = history.historyId ?? newHistoryId;
      for (const record of history.history ?? []) {
        for (const added of record.messagesAdded ?? []) {
          messageIds.push(added.message.id);
        }
      }
      pageToken = history.nextPageToken;
    } while (pageToken);
  }

  // Dedupe message ids (history can repeat across records).
  const uniqueIds = Array.from(new Set(messageIds));
  const perMessage: ProcessMessageResult[] = [];
  // A message is "lost" only when fetching/processing it threw (transient: API error,
  // network, upsert failure) — i.e. it was NOT fully handled and a re-fetch could recover
  // it. Validation skips (`listingsSkipped`) and best-effort enrichment errors are
  // deterministic/non-blocking and must NOT hold the watermark, or the same push would
  // redeliver forever. We hold the historyId watermark when any message was lost.
  let messagesLost = 0;

  for (const id of uniqueIds) {
    try {
      const detail = await client.getMessage(id);
      const parsed = parseGmailMessage(detail);
      const result = await processGmailMessage(parsed, deps);
      perMessage.push(result);
    } catch (error) {
      messagesLost += 1;
      perMessage.push({
        listingsUpserted: 0,
        listingsCreated: 0,
        listingsSkipped: 0,
        alertMatchesCreated: 0,
        alertMatchesUpdated: 0,
        realtyDetailCalls: 0,
        errors: [
          `Failed to fetch/process message ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      });
    }
  }

  const aggregate = aggregateResults(perMessage);
  const finishedAt = new Date().toISOString();
  const status =
    aggregate.errors.length > 0 && aggregate.listingsUpserted === 0 ? "partial" : "completed";

  await updateIngestRun(
    runId,
    {
      status,
      finishedAt,
      listingsFetched: uniqueIds.length,
      listingsUpserted: aggregate.listingsUpserted,
      listingsSkipped: aggregate.listingsSkipped,
      alertMatchesCreated: aggregate.alertMatchesCreated,
      alertMatchesUpdated: aggregate.alertMatchesUpdated,
      errors: aggregate.errors.slice(0, 100),
    },
    baseRun,
  );

  // Advance the historyId watermark ONLY when no message was lost — otherwise the next
  // push must re-cover the missed mail (no message loss). When a message was lost we still
  // record `lastProcessedAt` (heartbeat) but deliberately leave `historyId` unchanged so
  // the next listHistory replays from the same point.
  const advanceWatermark = messagesLost === 0 && Boolean(newHistoryId);
  if (advanceWatermark) {
    await upsertGmailSync(options.uid, {
      historyId: newHistoryId,
      lastProcessedAt: finishedAt,
    });
  } else {
    await upsertGmailSync(options.uid, { lastProcessedAt: finishedAt });
  }

  return {
    ...aggregate,
    runId,
    messagesProcessed: uniqueIds.length,
    // Only report the advanced watermark to callers when we actually committed it.
    newHistoryId: advanceWatermark ? newHistoryId : undefined,
  };
}
