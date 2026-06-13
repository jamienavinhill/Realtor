import assert from "node:assert/strict";
import test from "node:test";
import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { createGeminiClient, GeminiBudgetExceededError } from "@/lib/ai/gemini";
import { createInMemoryGeminiQuotaStore } from "@/lib/repositories/gemini-quota";

function fakeResponse(text: string): GenerateContentResponse {
  return { text } as unknown as GenerateContentResponse;
}

test("disables thinking by default, preserves existing config, and reserves one unit per call", async () => {
  const store = createInMemoryGeminiQuotaStore();
  let lastParams: GenerateContentParameters | undefined;
  const client = createGeminiClient({
    quotaStore: store,
    dailyCap: 5,
    generateContent: async (params) => {
      lastParams = params;
      return fakeResponse("ok");
    },
  });

  const res = await client.generate({
    model: "gemini-2.5-flash",
    contents: [{ text: "hi" }],
    config: { responseMimeType: "application/json" },
  });

  assert.equal(res.text, "ok");
  assert.equal(
    lastParams?.config?.thinkingConfig?.thinkingBudget,
    0,
    "thinking must be forced off by default",
  );
  assert.equal(
    lastParams?.config?.responseMimeType,
    "application/json",
    "caller config must be preserved",
  );

  const doc = await store.read();
  assert.equal(doc?.count, 1, "one budget unit reserved per call");
});

test("respects a caller-provided thinkingConfig (opt back in)", async () => {
  const store = createInMemoryGeminiQuotaStore();
  let lastParams: GenerateContentParameters | undefined;
  const client = createGeminiClient({
    quotaStore: store,
    dailyCap: 5,
    generateContent: async (params) => {
      lastParams = params;
      return fakeResponse("ok");
    },
  });

  await client.generate({
    model: "gemini-2.5-flash",
    contents: [{ text: "hi" }],
    config: { thinkingConfig: { thinkingBudget: 256 } },
  });

  assert.equal(lastParams?.config?.thinkingConfig?.thinkingBudget, 256);
});

test("throws GeminiBudgetExceededError at the cap WITHOUT calling the model", async () => {
  const store = createInMemoryGeminiQuotaStore();
  let calls = 0;
  const client = createGeminiClient({
    quotaStore: store,
    dailyCap: 2,
    generateContent: async () => {
      calls += 1;
      return fakeResponse("ok");
    },
  });

  await client.generate({ model: "m", contents: [{ text: "1" }] });
  await client.generate({ model: "m", contents: [{ text: "2" }] });
  await assert.rejects(
    () => client.generate({ model: "m", contents: [{ text: "3" }] }),
    (err: unknown) => err instanceof GeminiBudgetExceededError && err.status === 429,
  );

  assert.equal(calls, 2, "the model must NOT be called once the daily cap is hit");
});
