"use client";

import * as React from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  nextSortState,
  paginate,
  sortByAccessor,
  type SortDirection,
  type SortState,
} from "@/lib/cma/analytics";

/**
 * Reusable paginated + sortable table (WS13). Pure rendering on top of the
 * React-free helpers in `lib/cma/analytics.ts` so the sort/pagination logic stays
 * unit-tested. Columns declare an `accessor` (the sort key) and a `render`. The
 * component owns sort + page + page-size state but lifts row identity out via
 * `rowKey` for stable keys, and exposes an optional `onRowClick` for drill-down.
 *
 * Accessibility: column headers are real `<button>`s inside `<th scope="col">`
 * with `aria-sort`; pagination controls are labelled; the page-size control is a
 * labelled `<select>`.
 */

export interface DataTableColumn<T> {
  /** Stable column id (used for sort state + React keys). */
  id: string;
  header: React.ReactNode;
  /** Cell renderer. */
  render: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  accessor?: (row: T) => string | number | null | undefined;
  /** Tailwind alignment/utility classes applied to header + cells. */
  className?: string;
  /** Accessible label when `header` is not plain text (e.g. an icon-only column). */
  ariaLabel?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Returns a stable string key for a row (and optionally its index in the current rows array).
   * Index is provided for transient lists (e.g. pre-commit harvested previews) that lack durable ids. */
  rowKey: (row: T, index?: number) => string;
  /** Optional initial sort. Defaults to the first sortable column ascending. */
  initialSort?: SortState<string>;
  defaultPageSize?: number;
  onRowClick?: (row: T) => void;
  /** Accessible caption / table summary. */
  caption?: string;
  /** Shown when `rows` is empty. */
  emptyState?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  onRowClick,
  caption,
  emptyState,
}: DataTableProps<T>) {
  const firstSortable = columns.find((c) => c.accessor);
  const [sort, setSort] = React.useState<SortState<string> | null>(
    initialSort ?? (firstSortable ? { key: firstSortable.id, direction: "asc" } : null),
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  const sortedRows = React.useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.key);
    if (!col?.accessor) return rows;
    return sortByAccessor(rows, col.accessor, sort.direction);
  }, [rows, columns, sort]);

  // Reset to page 1 whenever the data set or sort changes so we never strand the
  // user on an out-of-range page.
  React.useEffect(() => {
    setPage(1);
  }, [rows, sort, pageSize]);

  const pageResult = paginate(sortedRows, page, pageSize);

  const handleSort = (col: DataTableColumn<T>) => {
    if (!col.accessor) return;
    setSort((current) =>
      current ? nextSortState(current, col.id) : { key: col.id, direction: "asc" },
    );
  };

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-stone-50 text-xs text-stone-500 uppercase dark:bg-stone-950/50">
            <tr>
              {columns.map((col) => {
                const sortable = Boolean(col.accessor);
                const isSorted = sort?.key === col.id;
                const ariaSort: React.AriaAttributes["aria-sort"] = !sortable
                  ? undefined
                  : isSorted
                    ? sort?.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : "none";
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`px-4 py-3 font-medium ${col.className ?? ""}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        aria-label={
                          col.ariaLabel
                            ? `Sort by ${col.ariaLabel}`
                            : typeof col.header === "string"
                              ? `Sort by ${col.header}`
                              : "Sort column"
                        }
                        className="inline-flex cursor-pointer items-center gap-1 uppercase transition hover:text-stone-800 dark:hover:text-stone-200"
                      >
                        {col.header}
                        <SortIcon active={isSorted} direction={sort?.direction} />
                      </button>
                    ) : (
                      <span aria-label={col.ariaLabel}>{col.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageResult.rows.map((row, index) => {
              const key = rowKey(row, index);
              const clickable = Boolean(onRowClick);
              return (
                <tr
                  key={key}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  className={`border-b border-stone-100 transition last:border-0 dark:border-stone-800/60 ${
                    clickable
                      ? "focus:ring-primary-500 cursor-pointer hover:bg-stone-50 focus:ring-2 focus:outline-none focus:ring-inset dark:hover:bg-stone-800/50"
                      : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.id} className={`px-4 py-3 ${col.className ?? ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pageResult.page}
        pageCount={pageResult.pageCount}
        pageSize={pageSize}
        total={pageResult.total}
        startIndex={pageResult.startIndex}
        endIndex={pageResult.endIndex}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction?: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />;
  return direction === "asc" ? (
    <ChevronUp className="h-3 w-3" aria-hidden="true" />
  ) : (
    <ChevronDown className="h-3 w-3" aria-hidden="true" />
  );
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  startIndex,
  endIndex,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  startIndex: number;
  endIndex: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const selectId = React.useId();
  const showingFrom = total === 0 ? 0 : startIndex + 1;
  const showingTo = total === 0 ? 0 : endIndex + 1;

  return (
    <nav
      aria-label="Table pagination"
      className="flex flex-col gap-3 border-t border-stone-100 px-4 py-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800/60"
    >
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="whitespace-nowrap">
          Rows per page
        </label>
        <select
          id={selectId}
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="focus:border-primary-500 rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <span className="whitespace-nowrap tabular-nums">
          {showingFrom}–{showingTo} of {total}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
        >
          Previous
        </button>
        <span className="whitespace-nowrap tabular-nums" aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
