import assert from "node:assert/strict";
import test from "node:test";
import { extractBearerToken, validateIngestToken } from "@/lib/ingest/auth";

const EXPECTED = "test-ingest-token";

test("validateIngestToken accepts Bearer token", () => {
  const ok = validateIngestToken({
    authorizationHeader: `Bearer ${EXPECTED}`,
    ingestTokenHeader: null,
    expectedToken: EXPECTED,
  });
  assert.equal(ok, true);
});

test("validateIngestToken accepts x-ingest-token header", () => {
  const ok = validateIngestToken({
    authorizationHeader: null,
    ingestTokenHeader: EXPECTED,
    expectedToken: EXPECTED,
  });
  assert.equal(ok, true);
});

test("validateIngestToken rejects missing and invalid tokens", () => {
  assert.equal(
    validateIngestToken({
      authorizationHeader: null,
      ingestTokenHeader: null,
      expectedToken: EXPECTED,
    }),
    false,
  );

  assert.equal(
    validateIngestToken({
      authorizationHeader: "Bearer wrong-token",
      ingestTokenHeader: null,
      expectedToken: EXPECTED,
    }),
    false,
  );
});

test("extractBearerToken parses Authorization header", () => {
  assert.equal(extractBearerToken("Bearer abc123"), "abc123");
  assert.equal(extractBearerToken("Basic abc123"), null);
});