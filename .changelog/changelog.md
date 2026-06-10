# Changelog: Abode Alerts Work History

All notable changes of the Abode Alerts application development are logged here.

---

## 2026-06-10: Roadmap Status Reconciliation [Current]

A status-tracking refresh, not a feature change. The authoritative tracker is the active roadmap under `docs/roadmaps/`.

### Status

- **Complete (committed, two passes each):** WS1–WS14 — tooling/docs, Vercel/env/Firebase-admin, contracts/schemas/rules base, listing preferences, provider adapters, 44224 backfill, email-triggered ingestion + multiselect, refresh/alert evaluation, toast system, auth chrome, UI honesty, compact listing dialog + actions, CMA analytics, and docs layout — plus WS19 repository/root hygiene (pulled forward).
- **Partial:** WS15 product-flow/metadata wiring — pass 1 only (`db669711`); pass-2/closeout not yet run.
- **Remaining:** account sharing + auth/rules hardening (WS18 + WS16, built together on the shared `firestore.rules`), the WS15 closeout, and the WS17 release gate.
- **Operator-pending (not code):** live Gmail `watch`/Pub-Sub registration and OAuth verification (required to make the built-in automatic ingestion live and to onboard invited users), GCP/Firebase budget alert, live 44224 re-backfill + Firestore readback, and Vercel env/authorized-domain confirmation.

## 2026-06-08: Workspace Integrations & Real-World Inbox Parsing

### Added

- **Gmail Harvester Tool:** Implemented actual Gmail API endpoint queries fetching listing notification digests (Zillow, Redfin, MLS) and extracting pristine real-estate data schema using Gemini 3.5 Flash models.
- **Direct Raw Parser:** Enabled a text-area form section where users can copy-paste any unstructured alert text/HTML manually and structure listing details safely.
- **Google Sheets Lead Logger:** Integrated sheets append API endpoint, letting users export selected listed property leads directly inside a linked Google Spreadsheet inside Google Drive.
- **Google Calendar Tour Scheduler:** Deployed inline date-time selector widgets, letting users schedule tour inspections directly into their Google Calendar with single-click actions.
- **Persistent Firestore Hooks:** Mapped matching alert triggers so saving parsed properties instantly evaluates alerts rules and drops responsive alert toasts dynamically.

### Fixed

- **Firebase Initializer Compile Issue:** Resolved undefined properties reference crash by removing `firestoreDatabaseId` parameters, falling back safely onto standard primary databases.
- **TypeScript Typesafety & Scopes:** Bound strict scopes (`gmail.readonly`, `spreadsheets`, `calendar`, `drive.file`) to standard client Google SDK authentication procedures.
