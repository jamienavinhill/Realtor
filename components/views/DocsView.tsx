"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * In-app documentation (WS14, User Requirements F).
 *
 * Layout: a pinned `aside` table of contents (fixed at `100vh - 64px`, the app
 * header height) with the `main` column as the SOLE scroll container. Clicking a
 * TOC anchor scrolls only `main` (programmatic `scrollTo` on the container, not the
 * document) so the TOC never jumps out of the viewport. Headings carry
 * `scroll-mt-*` so an anchored heading is not hidden under the sticky in-column
 * header.
 *
 * Content reflects what the app ACTUALLY does today (WS7 email ingest, WS8 daily
 * refresh + alerts, WS12 listing actions, WS13 CMA) and the durable docs under
 * `docs/operations/*` and `docs/architecture/*`. Honest claims only — no MLS
 * completeness and no guaranteed real-time freshness.
 */

interface DocSection {
  id: string;
  label: string;
}

interface DocGroup {
  heading: string;
  sections: DocSection[];
}

const DOC_GROUPS: DocGroup[] = [
  {
    heading: "Getting started",
    sections: [
      { id: "intro", label: "Introduction" },
      { id: "quickstart", label: "Quickstart" },
    ],
  },
  {
    heading: "Ingestion",
    sections: [
      { id: "email-ingest", label: "Automatic email ingest" },
      { id: "env-setup", label: "Env & Vercel setup" },
      { id: "operator-ingest", label: "Operator ingest" },
    ],
  },
  {
    heading: "Workspace",
    sections: [
      { id: "listing-actions", label: "Listing actions" },
      { id: "alerts", label: "Alerts" },
      { id: "cma", label: "CMA" },
    ],
  },
];

const ALL_SECTION_IDS = DOC_GROUPS.flatMap((g) => g.sections.map((s) => s.id));

export function DocsView() {
  const mainRef = useRef<HTMLElement | null>(null);
  const [activeId, setActiveId] = useState<string>(ALL_SECTION_IDS[0] ?? "");

  // Anchor navigation: scroll ONLY the main column (not the document), so the
  // pinned TOC stays fixed in the viewport. `scroll-mt` on each heading keeps it
  // clear of the in-column sticky header.
  const handleNavClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    const container = mainRef.current;
    const target = container?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!container || !target) return;
    const top = target.offsetTop - 16;
    container.scrollTo({ top: top < 0 ? 0 : top, behavior: "smooth" });
    setActiveId(id);
  }, []);

  // Active-section highlight as the main column scrolls (nice-to-have). Observes
  // headings within the scroll container and marks the topmost visible one.
  useEffect(() => {
    const container = mainRef.current;
    if (!container) return;
    const headings = ALL_SECTION_IDS.map((id) =>
      container.querySelector<HTMLElement>(`#${CSS.escape(id)}`),
    ).filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { root: container, rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {/* Pinned TOC — fixed height, only its own inner list scrolls if it overflows. */}
      <nav
        aria-label="Documentation sections"
        className="hidden h-full w-60 shrink-0 overflow-y-auto border-r border-stone-200 bg-stone-100/60 px-5 py-6 md:block dark:border-stone-800 dark:bg-stone-900/40"
      >
        <p className="mb-4 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
          Documentation
        </p>
        <div className="space-y-6">
          {DOC_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
                {group.heading}
              </p>
              <ul className="space-y-1 text-sm">
                {group.sections.map((section) => {
                  const isActive = activeId === section.id;
                  return (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        onClick={(e) => handleNavClick(e, section.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={`block rounded px-2 py-1 transition ${
                          isActive
                            ? "bg-primary-500/10 text-primary-600 dark:text-primary-400 font-medium"
                            : "text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800/60 dark:hover:text-stone-100"
                        }`}
                      >
                        {section.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Main content — the SOLE scroll container. */}
      <main
        ref={mainRef}
        className="relative flex-1 overflow-y-auto scroll-smooth px-6 py-8 lg:px-12"
      >
        <div className="prose prose-stone dark:prose-invert prose-sm prose-headings:font-semibold prose-headings:tracking-tight max-w-3xl">
          <Section id="intro" className="scroll-mt-6">
            <h1 className="mb-2 text-2xl font-semibold tracking-tight">Abode Alerts</h1>
            <p className="text-stone-600 dark:text-stone-400">
              Abode Alerts is a property-monitoring workspace for the 10-mile radius around ZIP
              44224 (Stow, Ohio). It ingests listing-alert emails automatically, evaluates your
              saved alert criteria against the real Firestore inventory, and surfaces matches in the
              workspace. Listing data carries source provenance and timestamps; nothing is invented.
            </p>
            <p className="text-stone-600 dark:text-stone-400">
              The inventory is what the configured providers and your connected mailbox supply — it
              is not a complete MLS feed, and freshness depends on when alert emails arrive and when
              refresh jobs run. The app never claims real-time completeness.
            </p>
          </Section>

          <Section id="quickstart" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Quickstart</h2>
            <ol className="ml-5 list-decimal space-y-2 text-stone-600 dark:text-stone-400">
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Sign in.</span> Use
                the Sign in control in the header (Google). The signed-in state shows your avatar
                and a profile menu.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  Connect Gmail.
                </span>{" "}
                Authorize Gmail access so the workspace can read listing-alert emails. The refresh
                token is exchanged and stored server-side, encrypted; it is never returned to the
                browser.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  Pick platforms.
                </span>{" "}
                Choose your listing-email sources (Zillow, Trulia, Homes.com, Redfin, realtor.com,
                plus extensions) in the ingest selector. New alert emails are then ingested
                automatically.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Set alerts.</span>{" "}
                Use the Alerts wizard to define criteria (city, price, beds). Matches against the
                inventory are persisted and surfaced as toasts.
              </li>
            </ol>
          </Section>

          <Section id="email-ingest" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Automatic email ingest</h2>
            <p className="text-stone-600 dark:text-stone-400">
              The primary ingestion flow is automatic. A new listing-alert email is the trigger —
              you do not click &ldquo;scan.&rdquo; The pipeline is:
            </p>
            <ol className="ml-5 list-decimal space-y-1 text-stone-600 dark:text-stone-400">
              <li>
                Gmail <code>watch</code> registers a push subscription on your mailbox against a
                Cloud Pub/Sub topic.
              </li>
              <li>
                A new matching email causes Pub/Sub to push a notification to the server handler (
                <code>POST /api/gmail/push</code>).
              </li>
              <li>
                The handler verifies the push (Pub/Sub OIDC service-account JWT plus a shared
                secret) before any work, then runs the shared email pipeline from the stored Gmail
                history-id watermark.
              </li>
              <li>
                Gemini extracts the listing from the email text (server-side only); the result is
                validated, given provenance and a dedupe key, and upserted to Firestore.
              </li>
              <li>
                Saved alerts are evaluated and matches are persisted; new items surface as toasts.
              </li>
            </ol>
            <p className="text-stone-600 dark:text-stone-400">
              <span className="font-medium text-stone-800 dark:text-stone-200">Platforms.</span> The
              ingest filter is a multiselect of known listing-email platforms (five baseline sources
              shown first, plus extensions) with an optional advanced custom-query fragment. Your
              selection composes a deterministic Gmail search query, previewed live. The same
              composed query feeds both the automatic pipeline and the manual scan, so they never
              diverge.
            </p>
            <p className="text-stone-600 dark:text-stone-400">
              The pipeline is idempotent: a redelivered push or a re-run never duplicates a listing
              or an alert match, because writes are keyed on a stable dedupe key. Extraction reads
              only the email text — no prices or photos are fabricated.
            </p>
          </Section>

          <Section id="env-setup" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Env &amp; Vercel setup</h2>
            <p className="text-stone-600 dark:text-stone-400">
              The app deploys as a single Vercel project; deploys happen automatically on{" "}
              <code>git push</code> (there is no deploy cron). The authoritative list of environment
              variable names is the tracked <code>.env.example</code> and the validation in{" "}
              <code>lib/env.ts</code>. No secret values live in the repo.
            </p>
            <p className="text-stone-600 dark:text-stone-400">
              App-runtime secrets (server-side only):
            </p>
            <ul className="ml-5 list-disc space-y-1 text-stone-600 dark:text-stone-400">
              <li>
                <code>GEMINI_API_KEY</code> — Gemini extraction/analysis (
                <code>GOOGLE_API_KEY</code> accepted as a fallback alias).
              </li>
              <li>
                <code>REALTY_API_KEYS</code> — all RealtyAPI keys, comma-separated; the adapter
                rotates across them.
              </li>
              <li>
                <code>INGEST_JOB_TOKEN</code> — bearer token gating the protected{" "}
                <code>/api/ingest/*</code> routes and the Gmail watch renewal.
              </li>
              <li>
                <code>FIREBASE_SERVICE_ACCOUNT_JSON</code> — inline Firebase Admin service-account
                JSON on Vercel; locally a file path is used instead.
              </li>
            </ul>
            <p className="text-stone-600 dark:text-stone-400">
              The Firebase web client config (<code>firebase-applet-config.json</code>) is public
              configuration, not a secret — security comes from Firestore rules and the server-side
              admin credential. Operator-only values (Vercel PAT/project id, test inputs) live in
              the local <code>.env</code> and are never added to the deployed app&rsquo;s runtime
              env. Optional <code>GOOGLE_SEARCH_*</code> keys enable cited public-search enrichment;
              when unset, enrichment is a no-op.
            </p>
          </Section>

          <Section id="operator-ingest" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Operator ingest</h2>
            <p className="text-stone-600 dark:text-stone-400">
              Beyond the automatic email flow, operators have protected ingestion routes. All of
              these require the <code>INGEST_JOB_TOKEN</code> bearer token; without it they return
              401, and when the token env is unset they return 503.
            </p>
            <ul className="ml-5 list-disc space-y-1 text-stone-600 dark:text-stone-400">
              <li>
                <code>POST /api/ingest/backfill</code> — populate the 44224 baseline from RealtyAPI.
                A <code>?dryRun=true</code> query validates wiring with zero provider calls and no
                writes.
              </li>
              <li>
                <code>POST /api/ingest/daily</code> — the idempotent daily zone refresh plus alert
                evaluation. The business-hours safety-net poll calls the same route with{" "}
                <code>?type=poll</code> so its runs are recorded distinctly.
              </li>
              <li>
                <code>POST /api/gmail/watch</code> — register or renew the Gmail watch. Gmail
                expires a watch within about seven days, so a free public-repo GitHub Action
                re-registers it on a schedule. This is not a Vercel deploy.
              </li>
            </ul>
            <p className="text-stone-600 dark:text-stone-400">
              A manual <code>POST /api/gmail/scan</code> (the &ldquo;Scan Gmail&rdquo; action) runs
              the exact same pipeline on demand by the composed platform query, as a secondary
              fallback to the automatic push. Every ingestion record carries source provenance and
              timestamps and is auditable in <code>ingest_runs</code>.
            </p>
          </Section>

          <Section id="listing-actions" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Listing actions</h2>
            <p className="text-stone-600 dark:text-stone-400">
              Open any listing to see its compact detail dialog with an action bar. Actions are
              per-user and stored under your own <code>listingPreferences</code> — never on the
              shared catalog document. Available actions:
            </p>
            <ul className="ml-5 list-disc space-y-1 text-stone-600 dark:text-stone-400">
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Interested</span> /{" "}
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  Not interested
                </span>{" "}
                — mark how a listing fits.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Favorite</span> —
                flag a listing; favorites and interested states show as badges on the grid card.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Hide</span> —
                exclude a listing from the default grid; it is recoverable, not deleted.
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Compare</span> —
                add up to four listings to a side-by-side comparison (price, $/sqft, beds, baths,
                type, status, year, distance).
              </li>
              <li>
                <span className="font-medium text-stone-800 dark:text-stone-200">Analyze</span> — a
                Gemini-backed read that reasons only from the listing&rsquo;s structured fields and
                any cited enrichment. It qualifies inferences and says when data is missing rather
                than guessing; it makes no MLS-completeness claims.
              </li>
            </ul>
          </Section>

          <Section id="alerts" className="scroll-mt-6">
            <h2 className="mb-3 text-lg font-semibold">Alerts</h2>
            <p className="text-stone-600 dark:text-stone-400">
              Alerts are saved search criteria (city, max price, beds, and similar) owned by your
              account. The Alerts wizard helps you set criteria for the 44224 area and generates a
              concise cheat sheet for subscribing to the baseline platforms&rsquo; email alerts
              (Zillow, Trulia, Homes.com, Redfin, realtor.com).
            </p>
            <p className="text-stone-600 dark:text-stone-400">
              Alert evaluation runs server-side during ingestion (the email pipeline and the daily
              refresh), so matches are found without a browser session open. Each match is persisted
              with first-seen and last-seen timestamps and a match reason, and new matches surface
              through the toast system rather than a layout-shifting banner.
            </p>
          </Section>

          <Section id="cma" className="scroll-mt-6 pb-16">
            <h2 className="mb-3 text-lg font-semibold">CMA</h2>
            <p className="text-stone-600 dark:text-stone-400">
              The Comparative Market Analysis view summarizes the real Firestore inventory — every
              figure is derived from the stored listings, with no synthetic chart values. It shows a
              charts panel (including price distribution, price-per-sqft, property-type mix, and
              status breakdown) and a sortable, paginated data table.
            </p>
            <p className="text-stone-600 dark:text-stone-400">
              The table defaults to 10 rows per page with 20 / 30 / 100 options and sortable
              columns. When the inventory is empty, the view shows an honest empty state rather than
              placeholder numbers. Rows link through to the same compact listing dialog used across
              the workspace.
            </p>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  // The anchor target is the section wrapper; `scroll-mt` keeps the heading clear of
  // the top of the scroll container. Spacing separates sections without decorative rules.
  return (
    <section id={id} className={`mb-10 ${className ?? ""}`}>
      {children}
    </section>
  );
}
