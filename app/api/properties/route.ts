import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { getErrorMessage } from "@/lib/errors";
import { ListingProperty } from "@/types/listings";
import {
  GmailHeader,
  GmailMessageDetail,
  GmailMessagePayload,
  GmailSearchResponse,
} from "@/types/gmail";

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

export async function POST(req: NextRequest) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY environment variable is missing on the server. Please check settings.",
        },
        { status: 500 },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const { action, ...payload } = await req.json();

    const ai = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

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
- Property Title (e.g. "Stunning Renovated Bungalow in Central Austin" or "Redfin Alert Listing")
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
          const res = await ai.models.generateContent({
            model: "gemini-3.5-flash",
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

      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash",
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

      // If no spreadsheetId is supplied, we will create a brand new one called "Realty Monitor Hub"
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
              title: "Realty Monitor Leads Spreadsheet",
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
        description: `Scheduled viewing for property:\n\nPrice: $${prop.price.toLocaleString()}\nBeds: ${prop.beds} | Baths: ${prop.baths}\nSqFt: ${prop.sqft}\nProperty Type: ${prop.propertyType}\n\nView details: ${prop.description || "N/A"}\n\nSynced & scheduled securely via Realty Monitor.`,
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
    console.error("Endpoint catch:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
