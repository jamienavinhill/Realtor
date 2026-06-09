/**
 * Listing-email platform catalog + Gmail query composer (WS7).
 *
 * The ingest filter is a multiselect of known listing-alert platforms. Each platform
 * contributes a Gmail search clause that matches its alert emails (by sender domain
 * and/or subject). The composed query is the OR of every selected platform's clause,
 * with an optional user-supplied custom fragment ANDed on. The same composer feeds
 * BOTH the automatic push pipeline and the manual "Scan Gmail" advanced action, so the
 * two never diverge.
 *
 * Clauses use Gmail search operators only (`from:`, `subject:`) — no scraping, no
 * invented data. Senders are the canonical alert domains for each platform.
 */
export interface ListingEmailPlatform {
  /** Stable id persisted in `gmailSync.platformSelection`. */
  id: string;
  /** Human label shown in the multiselect. */
  label: string;
  /** True for the five baseline platforms the operator uses (User Requirements B.3). */
  baseline: boolean;
  /** Gmail search clause matching this platform's alert emails. */
  clause: string;
}

/**
 * The five baseline platforms plus known extensions. Clauses combine a `from:` sender
 * match with a `subject:` fallback so a platform is caught even if it emails from a
 * secondary domain. Verify sender domains against live alert emails before relying on
 * a margin; these are the canonical public alert domains as of 2026-06.
 */
export const LISTING_EMAIL_PLATFORMS: ListingEmailPlatform[] = [
  // --- Five baseline platforms (User Requirements B.3) ---
  {
    id: "zillow",
    label: "Zillow",
    baseline: true,
    clause: '(from:zillow.com OR subject:"Zillow")',
  },
  {
    id: "trulia",
    label: "Trulia",
    baseline: true,
    clause: '(from:trulia.com OR subject:"Trulia")',
  },
  {
    id: "homes",
    label: "Homes.com",
    baseline: true,
    clause: '(from:homes.com OR subject:"Homes.com")',
  },
  {
    id: "redfin",
    label: "Redfin",
    baseline: true,
    clause: '(from:redfin.com OR subject:"Redfin")',
  },
  {
    id: "realtor",
    label: "realtor.com",
    baseline: true,
    clause: '(from:realtor.com OR subject:"Realtor.com")',
  },
  // --- Extensions (other major listing-email sources) ---
  {
    id: "movoto",
    label: "Movoto",
    baseline: false,
    clause: '(from:movoto.com OR subject:"Movoto")',
  },
  {
    id: "homefinder",
    label: "HomeFinder",
    baseline: false,
    clause: '(from:homefinder.com OR subject:"HomeFinder")',
  },
  {
    id: "compass",
    label: "Compass",
    baseline: false,
    clause: '(from:compass.com OR subject:"Compass")',
  },
  {
    id: "apartments",
    label: "Apartments.com",
    baseline: false,
    clause: '(from:apartments.com OR subject:"Apartments.com")',
  },
];

const PLATFORM_BY_ID = new Map(LISTING_EMAIL_PLATFORMS.map((p) => [p.id, p]));

/** Default selection: the five baseline platforms (User Requirements B.3 — user uses all). */
export const DEFAULT_PLATFORM_SELECTION: string[] = LISTING_EMAIL_PLATFORMS.filter(
  (p) => p.baseline,
).map((p) => p.id);

export function getPlatform(id: string): ListingEmailPlatform | undefined {
  return PLATFORM_BY_ID.get(id);
}

export interface ComposeQueryInput {
  /** Selected platform ids (order-independent; unknown ids are ignored). */
  platformIds: string[];
  /** Optional advanced free-text fragment, ANDed onto the platform OR-group. */
  customQuery?: string;
}

/**
 * Compose a Gmail search query from selected platforms + optional custom fragment.
 *
 * - Platform clauses are deduped and OR-joined, preserving catalog order so the output
 *   is deterministic regardless of selection order.
 * - When a custom fragment is provided it is ANDed with the platform group:
 *   `(<platforms>) <custom>`. When no platforms are selected, the custom fragment (if
 *   any) stands alone. When nothing is selected at all, returns "".
 *
 * Example: ["redfin","zillow"] →
 *   `(from:redfin.com OR subject:"Redfin") OR (from:zillow.com OR subject:"Zillow")`
 */
export function composeGmailQuery(input: ComposeQueryInput): string {
  const seen = new Set<string>();
  const clauses: string[] = [];

  // Iterate the catalog (not the selection) so output order is stable.
  for (const platform of LISTING_EMAIL_PLATFORMS) {
    if (input.platformIds.includes(platform.id) && !seen.has(platform.id)) {
      seen.add(platform.id);
      clauses.push(platform.clause);
    }
  }

  const platformGroup = clauses.join(" OR ");
  const custom = input.customQuery?.trim();

  if (platformGroup && custom) {
    // Wrap the OR-group so the custom fragment ANDs onto the whole group. A single clause
    // is already parenthesized, so only wrap when there are 2+ clauses (avoids double parens).
    const grouped = clauses.length > 1 ? `(${platformGroup})` : platformGroup;
    return `${grouped} ${custom}`;
  }
  if (platformGroup) {
    return platformGroup;
  }
  return custom ?? "";
}
