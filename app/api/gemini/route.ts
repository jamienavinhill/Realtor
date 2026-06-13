import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { createGeminiClient, GeminiBudgetExceededError, geminiConfigured } from "@/lib/ai/gemini";

export async function POST(req: NextRequest) {
  try {
    if (!geminiConfigured()) {
      return NextResponse.json(
        { error: "Gemini is not configured on the server (set GEMINI_API_KEY or Vertex env)." },
        { status: 500 },
      );
    }

    const { prompt, model } = await req.json();
    const gemini = createGeminiClient();

    const response = await gemini.generate({
      model: model || "gemini-2.5-flash",
      contents: [prompt],
    });

    return NextResponse.json({ text: response.text });
  } catch (error: unknown) {
    if (error instanceof GeminiBudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to generate content via Gemini" },
      { status: 500 },
    );
  }
}
