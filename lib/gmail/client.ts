import { OAuth2Client } from "google-auth-library";
import type {
  GmailHeader,
  GmailMessageDetail,
  GmailMessagePayload,
  GmailSearchResponse,
} from "@/types/gmail";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

/**
 * Server-side Gmail client. It mints a short-lived access token from a stored refresh
 * token (via google-auth-library's OAuth2Client) and calls the Gmail REST API. This is
 * what lets the email pipeline run WITHOUT a browser session — the access token never
 * touches the client, and the refresh token is decrypted server-side just-in-time.
 *
 * The HTTP surface is injectable (`fetchImpl`) and the access-token resolver is
 * injectable (`accessTokenProvider`) so tests exercise fetch/history/watch with fakes
 * and zero live Gmail calls.
 */
export interface GmailWatchResponse {
  historyId: string;
  /** Epoch ms (string) when the watch expires; Gmail returns within ~7 days. */
  expiration: string;
}

export interface GmailHistoryMessageAdded {
  message: { id: string; threadId?: string };
}

export interface GmailHistoryRecord {
  id: string;
  messagesAdded?: GmailHistoryMessageAdded[];
}

export interface GmailHistoryListResponse {
  history?: GmailHistoryRecord[];
  historyId?: string;
  nextPageToken?: string;
}

export interface GmailClientOptions {
  fetchImpl?: typeof fetch;
  /** Override how an access token is obtained (tests inject a fake; no live OAuth). */
  accessTokenProvider?: () => Promise<string>;
}

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Build an access-token provider backed by a real refresh-token grant. The OAuth2Client
 * caches and refreshes the access token internally, so repeated calls within a run do
 * not re-hit the token endpoint unnecessarily.
 */
export function refreshTokenAccessProvider(config: GmailOAuthConfig): () => Promise<string> {
  const oauthClient = new OAuth2Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });
  oauthClient.setCredentials({ refresh_token: config.refreshToken });

  return async () => {
    const { token } = await oauthClient.getAccessToken();
    if (!token) {
      throw new Error("Failed to obtain a Gmail access token from the stored refresh token.");
    }
    return token;
  };
}

export class GmailClient {
  private readonly fetchImpl: typeof fetch;
  private readonly accessTokenProvider: () => Promise<string>;

  constructor(options: GmailClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    if (!options.accessTokenProvider) {
      throw new Error("GmailClient requires an accessTokenProvider.");
    }
    this.accessTokenProvider = options.accessTokenProvider;
  }

  private async authHeader(): Promise<string> {
    const token = await this.accessTokenProvider();
    return `Bearer ${token}`;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const Authorization = await this.authHeader();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { Authorization, Accept: "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gmail API ${response.status}: ${body.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  /** Register a Gmail `watch` against a Pub/Sub topic. Returns historyId + expiration. */
  async registerWatch(topicName: string): Promise<GmailWatchResponse> {
    return this.request<GmailWatchResponse>(`${GMAIL_API_BASE}/watch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicName, labelIds: ["INBOX"] }),
    });
  }

  /** Stop the current Gmail watch (best-effort cleanup). */
  async stopWatch(): Promise<void> {
    await this.request<unknown>(`${GMAIL_API_BASE}/stop`, { method: "POST" });
  }

  /** Search messages by query, returning message id summaries. */
  async searchMessages(query: string, maxResults: number): Promise<GmailSearchResponse> {
    const url = `${GMAIL_API_BASE}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    return this.request<GmailSearchResponse>(url);
  }

  /** List history records since `startHistoryId` (new message ids that arrived). */
  async listHistory(
    startHistoryId: string,
    options?: { pageToken?: string },
  ): Promise<GmailHistoryListResponse> {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: "messageAdded",
    });
    if (options?.pageToken) {
      params.set("pageToken", options.pageToken);
    }
    return this.request<GmailHistoryListResponse>(`${GMAIL_API_BASE}/history?${params.toString()}`);
  }

  /** Fetch a full message by id. */
  async getMessage(id: string): Promise<GmailMessageDetail> {
    return this.request<GmailMessageDetail>(`${GMAIL_API_BASE}/messages/${id}?format=full`);
  }

  /** Send an email via the user's Gmail (requires gmail.send scope). */
  async sendMessage(raw: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`${GMAIL_API_BASE}/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
  }
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/** Recursively collect the decoded text body from a Gmail message payload. */
export function extractMessageBody(payload: GmailMessagePayload | undefined): string {
  if (!payload) return "";
  let body = "";
  if (payload.body?.data) {
    try {
      body += decodeBase64Url(payload.body.data);
    } catch {
      // A malformed part is skipped rather than aborting the whole message.
    }
  }
  for (const part of payload.parts ?? []) {
    body += extractMessageBody(part);
  }
  return body;
}

export function findHeader(headers: GmailHeader[] | undefined, name: string): string | undefined {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

export interface ParsedGmailMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  body: string;
}

/** Flatten a Gmail message detail into the fields the extractor needs. */
export function parseGmailMessage(detail: GmailMessageDetail): ParsedGmailMessage {
  const headers = detail.payload?.headers;
  const body = extractMessageBody(detail.payload) || detail.snippet || "";
  return {
    id: detail.id,
    subject: findHeader(headers, "subject") ?? "No Subject",
    from: findHeader(headers, "from") ?? "Unknown Sender",
    date: findHeader(headers, "date") ?? "Unknown Date",
    body,
  };
}
