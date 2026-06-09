"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Dialog } from "../ui/dialog";
import type { ListingProperty } from "@/types/listings";

interface CompareDialogProps {
  open: boolean;
  onClose: () => void;
  listings: ListingProperty[];
  onRemove: (listingId: string) => void;
  onClear: () => void;
}

interface CompareRow {
  label: string;
  render: (l: ListingProperty) => React.ReactNode;
}

const ROWS: CompareRow[] = [
  { label: "Price", render: (l) => `$${l.price.toLocaleString()}` },
  { label: "$/sqft", render: (l) => (l.sqft > 0 ? `$${Math.round(l.price / l.sqft)}` : "—") },
  { label: "Beds", render: (l) => l.beds },
  { label: "Baths", render: (l) => l.baths },
  { label: "Sq ft", render: (l) => l.sqft.toLocaleString() },
  { label: "Type", render: (l) => l.propertyType },
  { label: "Status", render: (l) => l.status },
  { label: "Year built", render: (l) => l.yearBuilt ?? "—" },
  { label: "City", render: (l) => l.city },
  {
    label: "Distance",
    render: (l) => (typeof l.distanceMiles === "number" ? `${l.distanceMiles.toFixed(1)} mi` : "—"),
  },
];

/**
 * Side-by-side tabular comparison of the listings in the user's compare queue
 * (WS12). Reuses the shared compact `Dialog` shell. Each column header carries a
 * remove control; the footer can clear the whole queue.
 */
export function CompareDialog({ open, onClose, listings, onRemove, onClear }: CompareDialogProps) {
  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-xs text-stone-500">
        {listings.length} listing{listings.length === 1 ? "" : "s"} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        disabled={listings.length === 0}
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
      >
        Clear all
      </button>
    </div>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Compare listings"
      subtitle="Side-by-side comparison of your selected listings"
      footer={footer}
    >
      {listings.length === 0 ? (
        <p className="py-8 text-center text-sm text-stone-500">
          No listings selected. Open a listing and choose “Compare” to add it here (up to 4).
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-white p-2 text-left text-xs font-semibold tracking-wider text-stone-400 uppercase dark:bg-stone-900">
                  Listing
                </th>
                {listings.map((l) => (
                  <th key={l.id} className="min-w-[10rem] p-2 text-left align-top">
                    <div className="flex items-start justify-between gap-1">
                      <span className="line-clamp-2 text-xs font-semibold text-stone-900 dark:text-stone-100">
                        {l.title}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(l.id)}
                        aria-label={`Remove ${l.title} from comparison`}
                        className="shrink-0 rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="mt-0.5 block truncate text-[11px] font-normal text-stone-500">
                      {l.address}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className="border-t border-stone-100 dark:border-stone-800">
                  <td className="sticky left-0 z-10 bg-white p-2 text-xs font-semibold tracking-wider text-stone-400 uppercase dark:bg-stone-900">
                    {row.label}
                  </td>
                  {listings.map((l) => (
                    <td key={l.id} className="p-2 text-stone-700 tabular-nums dark:text-stone-300">
                      {row.render(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}
