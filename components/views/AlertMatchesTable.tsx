"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { DataTable, type DataTableColumn } from "../ui/data-table";
import { Dialog } from "../ui/dialog";
import type { AlertMatch, ListingProperty } from "../../types/listings";

/**
 * Persisted alert matches as a sortable, paginated table (reuses the shared WS13
 * `DataTable` + global page-size lane). The full match reason is kept out of the
 * row to let the table breathe — a thin "+" column opens a small on-brand dialog
 * with the reason. "View" reuses the existing navigate-to-listing behavior.
 */
export interface AlertMatchRow {
  match: AlertMatch;
  alert?: { name: string };
  property?: ListingProperty;
}

export function AlertMatchesTable({
  matches,
  onView,
}: {
  matches: AlertMatchRow[];
  onView: (property: ListingProperty) => void;
}) {
  const [reasonRow, setReasonRow] = React.useState<AlertMatchRow | null>(null);

  const columns: DataTableColumn<AlertMatchRow>[] = [
    {
      id: "alert",
      header: "Alert",
      accessor: (r) => r.alert?.name ?? "",
      render: (r) => (
        <span className="bg-primary-500/10 text-primary-500 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase">
          {r.alert?.name || "Deleted alert"}
        </span>
      ),
    },
    {
      id: "listing",
      header: "Listing",
      accessor: (r) => r.property?.title ?? `Listing ${r.match.listingId}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-stone-900 dark:text-stone-100">
            {r.property?.title || `Listing ${r.match.listingId}`}
          </p>
          <p className="truncate font-mono text-[11px] text-stone-500">
            {r.property
              ? `${r.property.address}, ${r.property.city}`
              : "Details unavailable until inventory syncs."}
          </p>
        </div>
      ),
    },
    {
      id: "price",
      header: "Price",
      accessor: (r) => r.property?.price ?? 0,
      className: "text-right whitespace-nowrap tabular-nums",
      render: (r) => (r.property ? `$${r.property.price.toLocaleString()}` : "—"),
    },
    {
      id: "lastSeen",
      header: "Last seen",
      accessor: (r) => r.match.lastSeenAt,
      className: "whitespace-nowrap",
      render: (r) => (
        <span className="font-mono text-[11px] text-stone-500">
          {new Date(r.match.lastSeenAt).toLocaleString()}
        </span>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      ariaLabel: "Match reason",
      className: "w-16 text-center",
      render: (r) => (
        <button
          type="button"
          onClick={() => setReasonRow(r)}
          title="Why this matched"
          aria-label="Why this matched"
          className="hover:border-primary-500 hover:text-primary-500 inline-flex h-6 w-6 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition dark:border-stone-700"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      ),
    },
    {
      id: "view",
      header: "",
      ariaLabel: "View listing",
      className: "w-16 text-right",
      render: (r) =>
        r.property ? (
          <button
            type="button"
            onClick={() => onView(r.property as ListingProperty)}
            className="text-primary-600 dark:text-primary-400 text-xs font-semibold hover:underline"
          >
            View
          </button>
        ) : null,
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={matches}
        rowKey={(r) => r.match.id}
        initialSort={{ key: "lastSeen", direction: "desc" }}
        caption="Persisted alert matches"
      />

      <Dialog
        open={Boolean(reasonRow)}
        onClose={() => setReasonRow(null)}
        size="sm"
        title="Match reason"
        subtitle={reasonRow?.alert?.name || "Deleted alert"}
      >
        {reasonRow ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900 dark:text-stone-100">
              {reasonRow.property?.title || `Listing ${reasonRow.match.listingId}`}
            </p>
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/40">
              <p className="mb-1 text-[10px] font-semibold tracking-wider text-stone-400 uppercase">
                Why this matched
              </p>
              <p className="font-mono text-xs leading-relaxed text-stone-700 dark:text-stone-300">
                {reasonRow.match.matchReason}
              </p>
            </div>
            <p className="font-mono text-[10px] text-stone-400">
              Last seen {new Date(reasonRow.match.lastSeenAt).toLocaleString()}
            </p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
