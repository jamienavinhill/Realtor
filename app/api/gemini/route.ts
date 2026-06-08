import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not defined on the server." },
        { status: 500 },
      );
    }

    const { prompt, model } = await req.json();
    const ai = new GoogleGenAI({ apiKey: key });

    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: [prompt],
    });

    return NextResponse.json({ text: response.text });
  } catch (error: unknown) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: getErrorMessage(error) || "Failed to generate content via Gemini" },
      { status: 500 },
    );
  }
}
