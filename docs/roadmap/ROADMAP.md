# Strategic Roadmap: Realty Monitor Integration & Scale

This document outlines the production roadmap for Realty Monitor's workspace integrations and continuous optimization phases.

---

## Completed Milestones
*   **Firebase Integration:** Provisioned persistent cloud Firestore collections for structured property listings and active alert query configurations.
*   **Google Workspace OAuth Setup:** Confirmed scopes and linked authorization routines so users can authenticate on-client-side to access Gmail message digests.
*   **Gmail Harvester Pipeline:** Implemented server-side router querying Gmail alerts, fetching email parts, and structuring listings with zero hallucinations using Gemini 3.5 Flash.
*   **Google Sheets Export:** Deployed direct-append routes mapping extracted property data as rows in a Google lead spreadsheet automatically.
*   **Calendar Scheduler Tours:** Created quick date-time workflows Scheduling home inspection tours as Calendar events securely on primary Google Calendars.

---

## Phase 1: Real-Time Webhooks & Push Subscriptions
To avoid manual trigger-polling:
*   Implement **Google Pub/Sub Webhook Subscriptions** listening to Gmail push notifications.
*   Register a push topic triggering a serverless endpoint instantly whenever an email matching Zillow or Redfin filters lands.
*   Forward notification updates instantly via active WebSockets or Server-Sent Events (SSE) directly onto the client viewport.

---

## Phase 2: Dual Location Mapping & Valuation Analytics
To boost properties decision indicators:
*   Enhance dashboard listings with custom Google Maps overlays utilizing exact coordinates extracted by Gemini.
*   Integrate direct Comparative Market Analysis (CMA) models checking surrounding properties in the same zip code within Firestore.
*   Present potential long-term price trajectory curves and appreciation forecasts via Recharts visualizations on each property card.
