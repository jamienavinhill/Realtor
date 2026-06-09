"use client";

import React, { useMemo } from "react";
import { Check } from "lucide-react";
import { LISTING_EMAIL_PLATFORMS, composeGmailQuery } from "@/lib/gmail/platforms";

/**
 * Ingest-filter multiselect (WS7, User Requirements B). Replaces the raw `gmailQuery`
 * text field with a multiselect of known listing-email platforms (the five baseline
 * platforms surfaced first, plus extensions), an optional advanced custom-query fragment,
 * and a LIVE composed-query preview. The composed query is the exact string fed to the
 * shared Gmail pipeline (`composeGmailQuery`), so what the user sees is what runs.
 *
 * This is a controlled component: selection + custom query live in the parent (which
 * persists them server-side); this component renders and reports changes only. It never
 * calls a provider directly.
 */
export interface IngestPlatformSelectorProps {
  selected: string[];
  customQuery: string;
  onChange: (next: { selected: string[]; customQuery: string }) => void;
}

export function IngestPlatformSelector({
  selected,
  customQuery,
  onChange,
}: IngestPlatformSelectorProps) {
  const composedQuery = useMemo(
    () => composeGmailQuery({ platformIds: selected, customQuery }),
    [selected, customQuery],
  );

  const baseline = LISTING_EMAIL_PLATFORMS.filter((p) => p.baseline);
  const extensions = LISTING_EMAIL_PLATFORMS.filter((p) => !p.baseline);

  const togglePlatform = (id: string) => {
    const next = selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id];
    onChange({ selected: next, customQuery });
  };

  const renderChip = (platform: (typeof LISTING_EMAIL_PLATFORMS)[number]) => {
    const isSelected = selected.includes(platform.id);
    return (
      <button
        key={platform.id}
        type="button"
        onClick={() => togglePlatform(platform.id)}
        aria-pressed={isSelected}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] font-semibold transition ${
          isSelected
            ? "border-primary-500 bg-primary-600 text-white"
            : "border-stone-300 bg-stone-50 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
        }`}
      >
        {isSelected && <Check className="h-3 w-3" />}
        {platform.label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-2 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
          Listing Platforms
        </label>
        <div className="flex flex-wrap gap-2">{baseline.map(renderChip)}</div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
          More Sources
        </label>
        <div className="flex flex-wrap gap-2">{extensions.map(renderChip)}</div>
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
          Advanced — Custom Query Fragment (optional)
        </label>
        <input
          type="text"
          value={customQuery}
          onChange={(e) => onChange({ selected, customQuery: e.target.value })}
          placeholder='e.g. newer_than:7d OR subject:"price drop"'
          className="w-full rounded border border-stone-200 bg-stone-50 p-2.5 font-mono text-xs text-stone-900 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-200"
        />
      </div>

      <div>
        <label className="mb-1.5 block font-mono text-[11px] tracking-wider text-stone-400 uppercase">
          Composed Gmail Query (live)
        </label>
        <pre className="max-h-24 overflow-auto rounded border border-stone-200 bg-stone-100 p-2.5 font-mono text-[11px] break-words whitespace-pre-wrap text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">
          {composedQuery || "(select at least one platform or enter a custom query)"}
        </pre>
      </div>
    </div>
  );
}
