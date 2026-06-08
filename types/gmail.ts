export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessagePayload {
  body?: {
    data?: string;
  };
  parts?: GmailMessagePayload[];
  headers?: GmailHeader[];
}

export interface GmailMessageDetail {
  id: string;
  snippet?: string;
  payload?: GmailMessagePayload;
}

export interface GmailMessageSummary {
  id: string;
}

export interface GmailSearchResponse {
  messages?: GmailMessageSummary[];
}
