import assert from "node:assert/strict";
import test from "node:test";
import { GoogleSearchClient } from "@/lib/providers/google-search";
import { GoogleSearchAuthError, GoogleSearchRateLimitError } from "@/lib/providers/errors";

function makeJsonFetch(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      async json() {
        return body;
      },
      async text() {
        return typeof body === "string" ? body : JSON.stringify(body);
      },
    }) as unknown as Response) as unknown as typeof fetch;
}

test("env-absent is a clear no-op: configured=false, no citations, never throws", async () => {
  const client = new GoogleSearchClient({ config: {}, fetchImpl: makeJsonFetch(200, {}) });
  assert.equal(client.isConfigured(), false);

  const result = await client.search("44224 neighborhood", "neighborhood");
  assert.equal(result.configured, false);
  assert.deepEqual(result.citations, []);
  assert.deepEqual(result.sources, []);
});

test("partial config (key without engine id) is also a no-op", async () => {
  const client = new GoogleSearchClient({
    config: { apiKey: "test_key" },
    fetchImpl: makeJsonFetch(200, {}),
  });
  assert.equal(client.isConfigured(), false);
  const result = await client.search("anything", "neighborhood");
  assert.equal(result.configured, false);
});

test("citations always carry a real source URL and a google-search source record", async () => {
  const fetchImpl = makeJsonFetch(200, {
    items: [
      {
        title: "Stow OH Neighborhood Guide",
        link: "https://example.test/stow-guide",
        snippet: "About the area",
        displayLink: "example.test",
      },
      {
        title: "Schools near 44224",
        link: "https://example.test/schools",
        snippet: "Local schools",
      },
      // No link → cannot be cited → must be skipped (never fabricate a URL).
      { title: "No URL result", snippet: "ignored" },
    ],
  });
  const client = new GoogleSearchClient({
    config: { apiKey: "test_key", engineId: "test_cx" },
    fetchImpl,
  });

  const result = await client.search("Stow OH neighborhood", "neighborhood", {
    fetchedAt: "2026-06-09T00:00:00.000Z",
  });

  assert.equal(result.configured, true);
  assert.equal(result.citations.length, 2, "result without a link must be dropped");
  assert.equal(result.citations[0].url, "https://example.test/stow-guide");
  for (const citation of result.citations) {
    assert.ok(citation.url.startsWith("https://"), "every citation must have a real URL");
  }
  for (const source of result.sources) {
    assert.equal(source.provider, "google-search");
    assert.equal(source.field, "neighborhood");
    assert.equal(source.fetchedAt, "2026-06-09T00:00:00.000Z");
    assert.ok(source.url.length > 0);
  }
});

test("empty query against configured client returns no citations (no invented data)", async () => {
  const client = new GoogleSearchClient({
    config: { apiKey: "test_key", engineId: "test_cx" },
    fetchImpl: makeJsonFetch(200, { items: [{ title: "x", link: "https://x.test" }] }),
  });
  const result = await client.search("   ", "neighborhood");
  assert.equal(result.configured, true);
  assert.deepEqual(result.citations, []);
});

test("auth failure maps to GoogleSearchAuthError; quota maps to rate-limit", async () => {
  const authClient = new GoogleSearchClient({
    config: { apiKey: "bad", engineId: "test_cx" },
    fetchImpl: makeJsonFetch(403, "forbidden"),
  });
  await assert.rejects(() => authClient.search("q", "neighborhood"), GoogleSearchAuthError);

  const quotaClient = new GoogleSearchClient({
    config: { apiKey: "ok", engineId: "test_cx" },
    fetchImpl: makeJsonFetch(429, "quota"),
  });
  await assert.rejects(() => quotaClient.search("q", "neighborhood"), GoogleSearchRateLimitError);
});
