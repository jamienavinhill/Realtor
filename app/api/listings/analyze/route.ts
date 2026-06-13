import { NextRequest, NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { createGeminiClient, GeminiBudgetExceededError, geminiConfigured } from "@/lib/ai/gemini";

/**
 * Gemini-backed listing analysis (WS12 "Analyze" action).
 *
 * Runs SERVER-SIDE only so `GEMINI_API_KEY` is never exposed to the browser
 * (Locked Decision: Gemini is server-side only). The caller sends its Firebase
 * ID token as `Authorization: Bearer <idToken>`; the server verifies it with the
 * Admin SDK. We never trust client-supplied analysis text or invent listing data.
 *
 * The model is constrained to reason ONLY from the structured fields the client
 * sends (which come from Firestore-owned listing records) plus any cited
 * enrichment already attached to the listing. It must qualify uncertainty and
 * say so honestly when a field is missing rather than fabricating a value.
 */
export const runtime = "nodejs";

interface AnalyzeListingPayload {
  id: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  propertyType?: string;
  status?: string;
  yearBuilt?: number;
  description?: string;
  distanceMiles?: number;
  /** Pre-cited free-lane enrichment summary, if the listing has one. */
  enrichmentNeighborhood?: string;
}

interface AnalyzeBody {
  listing?: AnalyzeListingPayload;
}

const SYSTEM_GUIDANCE = [
  "You are a careful real-estate analyst for the Abode Alerts workspace.",
  "Analyze ONLY the structured listing fields provided below. Do not invent prices,",
  "comparable sales, school ratings, crime statistics, market trends, or any fact that",
  "is not derivable from the given fields. When a field is missing or insufficient,",
  "state plainly that the data is not available rather than guessing.",
  "Qualify every inference (e.g. 'based on the listed price and square footage').",
  "Do not claim MLS completeness or guaranteed real-time accuracy.",
  "Return 3-5 short bullet points covering: value read (price vs. size/type where",
  "computable), notable strengths, open questions a buyer should verify, and an honest",
  "note about what data is missing. Keep it under 180 words. Plain text, no markdown headers.",
].join(" ");

function buildListingFacts(listing: AnalyzeListingPayload): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`${label}: ${value}`);
    }
  };
  add("Title", listing.title);
  add("Address", listing.address);
  add("City", listing.city);
  add("State", listing.state);
  add("ZIP", listing.zipCode);
  add(
    "Price (USD)",
    typeof listing.price === "number" ? listing.price.toLocaleString() : undefined,
  );
  add("Beds", listing.beds);
  add("Baths", listing.baths);
  add("Square feet", listing.sqft);
  if (typeof listing.price === "number" && typeof listing.sqft === "number" && listing.sqft > 0) {
    add("Price per sqft (computed)", `$${Math.round(listing.price / listing.sqft)}`);
  }
  add("Property type", listing.propertyType);
  add("Status", listing.status);
  add("Year built", listing.yearBuilt);
  add("Distance from target zone (mi)", listing.distanceMiles);
  add("Listing description", listing.description);
  add("Cited neighborhood note", listing.enrichmentNeighborhood);
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const idToken = extractBearerToken(req.headers.get("authorization"));
    if (!idToken) {
      return NextResponse.json({ error: "Missing Firebase ID token" }, { status: 401 });
    }
    try {
      await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 });
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        { error: "Gemini is not configured on the server." },
        { status: 503 },
      );
    }

    const body = (await req.json()) as AnalyzeBody;
    const listing = body.listing;
    if (!listing || typeof listing.id !== "string" || listing.id.length === 0) {
      return NextResponse.json({ error: "A listing with an id is required." }, { status: 400 });
    }

    const facts = buildListingFacts(listing);
    if (facts.trim().length === 0) {
      return NextResponse.json({
        analysis:
          "Not enough listing data is available to analyze this property. No price, size, or descriptive fields were provided.",
      });
    }

    const gemini = createGeminiClient();
    const response = await gemini.generate({
      model: "gemini-2.5-flash",
      contents: [`${SYSTEM_GUIDANCE}\n\nLISTING FIELDS:\n${facts}`],
    });

    const analysis = response.text?.trim();
    if (!analysis) {
      return NextResponse.json(
        { error: "The analysis service returned no content. Try again shortly." },
        { status: 502 },
      );
    }

    return NextResponse.json({ analysis });
  } catch (error: unknown) {
    if (error instanceof GeminiBudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Listing analyze error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
