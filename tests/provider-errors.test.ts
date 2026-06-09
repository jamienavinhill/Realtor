import assert from "node:assert/strict";
import test from "node:test";
import {
  GoogleSearchAuthError,
  GoogleSearchOutageError,
  GoogleSearchRateLimitError,
  mapHttpStatusToGoogleSearchError,
  mapHttpStatusToProviderError,
  ProviderError,
  RealtyApiAuthError,
  RealtyApiMalformedPayloadError,
  RealtyApiNoResultsError,
  RealtyApiOutageError,
  RealtyApiQuotaExhaustedError,
  RealtyApiRateLimitError,
} from "@/lib/providers/errors";

test("RealtyAPI HTTP status maps to the right taxonomy class", () => {
  assert.ok(mapHttpStatusToProviderError(401) instanceof RealtyApiAuthError);
  assert.ok(mapHttpStatusToProviderError(403) instanceof RealtyApiAuthError);
  assert.ok(mapHttpStatusToProviderError(429) instanceof RealtyApiRateLimitError);
  assert.ok(mapHttpStatusToProviderError(500) instanceof RealtyApiOutageError);
  assert.ok(mapHttpStatusToProviderError(503) instanceof RealtyApiOutageError);

  const generic = mapHttpStatusToProviderError(418);
  assert.equal(generic.code, "REQUEST_FAILED");
  assert.equal(generic.statusCode, 418);
});

test("RealtyAPI error codes and retryability are stable", () => {
  assert.equal(new RealtyApiRateLimitError().code, "RATE_LIMIT");
  assert.equal(new RealtyApiRateLimitError().retryable, true);
  assert.equal(new RealtyApiAuthError().code, "AUTH");
  assert.equal(new RealtyApiAuthError().retryable, false);
  assert.equal(new RealtyApiOutageError().code, "OUTAGE");
  assert.equal(new RealtyApiOutageError().retryable, true);
  assert.equal(new RealtyApiMalformedPayloadError().code, "MALFORMED_PAYLOAD");
  assert.equal(new RealtyApiNoResultsError().code, "NO_RESULTS");
  assert.equal(new RealtyApiQuotaExhaustedError().code, "QUOTA_EXHAUSTED");
});

test("quota-exhausted message reflects MONTHLY accounting (not daily)", () => {
  assert.match(new RealtyApiQuotaExhaustedError().message, /monthly/i);
});

test("all RealtyAPI errors carry provider=realtyapi", () => {
  for (const err of [
    new RealtyApiAuthError(),
    new RealtyApiRateLimitError(),
    new RealtyApiOutageError(),
    new RealtyApiMalformedPayloadError(),
    new RealtyApiNoResultsError(),
    new RealtyApiQuotaExhaustedError(),
  ]) {
    assert.equal((err as ProviderError).provider, "realtyapi");
  }
});

test("Google Search HTTP status maps to the right taxonomy class with provider tag", () => {
  assert.ok(mapHttpStatusToGoogleSearchError(403) instanceof GoogleSearchAuthError);
  assert.ok(mapHttpStatusToGoogleSearchError(429) instanceof GoogleSearchRateLimitError);
  assert.ok(mapHttpStatusToGoogleSearchError(500) instanceof GoogleSearchOutageError);

  assert.equal(new GoogleSearchAuthError().provider, "google-search");
  assert.equal(new GoogleSearchRateLimitError().provider, "google-search");
  assert.equal(new GoogleSearchRateLimitError().retryable, true);
});
