import { Type } from "@google/genai";
import { createGeminiClient, type CappedGeminiClient } from "@/lib/ai/gemini";
import type { ParsedGmailMessage } from "@/lib/gmail/client";

/**
 * Structured listing draft extracted by Gemini from a single email's text. This is the
 * RAW extraction surface — only what the model could read out of the email. The
 * pipeline normalizes, enriches, validates, and adds provenance before anything is
 * written to Firestore. The extractor NEVER invents listings, prices, or photos: when
 * no real listing is present it returns an empty array.
 */
export interface ExtractedListingDraft {
  title: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: string;
  description?: string;
  /** Real listing media URL found in the email, or "" — never a stock/substitute image. */
  imageUrl?: string;
  yearBuilt?: number;
  /** The canonical listing URL found in the email, when present. */
  sourceUrl?: string;
  coordinates?: { lat: number; lng: number };
}

/**
 * Injection seam: the pipeline depends on this interface, not on the concrete Gemini
 * client, so the happy-path pipeline test supplies a deterministic fake extractor with
 * zero live model calls.
 */
export interface ListingExtractor {
  extract(message: ParsedGmailMessage): Promise<ExtractedListingDraft[]>;
}

const SYSTEM_PROMPT = `You are an elite real-estate data harvester for the Abode Alerts pipeline.
Analyze the email text and extract any real estate property listings explicitly present in it.
If NO legitimate real estate listing is found, return an empty array: [].
Never hallucinate or fabricate listings, prices, addresses, or photos. Extract only what the text states.

For each listing extract:
- title, price (number), address, city, state, zipCode
- beds, baths, sqft (numbers; 0 when not stated)
- propertyType ("Single Family", "Condo", "Townhouse", "Multi-Family", "Land")
- description (features summarized from the text)
- imageUrl: a real listing media URL ONLY if one appears in the text; otherwise "".
- sourceUrl: the canonical listing URL if present in the text; otherwise "".
- yearBuilt and coordinates only when present.

Return raw JSON only (no markdown).`;

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      address: { type: Type.STRING },
      city: { type: Type.STRING },
      state: { type: Type.STRING },
      zipCode: { type: Type.STRING },
      price: { type: Type.INTEGER },
      beds: { type: Type.NUMBER },
      baths: { type: Type.NUMBER },
      sqft: { type: Type.NUMBER },
      propertyType: { type: Type.STRING },
      description: { type: Type.STRING },
      imageUrl: { type: Type.STRING },
      sourceUrl: { type: Type.STRING },
      yearBuilt: { type: Type.INTEGER },
      coordinates: {
        type: Type.OBJECT,
        properties: { lat: { type: Type.NUMBER }, lng: { type: Type.NUMBER } },
      },
    },
    required: [
      "title",
      "address",
      "city",
      "state",
      "zipCode",
      "price",
      "beds",
      "baths",
      "sqft",
      "propertyType",
    ],
  },
} as const;

export interface GeminiExtractorOptions {
  apiKey: string;
  model?: string;
  /**
   * Injectable capped Gemini client (tests / Vertex). Defaults to the shared client,
   * which enforces the daily call cap and disables thinking — so extraction can never
   * run away on cost regardless of how many emails a push/scan replays.
   */
  client?: CappedGeminiClient;
}

/**
 * Gemini-backed extractor. Server-side only (the `GEMINI_API_KEY` lives in the server
 * env and is never exposed to the browser). Truncates the email body to keep the prompt
 * bounded. All model calls go through the shared capped client.
 */
export function createGeminiExtractor(options: GeminiExtractorOptions): ListingExtractor {
  const client = options.client ?? createGeminiClient({ apiKey: options.apiKey });
  // Flash-Lite: cheapest current model, ample for structured listing extraction.
  const model = options.model ?? "gemini-2.5-flash-lite";

  return {
    async extract(message) {
      const emailText = `Sender: ${message.from}
Date: ${message.date}
Subject: ${message.subject}
Body:
--------------------------
${message.body.slice(0, 18000)}
--------------------------`;

      const res = await client.generate({
        model,
        contents: [{ text: SYSTEM_PROMPT }, { text: emailText }],
        config: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
      });

      const text = res.text?.trim() || "[]";
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return [];
      }
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as ExtractedListingDraft[];
    },
  };
}
