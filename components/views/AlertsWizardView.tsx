import React, { useState } from "react";
import { Mail, ArrowRight, Clipboard, Loader2, AlertTriangle, RotateCw } from "lucide-react";
import { BASELINE_ZIP, DEFAULT_ALERT_CITY, DEFAULT_ALERT_STATE } from "@/lib/ingest/constants";

/** Six realtor sites for even grid + full wiring in setup cheat sheet. */
const BASELINE_PLATFORM_LINKS: { label: string; href: string }[] = [
  { label: "Zillow", href: "https://www.zillow.com" },
  { label: "Trulia", href: "https://www.trulia.com" },
  { label: "Homes.com", href: "https://www.homes.com" },
  { label: "Redfin", href: "https://www.redfin.com" },
  { label: "realtor.com", href: "https://www.realtor.com" },
  { label: "Movoto", href: "https://www.movoto.com" },
];

export function AlertsWizardView() {
  const [criteria, setCriteria] = useState({
    city: DEFAULT_ALERT_CITY,
    state: DEFAULT_ALERT_STATE,
    maxPrice: "450000",
    beds: "3",
    baths: "2",
    emails: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [guideText, setGuideText] = useState("");
  const [genError, setGenError] = useState<string | null>(null);

  // Generate the platform subscription cheat sheet via the server-side Gemini route.
  // Surfaces honest provider-error state (502/missing-key/network) instead of
  // silently rendering an undefined response.
  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenError(null);
    try {
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Generate a short step-by-step text guide for the user to sign up for email alerts on Zillow, Trulia, Homes.com, Redfin, realtor.com, and Movoto using these specific criteria: City: ${criteria.city}, Max Price: ${criteria.maxPrice}, Min Beds: ${criteria.beds}, Min Baths: ${criteria.baths}. Keep it extremely concise and actionable. Include how to set any property type or style filters where available.`,
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.text !== "string" || data.text.trim().length === 0) {
        throw new Error(data.error || "The setup-guide service returned no content.");
      }
      setGuideText(data.text);
    } catch (error) {
      setGuideText("");
      setGenError(
        error instanceof Error
          ? error.message
          : "Could not reach the setup-guide service. Check your connection and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-stretch">
      {/* LEFT — criteria form (primary place to set values + trigger) */}
      <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">
            Email Alerts Setup
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Set criteria for the {BASELINE_ZIP} Stow/Akron area, then generate a step-by-step cheat
            sheet for subscribing on the major sites.
          </p>
        </div>

        <div className="flex-1 space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-widest text-stone-500 uppercase">
              City
            </label>
            <input
              value={criteria.city}
              onChange={(e) => setCriteria({ ...criteria, city: e.target.value })}
              placeholder="e.g. Stow"
              title="City"
              className="focus:border-primary-500 focus:ring-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm transition outline-none focus:ring-1 dark:border-stone-800 dark:bg-stone-950"
            />
          </div>

          <div>
            <div className="mb-1.5 text-xs font-semibold tracking-widest text-stone-500 uppercase">
              Filters
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-stone-500">Max Price</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">$</span>
                  <input
                    type="number"
                    value={criteria.maxPrice}
                    onChange={(e) => setCriteria({ ...criteria, maxPrice: e.target.value })}
                    title="Max Price"
                    className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 py-2.5 pl-7 pr-3 text-sm transition outline-none dark:border-stone-800 dark:bg-stone-950"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-stone-500">Min Beds</label>
                <input
                  type="number"
                  value={criteria.beds}
                  onChange={(e) => setCriteria({ ...criteria, beds: e.target.value })}
                  title="Min Beds"
                  className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-sm transition outline-none dark:border-stone-800 dark:bg-stone-950"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-stone-500">Min Baths</label>
                <input
                  type="number"
                  value={criteria.baths}
                  onChange={(e) => setCriteria({ ...criteria, baths: e.target.value })}
                  title="Min Baths"
                  className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-sm transition outline-none dark:border-stone-800 dark:bg-stone-950"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <GenerateButton
            onClick={handleGenerate}
            disabled={isGenerating}
            label="Generate AI Setup Guide"
          />
        </div>
      </div>

      {/* RIGHT — cheat sheet + quick links (balanced, good breathing room) */}
      <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <h2 className="mb-4 text-lg font-semibold text-stone-900 dark:text-white">Setup Cheat Sheet</h2>

        <div className="flex-1 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950">
          {isGenerating ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center space-y-3 text-center text-stone-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Generating your setup guide…</p>
            </div>
          ) : genError ? (
            <div className="flex h-full min-h-48 flex-col items-center justify-center space-y-4 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">{genError}</p>
              <GenerateButton onClick={handleGenerate} disabled={isGenerating} label="Try again" />
            </div>
          ) : guideText ? (
            <div>
              <div className="prose prose-sm dark:prose-invert prose-stone max-w-none">
                <div dangerouslySetInnerHTML={{ __html: guideText.replace(/\n/g, "<br/>") }} />
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 transition hover:text-stone-800 dark:hover:text-stone-200"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            </div>
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center space-y-4 text-center">
              <Mail className="h-8 w-8 text-stone-300 dark:text-stone-600" />
              <p className="max-w-xs text-sm text-stone-500">
                Generate a concise step-by-step guide for setting up email alerts on Zillow, Trulia,
                Homes.com, Redfin, realtor.com, and Movoto using the criteria on the left.
              </p>
              <GenerateButton
                onClick={handleGenerate}
                disabled={isGenerating}
                label="Generate AI Setup Guide"
              />
            </div>
          )}
        </div>

        {/* Quick links — uniform, well-spaced, not crammed. Clipboard icon to evoke "copy the query / follow the steps". */}
        <div className="mt-5">
          <div className="mb-2 text-[10px] font-semibold tracking-[0.5px] text-stone-500 uppercase">
            Quick links
          </div>
          <div className="grid grid-cols-3 gap-3">
            {BASELINE_PLATFORM_LINKS.map((platform) => (
              <a
                key={platform.label}
                href={platform.href}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:border-primary-500 group flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-center transition active:scale-[0.985] dark:border-stone-800 dark:bg-stone-950"
              >
                <Clipboard className="text-primary-500 mb-1.5 h-4 w-4 transition group-hover:scale-110" />
                <span className="text-xs font-semibold">{platform.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerateButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-5 py-2.5 text-sm font-bold text-stone-100 shadow transition hover:opacity-90 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
    >
      {label}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}
