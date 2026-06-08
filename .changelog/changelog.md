# Changelog: Realty Monitor Work History

All notable changes of the Realty Monitor application development are logged here.

---

## 2026-06-08: Workspace Integrations & Real-World Inbox Parsing [Current Version]

### Added

- **Gmail Harvester Tool:** Implemented actual Gmail API endpoint queries fetching listing notification digests (Zillow, Redfin, MLS) and extracting pristine real-estate data schema using Gemini 3.5 Flash models.
- **Direct Raw Parser:** Enabled a text-area form section where users can copy-paste any unstructured alert text/HTML manually and structure listing details safely.
- **Google Sheets Lead Logger:** Integrated sheets append API endpoint, letting users export selected listed property leads directly inside a linked Google Spreadsheet inside Google Drive.
- **Google Calendar Tour Scheduler:** Deployed inline date-time selector widgets, letting users schedule tour inspections directly into their Google Calendar with single-click actions.
- **Persistent Firestore Hooks:** Mapped matching alert triggers so saving parsed properties instantly evaluates alerts rules and drops responsive alert toasts dynamically.

### Fixed

- **Firebase Initializer Compile Issue:** Resolved undefined properties reference crash by removing `firestoreDatabaseId` parameters, falling back safely onto standard primary databases.
- **TypeScript Typesafety & Scopes:** Bound strict scopes (`gmail.readonly`, `spreadsheets`, `calendar`, `drive.file`) to standard client Google SDK authentication procedures.
