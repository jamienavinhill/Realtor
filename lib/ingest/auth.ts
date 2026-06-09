import { createHash, timingSafeEqual } from "node:crypto";

export interface IngestAuthInput {
  authorizationHeader?: string | null;
  ingestTokenHeader?: string | null;
  expectedToken: string;
}

export function extractBearerToken(authorizationHeader?: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

/**
 * Constant-time string comparison. Falls back to a length-independent path so a
 * mismatched length does not leak through an early return. Both inputs are hashed
 * to fixed-length buffers before comparison so `timingSafeEqual` never throws on
 * differing lengths and the timing does not depend on the candidate length.
 */
function constantTimeEquals(provided: string, expected: string): boolean {
  // timingSafeEqual requires equal-length buffers. Compare fixed-length SHA-256
  // digests so length differences are handled in constant time. The digests still
  // differ whenever the underlying tokens differ, so this remains a correct equality
  // check while not leaking length or content via timing.
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();

  return timingSafeEqual(providedDigest, expectedDigest);
}

export function validateIngestToken(input: IngestAuthInput): boolean {
  const bearer = extractBearerToken(input.authorizationHeader);
  const headerToken = input.ingestTokenHeader?.trim() ?? null;
  const provided = bearer ?? headerToken;

  if (!provided || !input.expectedToken) {
    return false;
  }

  return constantTimeEquals(provided, input.expectedToken);
}
