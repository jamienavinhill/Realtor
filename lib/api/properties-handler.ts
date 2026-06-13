import { NextRequest, NextResponse } from "next/server";
import { Type } from "@google/genai";
import { createGeminiClient, GeminiBudgetExceededError, geminiConfigured } from "@/lib/ai/gemini";
import { getErrorMessage } from "@/lib/errors";
import { ListingProperty } from "@/types/listings";
import {
  GmailHeader,
  GmailMessageDetail,
  GmailMessagePayload,
  GmailSearchResponse,
} from "@/types/gmail";
import { getAdminAuth } from "@/lib/firebase-admin";
import { extractBearerToken } from "@/lib/ingest/auth";
import { deleteListing, upsertListing } from "@/lib/repositories/listings";
import {
  normalizeManualListing,
  type ManualCommitOrigin,
  type ManualListingInput,
} from "@/lib/ingest/manual-normalize";

/**
 * Server logic for `POST /api/properties`, extracted from the route file so it can be
 * driven by the route integration test with injected dependencies (the Next.js route
 * module may only export HTTP-verb handlers + runtime config, so this lives in `lib/`).
 *
 * WS16 pass 2: every privileged action now requires a verified Firebase ID token —
 * `commit`/`delete_listing` (which the Admin SDK persists) AND the `parse_gmail`/
 * `parse_raw_text` Gemini-extraction actions (a billable surface that must not be
 * reachable unauthenticated). The `export_sheets`/`create_calendar_event` actions act on
 * the user's OWN Google account via their Google OAuth access token and do not touch the
 * shared catalog or Gemini.
 */

/** Injectable seams so the integration test never needs a live Firebase project. */
export interface PropertiesRouteDeps {
  /** Verify a Firebase ID token and resolve the caller's uid. Throws if invalid. */
  verifyIdToken: (idToken: string) => Promise<{ uid: string }>;
  upsertListing: typeof upsertListing;
  deleteListing: typeof deleteListing;
}

export const defaultPropertiesRouteDeps: PropertiesRouteDeps = {
  verifyIdToken: async (idToken: string) => {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return { uid: decoded.uid };
  },
  upsertListing,
  deleteListing,
};

interface AuthOk {
  ok: true;
  uid: string;
}
interface AuthFail {
  ok: false;
  response: NextResponse;
}

/**
 * Require a verified Firebase ID token. A Firebase ID token is a Firebase-issued JWT the
 * Admin SDK verifies — it is NOT the Google OAuth access token used for Gmail/Sheets REST
 * calls, so the two never share a header. Returns an honest 401 NextResponse on failure.
 */
async function requireFirebaseAuth(
  idToken: string | null,
  deps: PropertiesRouteDeps,
  missingMessage: string,
): Promise<AuthOk | AuthFail> {
  if (!idToken) {
    return {
      ok: false,
      response: NextResponse.json({ error: missingMessage }, { status: 401 }),
    };
  }
  try {
    const { uid } = await deps.verifyIdToken(idToken);
    return { ok: true, uid };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid Firebase ID token" }, { status: 401 }),
    };
  }
}

function decodeBase64Url(str: string): string {
  // Decode base64url (RFC 4648) to standard string
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

function getEmailBody(payload: GmailMessagePayload | undefined): string {
  if (!payload) {
    return "";
  }
  let bodyText = "";

  if (payload.body && payload.body.data) {
    try {
      bodyText += decodeBase64Url(payload.body.data);
    } catch (e) {
      console.error("Failed to decode payload body", e);
    }
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      bodyText += getEmailBody(part);
    }
  }

  return bodyText;
}

export async function handlePropertiesPost(
  req: NextRequest,
  deps: PropertiesRouteDeps = defaultPropertiesRouteDeps,
): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get("Authorization");
    // The Gmail scan carries the Google OAuth access token in `Authorization`, so its
    // Firebase ID token rides a separate header.
    const idTokenHeader = req.headers.get("X-Firebase-Id-Token");
    const { action, ...payload } = await req.json();

    // COMMIT runs before the Gemini gate: it persists already-extracted listings via the
    // Admin SDK and needs no GEMINI_API_KEY or Gemini client. Handled first so a missing
    // Gemini key never blocks committing a reviewed listing.
    if (action === "commit") {
      const auth = await requireFirebaseAuth(
        extractBearerToken(authHeader),
        deps,
        "Sign in to commit listings (missing Firebase ID token).",
      );
      if (!auth.ok) return auth.response;

      const listings = payload.listings;
      if (!Array.isArray(listings) || listings.length === 0) {
        return NextResponse.json({ error: "No listings provided to commit." }, { status: 400 });
      }
      if (listings.length > 50) {
        return NextResponse.json(
          { error: "Too many listings in one commit (max 50)." },
          { status: 400 },
        );
      }

      const origin: ManualCommitOrigin =
        payload.origin === "manual_gmail" ? "manual_gmail" : "manual_paste";

      const committed: ListingProperty[] = [];
      const rejected: { index: number; errors: string[] }[] = [];

      for (let index = 0; index < listings.length; index += 1) {
        const normalized = normalizeManualListing(listings[index] as ManualListingInput, origin);
        if (!normalized.success) {
          rejected.push({ index, errors: normalized.errors });
          continue;
        }
        try {
          await deps.upsertListing(normalized.listing);
          committed.push(normalized.listing);
        } catch (error) {
          rejected.push({ index, errors: [getErrorMessage(error)] });
        }
      }

      if (committed.length === 0) {
        return NextResponse.json(
          { error: "No listings could be committed.", rejected },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        committedCount: committed.length,
        rejectedCount: rejected.length,
        // Return the server-normalized listings so the client reflects stored provenance.
        properties: committed,
        rejected,
      });
    }

    // DELETE_LISTING (WS16) — remove a catalog listing via the Admin SDK. Client deletes of
    // `properties/*` are denied by Firestore rules; this is the server path the listing
    // "delete" button uses. Verifies the caller's Firebase ID token; no Gemini needed.
    if (action === "delete_listing") {
      const auth = await requireFirebaseAuth(
        extractBearerToken(authHeader),
        deps,
        "Sign in to delete listings (missing Firebase ID token).",
      );
      if (!auth.ok) return auth.response;

      const listingId = typeof payload.listingId === "string" ? payload.listingId.trim() : "";
      if (!listingId || listingId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(listingId)) {
        return NextResponse.json({ error: "A valid listingId is required." }, { status: 400 });
      }

      await deps.deleteListing(listingId);
      return NextResponse.json({ success: true, listingId });
    }

    // PARSE_GMAIL / PARSE_RAW_TEXT both drive Gemini extraction (a billable surface). WS16
    // pass 2 requires a verified Firebase ID token on each so an unauthenticated caller
    // cannot drive extraction cost. The Gmail scan additionally needs the Google OAuth
    // access token for the Gmail REST API (read from `Authorization`), so its ID token is
    // the `X-Firebase-Id-Token` header; the raw-text parse has no Google token, so its ID
    // token is the `Authorization` bearer.
    if (action === "parse_gmail" || action === "parse_raw_text") {
      const idToken = action === "parse_gmail" ? idTokenHeader : extractBearerToken(authHeader);
      const auth = await requireFirebaseAuth(
        idToken,
        deps,
        action === "parse_gmail"
          ? "Sign in to scan Gmail (missing Firebase ID token)."
          : "Sign in to parse listing text (missing Firebase ID token).",
      );
      if (!auth.ok) return auth.response;
    }

    if (!geminiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Gemini is not configured on the server (set GEMINI_API_KEY or Vertex env). Please check settings.",
        },
        { status: 500 },
      );
    }

    // Shared capped client: enforces the daily call cap + disables thinking, so this
    // legacy per-email extraction loop can no longer run away on cost.
    const gemini = createGeminiClient();

    // 1. GMAIL ACTION - Parse real estate emails
    if (action === "parse_gmail") {
      if (!authHeader) {
        return NextResponse.json(
          { error: "Missing Authorization header for Google Workspace call." },
          { status: 401 },
        );
      }

      const queryFilter = payload.query || 'subject:"Redfin" OR subject:"Zillow" OR "new listing"';
      const maxResults = payload.maxResults || 5;

      // 1. Search Gmail messages
      const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(queryFilter)}&maxResults=${maxResults}`;
      const searchRes = await fetch(searchUrl, {
        headers: { Authorization: authHeader },
      });

      if (!searchRes.ok) {
        const errorText = await searchRes.text();
        return NextResponse.json(
          { error: `Gmail Search Error: ${errorText}` },
          { status: searchRes.status },
        );
      }

      const searchData = (await searchRes.json()) as GmailSearchResponse;
      const messages = searchData.messages || [];

      if (messages.length === 0) {
        return NextResponse.json({
          properties: [],
          message: `No email updates matching "${queryFilter}" were found in your Gmail inbox.`,
        });
      }

      const parsedProperties: ListingProperty[] = [];

      // 2. Fetch details for each message
      for (const msgSummary of messages) {
        const msgDetailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgSummary.id}?format=full`;
        const detailRes = await fetch(msgDetailUrl, {
          headers: { Authorization: authHeader },
        });

        if (!detailRes.ok) continue;

        const emailDetail = (await detailRes.json()) as GmailMessageDetail;
        const headers = emailDetail.payload?.headers || [];
        const findHeader = (name: string) =>
          headers.find((h: GmailHeader) => h.name.toLowerCase() === name)?.value;
        const subject = findHeader("subject") || "No Subject";
        const fromHeader = findHeader("from") || "Unknown Sender";
        const dateHeader = findHeader("date") || "Unknown Date";

        let bodyContentText = getEmailBody(emailDetail.payload);
        // Fallback to snippet if body decoding didn't catch anything or was empty
        if (!bodyContentText || bodyContentText.trim().length === 0) {
          bodyContentText = emailDetail.snippet || "";
        }

        // Limit length to keep prompt reasonable
        const combinedEmailText = `
Sender: ${fromHeader}
Date: ${dateHeader}
Subject: ${subject}
Email Fragment:
--------------------------
${bodyContentText.slice(0, 18000)}
--------------------------
`.trim();

        // 3. Invoke Gemini to extract properties from this specific email content
        const systemPrompt = `You are an elite real-estate data harvester.
Your task is to analyze the following email text and extract any real estate properties mentioned there.
If NO legitimate real estate listing is found inside the text, return an empty array: [].
Do NOT hallucinate properties if they are not inside this text.

Analyze the text to extract:
- Property Title (e.g. "Renovated Colonial in Stow, OH" or "Redfin Alert Listing")
- Price (number only)
- Address, City, State, Zip Code
- Bedrooms, Bathrooms, Sqft
- Property Type ("Single Family", "Condo", "Townhouse", "Multi-Family", "Land")
- Year Built (if found)
- Brief summary/description (extract features from text)
- Image URL: Extract visual or primary thumbnail URLs only when they are present in the source text. If no real listing media URL is present, return an empty string. Never invent or substitute stock photos.

Specify the source as "realty_api" so it fits our dashboard.
Returns a JSON array of parsed properties matching the schema. Do NOT return markdown formatting. Return raw JSON.`;

        try {
          const res = await gemini.generate({
            model: "gemini-2.5-flash-lite",
            contents: [{ text: systemPrompt }, { text: combinedEmailText }],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: {
                      type: Type.STRING,
                      description: "A unique id starting with prop_gmail_ and a random hash",
                    },
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
                    yearBuilt: { type: Type.INTEGER },
                    coordinates: {
                      type: Type.OBJECT,
                      properties: {
                        lat: { type: Type.NUMBER },
                        lng: { type: Type.NUMBER },
                      },
                      required: ["lat", "lng"],
                    },
                  },
                  required: [
                    "id",
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
                    "description",
                    "imageUrl",
                  ],
                },
              },
            },
          });

          const responseText = res.text?.trim() || "[]";
          const parsed = JSON.parse(responseText);

          if (Array.isArray(parsed)) {
            parsed.forEach((p) => {
              // Mark with meta fields
              p.source = "realty_api";
              p.status = "Active";
              p.createdAt = new Date().toISOString();
              p.updatedAt = new Date().toISOString();
              p.emailSource = {
                id: msgSummary.id,
                subject,
                from: fromHeader,
                date: dateHeader,
              };
              parsedProperties.push(p);
            });
          }
        } catch (e) {
          if (e instanceof GeminiBudgetExceededError) {
            // Daily Gemini budget hit mid-scan: stop hammering the API and return what we
            // extracted so far rather than firing a failing call per remaining email.
            console.warn(
              `Daily Gemini budget reached mid-scan; stopping after ${parsedProperties.length} extracted.`,
            );
            break;
          }
          console.error(`Gemini Extraction failed for email ID ${msgSummary.id}:`, e);
        }
      }

      return NextResponse.json({ properties: parsedProperties });
    }

    // 2. PARSE RAW TEXT ACTION - Paste emails or listing snippets
    if (action === "parse_raw_text") {
      const rawText = payload.text;
      if (!rawText || rawText.trim().length === 0) {
        return NextResponse.json({ error: "Missing source text to parse" }, { status: 400 });
      }

      const systemPrompt = `You are an elite real-estate data harvester.
Parse the pasted real estate details, alert string, or webpage snippet and return a structured property listing profile.
If no listing can be found, return empty properties.
Do not hallucinate facts or values. Extract an image URL only when the pasted source contains real listing media. If no valid image is found, return an empty string for imageUrl. Never invent or substitute stock photos.

Return raw JSON schema.`;

      const res = await gemini.generate({
        model: "gemini-2.5-flash-lite",
        contents: [{ text: systemPrompt }, { text: rawText }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              id: {
                type: Type.STRING,
                description: "Generate a unique ID formatted like 'prop_pasted_'",
              },
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
              yearBuilt: { type: Type.INTEGER },
              coordinates: {
                type: Type.OBJECT,
                properties: {
                  lat: { type: Type.NUMBER },
                  lng: { type: Type.NUMBER },
                },
                required: ["lat", "lng"],
              },
            },
            required: [
              "id",
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
              "description",
              "imageUrl",
            ],
          },
        },
      });

      const parsed = JSON.parse(res.text || "{}");
      parsed.source = "realty_api";
      parsed.status = "Active";
      parsed.createdAt = new Date().toISOString();
      parsed.updatedAt = new Date().toISOString();

      return NextResponse.json({ property: parsed });
    }

    // 3. EXPORT SHEETS ACTION - Log properties to Google Sheets
    if (action === "export_sheets") {
      if (!authHeader) {
        return NextResponse.json(
          { error: "Missing Authorization header for Sheets." },
          { status: 401 },
        );
      }

      let spreadsheetId = payload.spreadsheetId;
      const listings = payload.listings || [];

      if (!listings || listings.length === 0) {
        return NextResponse.json(
          { error: "No properties selected for Google Sheets export." },
          { status: 400 },
        );
      }

      // If no spreadsheetId is supplied, we will create a brand new Abode Alerts spreadsheet
      if (!spreadsheetId) {
        const createUrl = "https://sheets.googleapis.com/v4/spreadsheets";
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              title: "Abode Alerts Leads Spreadsheet",
            },
          }),
        });

        if (!createRes.ok) {
          const errorMsg = await createRes.text();
          return NextResponse.json(
            { error: `Create Sheet Failed: ${errorMsg}` },
            { status: createRes.status },
          );
        }

        const createData = await createRes.json();
        spreadsheetId = createData.spreadsheetId;

        // Initialize header row
        const headers = [
          [
            "ID",
            "Property Title",
            "Address",
            "City",
            "State",
            "Price",
            "Beds",
            "Baths",
            "SqFt",
            "Property Type",
            "Description",
            "Created At",
          ],
        ];
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:L1?valueInputOption=USER_ENTERED`,
          {
            method: "PUT",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              range: "Sheet1!A1:L1",
              majorDimension: "ROWS",
              values: headers,
            }),
          },
        );
      }

      // Format listings values to log
      const logRows = (listings as ListingProperty[]).map((p) => [
        p.id,
        p.title,
        p.address,
        p.city,
        p.state,
        p.price,
        p.beds,
        p.baths,
        p.sqft,
        p.propertyType,
        p.description || "",
        p.createdAt,
      ]);

      const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A:L:append?valueInputOption=USER_ENTERED`;
      const appendRes = await fetch(appendUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          range: "Sheet1!A:L",
          majorDimension: "ROWS",
          values: logRows,
        }),
      });

      if (!appendRes.ok) {
        const errorMsg = await appendRes.text();
        return NextResponse.json(
          { error: `Sheets Insert Failed: ${errorMsg}` },
          { status: appendRes.status },
        );
      }

      return NextResponse.json({
        success: true,
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      });
    }

    // 4. CREATE CALENDAR ACTION - Add tours/alerts schedule
    if (action === "create_calendar_event") {
      if (!authHeader) {
        return NextResponse.json(
          { error: "Missing Authorization header for Calendar." },
          { status: 401 },
        );
      }

      const prop = payload.property;
      const startDateTime =
        payload.startDateTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default to tomorrow same time
      const parsedEnd = new Date(new Date(startDateTime).getTime() + 60 * 60 * 1000).toISOString(); // Default to 1 hr duration

      if (!prop) {
        return NextResponse.json(
          { error: "Property metadata is required to schedule viewing calendar." },
          { status: 400 },
        );
      }

      const calendarUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      const eventBody = {
        summary: `🏠 Real Estate Tour & Inspection: ${prop.title}`,
        location: `${prop.address}, ${prop.city}, ${prop.state} ${prop.zipCode}`,
        description: `Scheduled viewing for property:\n\nPrice: $${prop.price.toLocaleString()}\nBeds: ${prop.beds} | Baths: ${prop.baths}\nSqFt: ${prop.sqft}\nProperty Type: ${prop.propertyType}\n\nView details: ${prop.description || "N/A"}\n\nSynced & scheduled securely via Abode Alerts.`,
        start: {
          dateTime: startDateTime,
          timeZone: "UTC",
        },
        end: {
          dateTime: parsedEnd,
          timeZone: "UTC",
        },
        reminders: {
          useDefault: true,
        },
      };

      const calRes = await fetch(calendarUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      });

      if (!calRes.ok) {
        const errorMsg = await calRes.text();
        return NextResponse.json(
          { error: `Calendar Event Insert Failed: ${errorMsg}` },
          { status: calRes.status },
        );
      }

      const eventData = await calRes.json();
      return NextResponse.json({
        success: true,
        eventId: eventData.id,
        htmlLink: eventData.htmlLink,
      });
    }

    return NextResponse.json({ error: "Action not supported" }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof GeminiBudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("Endpoint catch:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
