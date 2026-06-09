import type { ListingEnrichmentSource } from "@/types/listings";
import { GoogleSearchAuthError, mapHttpStatusToGoogleSearchError, ProviderError } from "./errors";

/**
 * Google Programmable Search (Custom Search JSON API) enrichment adapter.
 *
 * Verified against official docs (2026-06-09):
 * - Endpoint: https://www.googleapis.com/customsearch/v1
 * - Required params: key, cx (engine id), q
 * - Free tier: 100 queries/day; up to 10 results per request (num, max 10).
 *
 * This adapter exists ONLY to gap-fill *non-authoritative* fields (neighborhood
 * narrative, school references, commute notes, general listing context) and it
 * ALWAYS returns the source URLs it drew from. It never invents values, never
 * fabricates a citation, and never overwrites authoritative provider data. When the
 * `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_ENGINE_ID` envs are absent it is a clear,
 * explicit no-op (returns `{ configured: false }`).
 *
 * It lives behind the provider port: UI components never call it directly.
 */
const GOOGLE_SEARCH_ENDPOINT = "https://www.googleapis.com/customsearch/v1";

export interface GoogleSearchConfig {
  apiKey?: string;
  engineId?: string;
}

export interface GoogleSearchCitation {
  /** Result title as returned by the API (never synthesized). */
  title: string;
  /** Source URL — always present; this is the citation. */
  url: string;
  /** Result snippet as returned by the API, when provided. */
  snippet?: string;
  /** Display host for the source, when provided. */
  displayLink?: string;
}

export interface GoogleSearchResult {
  /** False when search envs are absent — a clear no-op, not an error. */
  configured: boolean;
  /** The exact query string sent (echoed for auditability). */
  query: string;
  /** Citations drawn from the API. Empty when no results or not configured. */
  citations: GoogleSearchCitation[];
  /**
   * Enrichment-source records ready to append to `ListingProperty.enrichment.sources`.
   * Every entry carries a real URL and `provider: "google-search"`.
   */
  sources: ListingEnrichmentSource[];
}

interface CustomSearchApiItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
}

interface CustomSearchApiResponse {
  items?: CustomSearchApiItem[];
}

export interface GoogleSearchClientOptions {
  config?: GoogleSearchConfig;
  /** Override fetch for tests; defaults to global fetch. No live HTTP in unit tests. */
  fetchImpl?: typeof fetch;
}

function readConfigFromEnv(): GoogleSearchConfig {
  return {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY?.trim() || undefined,
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || undefined,
  };
}

export class GoogleSearchClient {
  private readonly config: GoogleSearchConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GoogleSearchClientOptions = {}) {
    this.config = options.config ?? readConfigFromEnv();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** True only when both the API key and the engine id are present. */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.engineId);
  }

  /**
   * Run an enrichment search. `field` labels which non-authoritative listing field
   * the lookup is meant to support (e.g. "neighborhood", "schools") and is recorded
   * on every citation so provenance survives. `num` is clamped to the API max of 10.
   */
  async search(
    query: string,
    field: string,
    options?: { num?: number; fetchedAt?: string },
  ): Promise<GoogleSearchResult> {
    const trimmedQuery = query.trim();
    if (!this.isConfigured()) {
      // Clear, explicit no-op — never throws, never invents.
      return { configured: false, query: trimmedQuery, citations: [], sources: [] };
    }

    if (!trimmedQuery) {
      return { configured: true, query: "", citations: [], sources: [] };
    }

    const num = Math.min(Math.max(options?.num ?? 5, 1), 10);
    const url = new URL(GOOGLE_SEARCH_ENDPOINT);
    url.searchParams.set("key", this.config.apiKey as string);
    url.searchParams.set("cx", this.config.engineId as string);
    url.searchParams.set("q", trimmedQuery);
    url.searchParams.set("num", String(num));

    const response = await this.fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      throw mapHttpStatusToGoogleSearchError(response.status, body);
    }

    const payload = (await response.json()) as CustomSearchApiResponse;
    const fetchedAt = options?.fetchedAt ?? new Date().toISOString();

    const citations: GoogleSearchCitation[] = [];
    const sources: ListingEnrichmentSource[] = [];

    for (const item of payload.items ?? []) {
      // A result with no URL cannot be cited — skip it rather than fabricate one.
      if (!item.link) continue;
      citations.push({
        title: item.title ?? item.link,
        url: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink,
      });
      sources.push({
        field,
        url: item.link,
        provider: "google-search",
        fetchedAt,
      });
    }

    return { configured: true, query: trimmedQuery, citations, sources };
  }
}

export { GoogleSearchAuthError, mapHttpStatusToGoogleSearchError, ProviderError };
