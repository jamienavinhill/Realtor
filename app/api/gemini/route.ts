import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not defined on the server." },
        { status: 500 }
      );
    }

    const { prompt, model } = await req.json();
    const ai = new GoogleGenAI({ apiKey: key });

    const response = await ai.models.generateContent({
      model: model || "gemini-2.5-flash",
      contents: [prompt],
    });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate content via Gemini" },
      { status: 500 }
    );
  }
}
