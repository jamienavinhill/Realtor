import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from "@google/genai";
import type { GoogleAuthOptions } from "google-auth-library";
import {
  firestoreGeminiQuotaStore,
  type DailyCallQuotaStore,
} from "@/lib/repositories/gemini-quota";
import { resolveGeminiDailyCap } from "@/types/gemini-quota";

/**
 * Shared, COST-CAPPED Gemini client — the single chokepoint every Gemini call site goes
 * through. It exists because the app previously constructed a raw `new GoogleGenAI(...)`
 * in five places, each: (1) on the BILLED Developer API key (never Vertex), (2) with
 * "thinking" left ON (billing extra reasoning tokens at the output rate for pure JSON
 * extraction), and (3) with NO spend ceiling. This module fixes all three centrally:
 *
 *   - lane:     Vertex (credits) when GEMINI_USE_VERTEX is set, else the Developer API key.
 *   - thinking: disabled by default (callers may opt back in via their own thinkingConfig).
 *   - budget:   a hard daily call cap reserved BEFORE the model is ever invoked.
 *
 * Server-side only — `GEMINI_API_KEY` and the Admin-SDK quota store never touch the client.
 */

/**
 * Thrown when the hard daily Gemini call ceiling is reached. Carries HTTP 429 so API
 * routes can surface an honest "budget reached" state instead of silently spending.
 */
export class GeminiBudgetExceededError extends Error {
  readonly status = 429;
  readonly day: string;
  readonly dailyLimit: number;
  constructor(day: string, dailyLimit: number) {
    super(
      `Daily Gemini call budget reached (${dailyLimit} calls on ${day} UTC). ` +
        `Raise GEMINI_DAILY_CALL_CAP to allow more, or wait for the UTC day to roll over.`,
    );
    this.name = "GeminiBudgetExceededError";
    this.day = day;
    this.dailyLimit = dailyLimit;
  }
}

/** Minimal surface this module needs from the GenAI SDK — injectable for tests. */
export type GenerateContentFn = (
  params: GenerateContentParameters,
) => Promise<GenerateContentResponse>;

export interface GeminiClientOptions {
  /** Developer-API key. Ignored in Vertex mode. Defaults to GEMINI_API_KEY / GOOGLE_API_KEY. */
  apiKey?: string;
  /** Durable daily call-budget store. Defaults to the Firestore-backed store. */
  quotaStore?: DailyCallQuotaStore;
  /** Hard daily call ceiling. Defaults to GEMINI_DAILY_CALL_CAP / the built-in default. */
  dailyCap?: number;
  /** Inject the underlying generateContent fn (tests, or a custom transport). */
  generateContent?: GenerateContentFn;
}

export interface CappedGeminiClient {
  /**
   * Reserve one unit of the daily budget, then call Gemini with thinking DISABLED by
   * default. Throws {@link GeminiBudgetExceededError} BEFORE any model call when the day's
   * cap is reached, so an over-budget request costs nothing.
   */
  generate(params: GenerateContentParameters): Promise<GenerateContentResponse>;
}

function isVertexEnabled(env: NodeJS.ProcessEnv): boolean {
  const flag = env.GEMINI_USE_VERTEX?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

/**
 * True when Gemini has a usable lane configured: a project id in Vertex mode, or an API
 * key otherwise. Routes call this to return an honest 5xx instead of failing mid-request.
 */
export function geminiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isVertexEnabled(env)) {
    return Boolean((env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT)?.trim());
  }
  return Boolean((env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY)?.trim());
}

/**
 * Vertex auth on a serverless host (Vercel): there is no metadata server and no writable
 * key file, so we pass the service-account credential INLINE from VERTEX_SERVICE_ACCOUNT_JSON
 * (the full SA key JSON) rather than relying on ambient ADC. Returns undefined when the env
 * var is unset, in which case the SDK falls back to ADC (fine for local dev / GCP hosts).
 */
function parseVertexCredentials(env: NodeJS.ProcessEnv): GoogleAuthOptions | undefined {
  const raw = env.VERTEX_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    return undefined;
  }
  let parsed: { client_email?: string; private_key?: string; project_id?: string };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `VERTEX_SERVICE_ACCOUNT_JSON is set but is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("VERTEX_SERVICE_ACCOUNT_JSON must contain client_email and private_key.");
  }
  return {
    credentials: { client_email: parsed.client_email, private_key: parsed.private_key },
    projectId: parsed.project_id,
  };
}

function buildGenerateContentFn(options: GeminiClientOptions): GenerateContentFn {
  if (options.generateContent) {
    return options.generateContent;
  }
  const env = process.env;
  if (isVertexEnabled(env)) {
    // Vertex lane: bills the Vertex AI quota / trial credits of GOOGLE_CLOUD_PROJECT (NOT
    // the Developer API key). Requires the Vertex AI API enabled on that project and an SA
    // (roles/aiplatform.user) supplied via VERTEX_SERVICE_ACCOUNT_JSON (or ambient ADC).
    const ai = new GoogleGenAI({
      vertexai: true,
      project: (env.GOOGLE_CLOUD_PROJECT ?? env.GCLOUD_PROJECT)?.trim(),
      location: env.GEMINI_LOCATION?.trim() || "us-central1",
      googleAuthOptions: parseVertexCredentials(env),
      httpOptions: { headers: { "User-Agent": "abode-alerts" } },
    });
    return (params) => ai.models.generateContent(params);
  }
  const ai = new GoogleGenAI({
    apiKey: options.apiKey ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
    httpOptions: { headers: { "User-Agent": "abode-alerts" } },
  });
  return (params) => ai.models.generateContent(params);
}

/**
 * Disable Gemini "thinking" by default. For this app's structured JSON-extraction and
 * short-analysis tasks, thinking adds latency and bills extra reasoning tokens at the
 * OUTPUT rate for no quality gain. A caller that genuinely needs reasoning may pass its
 * own `thinkingConfig`, which is preserved.
 */
function withThinkingDisabled(
  config: GenerateContentParameters["config"],
): GenerateContentParameters["config"] {
  if (config && "thinkingConfig" in config && config.thinkingConfig !== undefined) {
    return config;
  }
  return { ...(config ?? {}), thinkingConfig: { thinkingBudget: 0 } };
}

export function createGeminiClient(options: GeminiClientOptions = {}): CappedGeminiClient {
  const quotaStore = options.quotaStore ?? firestoreGeminiQuotaStore;
  const dailyCap = options.dailyCap ?? resolveGeminiDailyCap();
  const generateContent = buildGenerateContentFn(options);

  return {
    async generate(params) {
      const reservation = await quotaStore.reserve({ dailyLimit: dailyCap });
      if (!reservation.granted) {
        throw new GeminiBudgetExceededError(reservation.day, reservation.dailyLimit);
      }
      return generateContent({
        ...params,
        config: withThinkingDisabled(params.config),
      });
    },
  };
}
