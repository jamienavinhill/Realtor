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

export function validateIngestToken(input: IngestAuthInput): boolean {
  const bearer = extractBearerToken(input.authorizationHeader);
  const headerToken = input.ingestTokenHeader?.trim() ?? null;
  const provided = bearer ?? headerToken;

  if (!provided || !input.expectedToken) {
    return false;
  }

  return provided === input.expectedToken;
}