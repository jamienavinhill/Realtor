export type ProviderName = "realtyapi" | "google-search";

/**
 * Provider error taxonomy. Distinct subclasses model rate-limit, auth,
 * provider-outage, malformed-payload, no-results, and quota-exhaustion so callers
 * (adapters, ingest pipeline) can branch on `code`/instanceof rather than parsing
 * messages. Shared across the RealtyAPI and Google-search ports.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode?: number,
    readonly retryable = false,
    readonly provider: ProviderName = "realtyapi",
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class RealtyApiRateLimitError extends ProviderError {
  constructor(message = "RealtyAPI rate limit exceeded", statusCode = 429) {
    super(message, "RATE_LIMIT", statusCode, true);
    this.name = "RealtyApiRateLimitError";
  }
}

export class RealtyApiAuthError extends ProviderError {
  constructor(message = "RealtyAPI authentication failed", statusCode = 401) {
    super(message, "AUTH", statusCode, false);
    this.name = "RealtyApiAuthError";
  }
}

export class RealtyApiOutageError extends ProviderError {
  constructor(message = "RealtyAPI service unavailable", statusCode = 503) {
    super(message, "OUTAGE", statusCode, true);
    this.name = "RealtyApiOutageError";
  }
}

export class RealtyApiMalformedPayloadError extends ProviderError {
  constructor(message = "RealtyAPI returned a malformed payload") {
    super(message, "MALFORMED_PAYLOAD", undefined, false);
    this.name = "RealtyApiMalformedPayloadError";
  }
}

export class RealtyApiNoResultsError extends ProviderError {
  constructor(message = "RealtyAPI returned no results for the search criteria") {
    super(message, "NO_RESULTS", undefined, false);
    this.name = "RealtyApiNoResultsError";
  }
}

export class RealtyApiQuotaExhaustedError extends ProviderError {
  constructor(message = "All RealtyAPI keys have exhausted their monthly quota") {
    super(message, "QUOTA_EXHAUSTED", undefined, false);
    this.name = "RealtyApiQuotaExhaustedError";
  }
}

export function mapHttpStatusToProviderError(status: number, body?: string): ProviderError {
  if (status === 401 || status === 403) {
    return new RealtyApiAuthError(body || "RealtyAPI authentication failed", status);
  }
  if (status === 429) {
    return new RealtyApiRateLimitError(body || "RealtyAPI rate limit exceeded", status);
  }
  if (status >= 500) {
    return new RealtyApiOutageError(body || "RealtyAPI service unavailable", status);
  }
  return new ProviderError(
    body || `RealtyAPI request failed with status ${status}`,
    "REQUEST_FAILED",
    status,
  );
}

// --- Google Programmable Search (Custom Search JSON API) error taxonomy ---

export class GoogleSearchAuthError extends ProviderError {
  constructor(message = "Google Search authentication failed", statusCode = 403) {
    super(message, "AUTH", statusCode, false, "google-search");
    this.name = "GoogleSearchAuthError";
  }
}

export class GoogleSearchRateLimitError extends ProviderError {
  constructor(message = "Google Search daily query quota exceeded", statusCode = 429) {
    super(message, "RATE_LIMIT", statusCode, true, "google-search");
    this.name = "GoogleSearchRateLimitError";
  }
}

export class GoogleSearchOutageError extends ProviderError {
  constructor(message = "Google Search service unavailable", statusCode = 503) {
    super(message, "OUTAGE", statusCode, true, "google-search");
    this.name = "GoogleSearchOutageError";
  }
}

export function mapHttpStatusToGoogleSearchError(status: number, body?: string): ProviderError {
  if (status === 401 || status === 403) {
    return new GoogleSearchAuthError(body || "Google Search authentication failed", status);
  }
  // The Custom Search API returns 429 for daily-quota exhaustion.
  if (status === 429) {
    return new GoogleSearchRateLimitError(
      body || "Google Search daily query quota exceeded",
      status,
    );
  }
  if (status >= 500) {
    return new GoogleSearchOutageError(body || "Google Search service unavailable", status);
  }
  return new ProviderError(
    body || `Google Search request failed with status ${status}`,
    "REQUEST_FAILED",
    status,
    false,
    "google-search",
  );
}
