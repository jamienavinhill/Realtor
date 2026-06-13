"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  GitCompareArrows,
  Heart,
  LayoutGrid,
  LineChart,
  MapPin,
  PieChart as PieChartIcon,
  Table as TableIcon,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ListingProperty } from "../../types/listings";
import { Dialog } from "../ui/dialog";
import { DataTable, type DataTableColumn } from "../ui/data-table";
import type { ListingPreferencesApi } from "@/lib/hooks/useListingPreferences";
import {
  computeMetrics,
  listingsByCity,
  priceHistogram,
  pricePerSqft,
  pricePerSqftByType,
  propertyTypeMix,
  selectActiveListings,
  statusBreakdown,
} from "@/lib/cma/analytics";
import { NoListingMedia } from "./ListingsGrid";

/**
 * Comparative Market Analysis (WS13). Charts row on top, full-width sortable +
 * paginated table below (tabbed Charts | Data). Every figure is derived from the
 * real Firestore inventory passed in `properties` — no synthetic chart values.
 * Rows open a compact drill-down dialog (reusing the shared WS12 `Dialog`); a
 * compare column wires into the WS4 compare queue (cap enforced by the hook).
 */

// Categorical palette (set in theme-controls). Distinct pink/purple/orange + accent-driven for visual variety
// while still feeling cohesive with the user's chosen accent.
const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function CMAView({
  properties,
  prefs,
  isSignedIn = false,
}: {
  properties: ListingProperty[];
  /** Per-user preferences/compare API (WS4). Undefined when signed out. */
  prefs?: ListingPreferencesApi;
  isSignedIn?: boolean;
}) {
  const [view, setView] = useState<"charts" | "data">("charts");
  const [selected, setSelected] = useState<ListingProperty | null>(null);

  const activeListings = useMemo(() => selectActiveListings(properties), [properties]);
  const metrics = useMemo(() => computeMetrics(activeListings), [activeListings]);

  const histogram = useMemo(() => priceHistogram(activeListings), [activeListings]);
  const ppsfByType = useMemo(() => pricePerSqftByType(activeListings), [activeListings]);
  const byCity = useMemo(() => listingsByCity(activeListings), [activeListings]);
  const typeMix = useMemo(() => propertyTypeMix(activeListings), [activeListings]);
  // Status breakdown reflects the full inventory so Pending/Sold are visible.
  const statuses = useMemo(() => statusBreakdown(properties), [properties]);

  const columns = useMemo<DataTableColumn<ListingProperty>[]>(() => {
    const cols: DataTableColumn<ListingProperty>[] = [];
    // The compare column writes to the workspace compare queue, so it is shown only when
    // the active role may write (owner/editor); viewers (WS18) get a read-only table.
    if (prefs && isSignedIn && (prefs.canWrite ?? true)) {
      cols.push({
        id: "compare",
        header: "Compare",
        ariaLabel: "add to comparison",
        className: "w-16 text-center",
        render: (row) => {
          const checked = prefs.compareIds.includes(row.id);
          return (
            <input
              type="checkbox"
              checked={checked}
              aria-label={`${checked ? "Remove" : "Add"} ${row.address} ${
                checked ? "from" : "to"
              } comparison`}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation();
                if (checked) {
                  void prefs.removeFromCompare(row.id);
                } else {
                  void prefs.addToCompare(row.id);
                }
              }}
              className="text-primary-600 focus:ring-primary-500 h-4 w-4 cursor-pointer rounded border-stone-300 dark:border-stone-600"
            />
          );
        },
      });
    }
    cols.push(
      {
        id: "address",
        header: "Address",
        accessor: (row) => row.address,
        className: "font-medium text-stone-900 dark:text-stone-200",
        render: (row) => row.address,
      },
      {
        id: "city",
        header: "City",
        accessor: (row) => row.city,
        className: "text-stone-500",
        render: (row) => row.city,
      },
      {
        id: "type",
        header: "Type",
        accessor: (row) => row.propertyType,
        className: "text-stone-500",
        render: (row) => row.propertyType,
      },
      {
        id: "price",
        header: "Price",
        accessor: (row) => row.price,
        className:
          "text-primary-600 dark:text-primary-400 text-right font-mono font-medium tabular-nums",
        render: (row) => `$${row.price.toLocaleString()}`,
      },
      {
        id: "beds",
        header: "Beds",
        accessor: (row) => row.beds,
        className: "text-center text-stone-600 tabular-nums dark:text-stone-400",
        render: (row) => row.beds,
      },
      {
        id: "baths",
        header: "Baths",
        accessor: (row) => row.baths,
        className: "text-center text-stone-600 tabular-nums dark:text-stone-400",
        render: (row) => row.baths,
      },
      {
        id: "sqft",
        header: "SqFt",
        accessor: (row) => row.sqft,
        className: "text-right font-mono text-stone-500 tabular-nums",
        render: (row) => row.sqft.toLocaleString(),
      },
      {
        id: "ppsf",
        header: "$/sqft",
        accessor: (row) => pricePerSqft(row),
        className: "text-right font-mono text-stone-500 tabular-nums",
        render: (row) => {
          const v = pricePerSqft(row);
          return v === null ? "—" : `$${v}`;
        },
      },
    );
    return cols;
  }, [prefs, isSignedIn]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold tracking-tight text-stone-900 dark:text-white">
            Comparative Market Analysis
          </h1>
          <p className="text-sm text-stone-500">
            Live analytics for the current Firestore inventory — no simulated comparables.
          </p>
        </div>
        {activeListings.length > 0 && (
          <div
            role="tablist"
            aria-label="CMA view"
            className="inline-flex rounded-xl border border-stone-200 bg-white p-1 text-sm dark:border-stone-800 dark:bg-stone-900"
          >
            <ViewTab
              id="cma-tab-charts"
              controls="cma-panel-charts"
              active={view === "charts"}
              onClick={() => setView("charts")}
              icon={<LayoutGrid className="h-4 w-4" />}
              label="Charts"
            />
            <ViewTab
              id="cma-tab-data"
              controls="cma-panel-data"
              active={view === "data"}
              onClick={() => setView("data")}
              icon={<TableIcon className="h-4 w-4" />}
              label="Data"
            />
          </div>
        )}
      </div>

      {activeListings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-200 bg-white p-10 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LineChart className="text-primary-500 mx-auto mb-4 h-8 w-8" />
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Real CMA data is not loaded yet
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-500">
            Run the provider-backed 44224 baseline backfill to populate real active listings. This
            screen stays empty rather than show simulated prices or placeholder comparable data.
          </p>
        </div>
      ) : (
        <>
          {/* Compact metric chips (replaces the oversized metric cards). */}
          <div className="mb-6 flex flex-wrap gap-2">
            <MetricChip label="Active" value={metrics.count.toLocaleString()} />
            <MetricChip label="Avg price" value={`$${metrics.avgPrice.toLocaleString()}`} />
            <MetricChip label="Median" value={`$${metrics.medianPrice.toLocaleString()}`} />
            <MetricChip label="Avg $/sqft" value={`$${metrics.avgPricePerSqft.toLocaleString()}`} />
            <MetricChip label="Low" value={`$${metrics.minPrice.toLocaleString()}`} />
            <MetricChip label="High" value={`$${metrics.maxPrice.toLocaleString()}`} />
          </div>

          {view === "charts" ? (
            <div
              id="cma-panel-charts"
              role="tabpanel"
              aria-labelledby="cma-tab-charts"
              className="grid grid-cols-1 gap-6 lg:grid-cols-2"
            >
              <ChartCard
                title="Price distribution"
                icon={<BarChart3 className="text-primary-500 h-4 w-4" />}
              >
                {histogram.length === 0 ? (
                  <NotEnoughData />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={histogram}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#3f3f46"
                        opacity={0.2}
                      />
                      <XAxis
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => [`${value} listings`, "Count"]}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-1)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Avg $/sqft by type"
                icon={<Building2 className="text-primary-500 h-4 w-4" />}
              >
                {ppsfByType.length === 0 ? (
                  <NotEnoughData />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={ppsfByType}
                      layout="vertical"
                      margin={{ top: 5, right: 16, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#3f3f46"
                        opacity={0.2}
                      />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        width={90}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value, _name, item) => [
                          `$${Number(value).toLocaleString()} /sqft · ${item?.payload?.count ?? 0} listings`,
                          "Avg $/sqft",
                        ]}
                      />
                      <Bar dataKey="avgPricePerSqft" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {ppsfByType.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Listings by city"
                icon={<MapPin className="text-primary-500 h-4 w-4" />}
              >
                {byCity.length === 0 ? (
                  <NotEnoughData />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart
                      data={byCity}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="#3f3f46"
                        opacity={0.2}
                      />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                        interval={0}
                        angle={-25}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "transparent" }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value) => [`${value} listings`, "Count"]}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--chart-4)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                      />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard
                title="Property-type mix"
                icon={<PieChartIcon className="text-primary-500 h-4 w-4" />}
              >
                {typeMix.length === 0 ? <NotEnoughData /> : <CategoryPie data={typeMix} />}
              </ChartCard>

              <ChartCard
                title="Status breakdown"
                icon={<PieChartIcon className="text-primary-500 h-4 w-4" />}
                subtitle="Full inventory"
              >
                {statuses.length === 0 ? <NotEnoughData /> : <CategoryPie data={statuses} />}
              </ChartCard>
            </div>
          ) : (
            <div
              id="cma-panel-data"
              role="tabpanel"
              aria-labelledby="cma-tab-data"
              className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                  CMA basis data
                </h3>
                <span className="text-xs text-stone-500">
                  {activeListings.length} active listing{activeListings.length === 1 ? "" : "s"} ·
                  click a row for detail
                </span>
              </div>
              <DataTable
                columns={columns}
                rows={activeListings}
                rowKey={(row) => row.id}
                initialSort={{ key: "price", direction: "desc" }}
                onRowClick={(row) => setSelected(row)}
                caption="Active listings with price, size, and per-square-foot metrics. Sortable by column."
              />
            </div>
          )}
        </>
      )}

      <CmaListingDialog
        listing={selected}
        onClose={() => setSelected(null)}
        prefs={prefs}
        isSignedIn={isSignedIn}
      />
    </div>
  );
}

const TOOLTIP_STYLE = {
  borderRadius: "12px",
  border: "none",
  boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
} as const;

function ViewTab({
  id,
  controls,
  active,
  onClick,
  icon,
  label,
}: {
  id: string;
  controls: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
        active
          ? "bg-primary-500 text-white"
          : "text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-baseline gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <span className="text-[11px] font-medium tracking-wide text-stone-400 uppercase">
        {label}
      </span>
      <span className="text-primary-600 dark:text-primary-400 text-sm font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h3>
        {subtitle ? <span className="text-xs text-stone-400">· {subtitle}</span> : null}
      </div>
      <div className="h-64 w-full">{children}</div>
    </div>
  );
}

function NotEnoughData() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center text-center">
      <BarChart3 className="mb-2 h-6 w-6 text-stone-300 dark:text-stone-600" />
      <p className="text-xs text-stone-400">Not enough data to chart yet.</p>
    </div>
  );
}

function CategoryPie({ data }: { data: { name: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RechartsPieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={75}
          paddingAngle={2}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(value, name) => [`${value} listings`, name]}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          wrapperStyle={{ fontSize: 11 }}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}

/**
 * Compact row drill-down reusing the shared WS12 `Dialog` shell. Surfaces the key
 * comparison facts plus the WS4 per-user actions (interested / favorite / compare)
 * without duplicating the full listing-grid modal.
 */
function CmaListingDialog({
  listing,
  onClose,
  prefs,
  isSignedIn,
}: {
  listing: ListingProperty | null;
  onClose: () => void;
  prefs?: ListingPreferencesApi;
  isSignedIn: boolean;
}) {
  if (!listing) return null;

  const images = (
    listing.imageUrls && listing.imageUrls.length > 0 ? listing.imageUrls : [listing.imageUrl]
  ).filter(Boolean);
  const ppsf = pricePerSqft(listing);
  const state = prefs?.states[listing.id];
  const inCompare = prefs?.compareIds.includes(listing.id) ?? false;
  // Viewers of a shared workspace (WS18) are read-only.
  const canWrite = prefs?.canWrite ?? true;

  const footer =
    isSignedIn && prefs && canWrite ? (
      <div className="flex flex-wrap gap-1.5">
        <CMAActionChip
          active={state === "interested"}
          label="Interested"
          icon={<ThumbsUp className="h-3.5 w-3.5" />}
          onClick={() => void prefs.setState(listing.id, "interested")}
        />
        <CMAActionChip
          active={state === "notInterested"}
          label="Not interested"
          icon={<ThumbsDown className="h-3.5 w-3.5" />}
          onClick={() => void prefs.setState(listing.id, "notInterested")}
        />
        <CMAActionChip
          active={state === "favorite"}
          label="Favorite"
          icon={<Heart className={`h-3.5 w-3.5 ${state === "favorite" ? "fill-current" : ""}`} />}
          onClick={() => void prefs.setState(listing.id, "favorite")}
        />
        <CMAActionChip
          active={inCompare}
          label={inCompare ? "In compare" : "Compare"}
          icon={<GitCompareArrows className="h-3.5 w-3.5" />}
          onClick={() => {
            if (inCompare) {
              void prefs.removeFromCompare(listing.id);
            } else {
              void prefs.addToCompare(listing.id);
            }
          }}
        />
      </div>
    ) : isSignedIn && prefs && !canWrite ? (
      <p className="text-xs text-stone-500">You have view-only access to this workspace.</p>
    ) : (
      <p className="text-xs text-stone-500">Sign in to save preferences and compare listings.</p>
    );

  return (
    <Dialog
      open={Boolean(listing)}
      onClose={onClose}
      size="lg"
      title={listing.title}
      subtitle={`${listing.address}, ${listing.city}, ${listing.state} ${listing.zipCode}`}
      footer={footer}
    >
      <div className="space-y-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-stone-950">
          {images.length > 0 ? (
            <img
              src={images[0]}
              alt={listing.title}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <NoListingMedia />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-primary-600 dark:text-primary-400 font-mono text-xl font-semibold">
            ${listing.price.toLocaleString()}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {listing.status} · {listing.propertyType}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <CMAFact label="Beds" value={listing.beds} />
          <CMAFact label="Baths" value={listing.baths} />
          <CMAFact label="Sq ft" value={listing.sqft.toLocaleString()} />
          <CMAFact label="$/sqft" value={ppsf === null ? "—" : `$${ppsf}`} />
          <CMAFact label="Year" value={listing.yearBuilt ?? "—"} />
          {typeof listing.distanceMiles === "number" && (
            <CMAFact label="Distance" value={`${listing.distanceMiles.toFixed(1)} mi`} />
          )}
        </div>

        {listing.sourceUrl ? (
          <a
            href={listing.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 dark:text-primary-400 inline-block text-xs font-medium hover:underline"
          >
            View source listing ↗
          </a>
        ) : null}
      </div>
    </Dialog>
  );
}

function CMAFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-800 dark:bg-stone-950">
      <span className="block text-[10px] tracking-wider text-stone-400 uppercase">{label}</span>
      <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
        {value}
      </span>
    </div>
  );
}

function CMAActionChip({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-primary-500 bg-primary-500 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
