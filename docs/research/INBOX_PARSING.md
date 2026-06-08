# Technical Research: Ethical Gmail Inbox Parsing & Listing Harvester

## Overview

Realty Monitor utilizes secure server-side Google Workspace integration APIs alongside Google's **Gemini 3.5 Flash** models to extract structured property listing data directly from real-estate notification digests (Zillow, Redfin, MLS, etc.) sent to a user's Gmail inbox.

This document outlines the architecture, rate limitation considerations, parsing schemas, and secure token workflows.

---

## 1. Google OAuth Token Safety & Propagation Flow

To preserve security best practices:

1. The client component initiates authorization using the Firebase Auth Google SDK, explicitly adding scopes for **Gmail reading (`gmail.readonly`)**, **Spreadsheets write (`spreadsheets`)**, and **Calendar write (`calendar`)**.
2. Upward login callbacks extract the short-lived Google Access Token from the Firebase authorization result in-memory.
3. No Google Workspace tokens are saved inside the Firebase database or local cache. They remain solely in client state memory.
4. Each request made to the server-side Next.js route passes the access token in the `Authorization: Bearer <token>` header, allowing safe delegated fetching directly to downstream Google APIs.

---

## 2. API Quota & Rate Limit Analysis (Realty API vs. Workspace)

Free tiers of property APIs typically restrict developers to 250-500 requests per month (equiv. to roughly ~8 requests per day).

By decoupling **continuous polling** from the actual API limits:

- **The Problem:** Scrapers burn extensive API requests polling repeatedly for listings that rarely change.
- **The Solution (Gmail Harvester):** Subscribing to instant real-estate portal emails which land in inbox handles push notifications for free. Realty Monitor checks Gmail for incoming digests, extracting listing data on demand using Gemini.
- **Workspace Quotas:** Google Workspace API quotas allow up to **2.5 Billion units** or millions of daily reads. Utilizing Gmail parsing costs the user $0 in third-party listing API fees.

---

## 3. Structured Extraction Schema (Gemini Parser)

When parsing incoming email HTML, the raw source can accumulate extensive metadata, tables, tracking pixels, and CSS stylesheets.
To ensure lightning-fast performance, Realty Monitor's backend pre-filters the email:

1. It isolates headers (`Subject`, `From`, `Date`).
2. Recurse through multi-part MIME types to fetch plain text or snippets.
3. Truncates content boundaries to `18,000` character limits before processing.
4. Submits text to Gemini 3.5 Flash with standard JSON schema configurations, returning:
   - Address details (Zip, state, city)
   - Numeric specs (Price, bedrooms, baths, sqft)
   - Year built (if found)
   - Thumbnail URLs mapped organically
