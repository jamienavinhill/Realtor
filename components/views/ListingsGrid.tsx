"use client";

import React, { useState } from "react";
import { ListingProperty, ListingUserState } from "../../types/listings";
import {
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Sheet,
  Calendar,
  Trash2,
  Loader2,
  Heart,
  ThumbsUp,
  ThumbsDown,
  EyeOff,
  GitCompareArrows,
  Star,
} from "lucide-react";
import { Dialog } from "../ui/dialog";
import type { ListingPreferencesApi } from "@/lib/hooks/useListingPreferences";

interface ListingsGridProps {
  properties: ListingProperty[];
  totalPropertyCount?: number;
  hasActiveFilters?: boolean;
  onExportToSheet?: (property: ListingProperty) => void;
  onScheduleViewing?: (property: ListingProperty) => void;
  onDeleteProperty?: (propertyId: string) => void;
  sheetsExportingPropId?: string | null;
  calendarSchedulingPropId?: string | null;
  calendarEventTime?: string;
  onCalendarEventTimeChange?: (value: string) => void;
  hasWorkspaceAccess?: boolean;
  /** Per-user listing preferences API (WS4). Undefined when signed out. */
  prefs?: ListingPreferencesApi;
  /** Whether a user is signed in (gates per-user actions). */
  isSignedIn?: boolean;
  /** Run Gemini-backed analysis for a listing; returns analysis text or throws. */
  onAnalyze?: (property: ListingProperty) => Promise<string>;
}

export function ListingsGrid({
  properties,
  totalPropertyCount = 0,
  hasActiveFilters = false,
  onExportToSheet,
  onScheduleViewing,
  onDeleteProperty,
  sheetsExportingPropId = null,
  calendarSchedulingPropId = null,
  calendarEventTime = "",
  onCalendarEventTimeChange,
  hasWorkspaceAccess = false,
  prefs,
  isSignedIn = false,
  onAnalyze,
}: ListingsGridProps) {
  const [selectedProperty, setSelectedProperty] = useState<ListingProperty | null>(null);

  if (properties.length === 0) {
    const inventoryEmpty = totalPropertyCount === 0;

    return (
      <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-32 text-center dark:border-stone-800 dark:bg-stone-900/40">
        <h3 className="text-base font-semibold text-stone-900 dark:text-stone-100">
          {inventoryEmpty ? "No listings loaded yet" : "No listings match your filters"}
        </h3>
        {inventoryEmpty ? (
          <div className="mx-auto mt-4 max-w-xl space-y-3 text-sm leading-6 text-stone-500">
            <p>
              Abode Alerts has no baseline inventory in Firestore yet. Run the protected 44224
              backfill to populate real active listings within a 10-mile radius of Stow, Ohio.
            </p>
            <p className="font-mono text-xs text-stone-400">
              Operator: <code>npm run backfill</code> or POST /api/ingest/backfill with your ingest
              job token.
            </p>
            <p>
              You can also ingest individual listings from Gmail or pasted alert text in the Ingest
              tab after connecting Google Workspace.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-stone-500">
            {hasActiveFilters
              ? "Try clearing your search or city filter to see the full inventory."
              : "Adjust your filters to see more listings."}
          </p>
        )}
      </div>
    );
  }

  const selectedIndex = selectedProperty
    ? properties.findIndex((p) => p.id === selectedProperty.id)
    : -1;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {properties.map((prop) => (
          <PropertyCard
            key={prop.id}
            property={prop}
            state={prefs?.states[prop.id]}
            inCompare={prefs?.compareIds.includes(prop.id) ?? false}
            onClick={() => setSelectedProperty(prop)}
          />
        ))}
      </div>

      <PropertyProfileModal
        property={selectedProperty}
        onClose={() => setSelectedProperty(null)}
        onExportToSheet={onExportToSheet}
        onScheduleViewing={onScheduleViewing}
        onDeleteProperty={onDeleteProperty}
        sheetsExportingPropId={sheetsExportingPropId}
        calendarSchedulingPropId={calendarSchedulingPropId}
        calendarEventTime={calendarEventTime}
        onCalendarEventTimeChange={onCalendarEventTimeChange}
        hasWorkspaceAccess={hasWorkspaceAccess}
        prefs={prefs}
        isSignedIn={isSignedIn}
        onAnalyze={onAnalyze}
        onPrev={
          selectedIndex > 0 ? () => setSelectedProperty(properties[selectedIndex - 1]) : undefined
        }
        onNext={
          selectedIndex >= 0 && selectedIndex < properties.length - 1
            ? () => setSelectedProperty(properties[selectedIndex + 1])
            : undefined
        }
      />
    </>
  );
}

function PropertyCard({
  property,
  state,
  inCompare,
  onClick,
}: {
  property: ListingProperty;
  state?: ListingUserState;
  inCompare: boolean;
  onClick: () => void;
}) {
  const images = (
    property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.imageUrl]
  ).filter(Boolean);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <article className="group hover:border-primary-400 dark:hover:border-primary-600 w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-left shadow-sm transition-all hover:shadow-md dark:border-stone-800 dark:bg-stone-900">
      {/* Image area click opens detail dialog (explicit, not the meta/detail panel below). */}
      <div
        tabIndex={0}
        onClick={onClick}
        onKeyDown={handleCardKeyDown}
        className="relative aspect-4/3 cursor-pointer overflow-hidden bg-stone-100 dark:bg-stone-950"
      >
        {images.length > 0 ? (
          <img
            src={images[currentImageIdx]}
            alt={property.title}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
            referrerPolicy="no-referrer"
          />
        ) : (
          <NoListingMedia />
        )}

        {images.length > 1 && (
          <div
            className="absolute inset-0 flex items-center justify-between px-2 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handlePrev}
              className="rounded-full bg-stone-900/60 p-1.5 text-white backdrop-blur-sm transition hover:bg-stone-900/90"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full bg-stone-900/60 p-1.5 text-white backdrop-blur-sm transition hover:bg-stone-900/90"
              aria-label="Next image"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {images.length > 1 && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {images.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${i === currentImageIdx ? "w-3 bg-white" : "w-1 bg-white/50"}`}
              />
            ))}
          </div>
        )}

        <div className="absolute top-2 left-2 flex gap-1.5">
          <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-stone-900 shadow-sm backdrop-blur-md dark:bg-stone-900/90 dark:text-white">
            {property.status}
          </span>
        </div>

        {/* Per-user state badges (favorite / interested) so the grid reflects saved prefs. */}
        <div className="absolute top-2 right-2 flex gap-1.5">
          {state === "favorite" && (
            <span
              className="rounded-md bg-rose-500/90 p-1 text-white shadow-sm"
              title="Favorited"
            >
              <Heart className="h-3 w-3 fill-current" />
            </span>
          )}
          {state === "interested" && (
            <span
              className="rounded-md bg-emerald-500/90 p-1 text-white shadow-sm"
              title="Interested"
            >
              <ThumbsUp className="h-3 w-3" />
            </span>
          )}
          {inCompare && (
            <span
              className="rounded-md bg-stone-900/80 p-1 text-white shadow-sm"
              title="In compare"
            >
              <GitCompareArrows className="h-3 w-3" />
            </span>
          )}
        </div>
      </div>

      {/* Meta / summary panel below image — does not open dialog (image click does). */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-stone-900 dark:text-white">
            {property.title}
          </h3>
          <span className="text-primary-600 dark:text-primary-400 shrink-0 font-mono text-sm font-semibold">
            ${property.price.toLocaleString()}
          </span>
        </div>
        <p className="mt-0.5 flex items-center text-xs text-stone-500">
          <MapPin className="mr-1 h-3 w-3 shrink-0" />
          <span className="truncate">
            {property.address}, {property.city}
          </span>
        </p>

        <div className="mt-2.5 flex items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
          <span className="flex items-center gap-1">
            <BedDouble className="h-3.5 w-3.5 text-stone-400" />
            {property.beds} bd
          </span>
          <span className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5 text-stone-400" />
            {property.baths} ba
          </span>
          <span className="flex items-center gap-1">
            <Maximize2 className="h-3.5 w-3.5 text-stone-400" />
            {property.sqft.toLocaleString()} sqft
          </span>
        </div>
      </div>
    </article>
  );
}

export function NoListingMedia() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-stone-100 to-stone-200 p-6 text-center dark:from-stone-900 dark:to-stone-950">
      <div>
        <MapPin className="mx-auto mb-2 h-6 w-6 text-stone-400" />
        <p className="text-[10px] font-semibold tracking-wider text-stone-500 uppercase">
          No listing media
        </p>
      </div>
    </div>
  );
}

interface PropertyProfileModalProps {
  property: ListingProperty | null;
  onClose: () => void;
  onExportToSheet?: (property: ListingProperty) => void;
  onScheduleViewing?: (property: ListingProperty) => void;
  onDeleteProperty?: (propertyId: string) => void;
  sheetsExportingPropId?: string | null;
  calendarSchedulingPropId?: string | null;
  calendarEventTime?: string;
  onCalendarEventTimeChange?: (value: string) => void;
  hasWorkspaceAccess?: boolean;
  prefs?: ListingPreferencesApi;
  isSignedIn?: boolean;
  onAnalyze?: (property: ListingProperty) => Promise<string>;
  /** Navigate to the previous/next listing in the current list (undefined at the ends). */
  onPrev?: () => void;
  onNext?: () => void;
}

function PropertyProfileModal({
  property,
  onClose,
  onExportToSheet,
  onScheduleViewing,
  onDeleteProperty,
  sheetsExportingPropId = null,
  calendarSchedulingPropId = null,
  calendarEventTime = "",
  onCalendarEventTimeChange,
  hasWorkspaceAccess = false,
  prefs,
  isSignedIn = false,
  onAnalyze,
  onPrev,
  onNext,
}: PropertyProfileModalProps) {
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Reset transient dialog state whenever the selected listing changes.
  React.useEffect(() => {
    setCurrentImageIdx(0);
    setShowWorkspace(false);
    setAnalysis(null);
    setAnalyzing(false);
  }, [property?.id]);

  if (!property) {
    return null;
  }

  const images = (
    property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.imageUrl]
  ).filter(Boolean);
  const isExporting = sheetsExportingPropId === property.id;
  const isScheduling = calendarSchedulingPropId === property.id;
  const state = prefs?.states[property.id];
  const inCompare = prefs?.compareIds.includes(property.id) ?? false;

  const handleAnalyze = async () => {
    if (!onAnalyze) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const text = await onAnalyze(property);
      setAnalysis(text);
    } catch {
      // The dashboard surfaces the error toast; keep the panel clean.
    } finally {
      setAnalyzing(false);
    }
  };

  const pricePerSqft = property.sqft > 0 ? Math.round(property.price / property.sqft) : null;

  // Viewers of a shared workspace (WS18) are read-only: the mutating preference chips are
  // hidden and replaced with an honest read-only note. Owners/editors get full controls.
  const canWrite = prefs?.canWrite ?? true;
  const hasIconActions =
    isSignedIn && ((Boolean(prefs) && canWrite) || hasWorkspaceAccess || Boolean(onDeleteProperty));
  const hasTextActions = isSignedIn && (Boolean(onAnalyze) || (Boolean(prefs) && canWrite));

  // Action bar: the self-evident states (interested/not, favorite, hide, schedule) are
  // icon-only with tooltips; Compare + Analyze keep their text. Never icon+text on the same
  // control — one tidy row instead of a wall of labelled chips.
  const footer = (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {isSignedIn && prefs && canWrite && (
          <>
            <ActionChip
              iconOnly
              active={state === "interested"}
              label="Interested"
              icon={<ThumbsUp className="h-4 w-4" />}
              onClick={() => prefs.setState(property.id, "interested")}
            />
            <ActionChip
              iconOnly
              active={state === "notInterested"}
              label="Not interested"
              icon={<ThumbsDown className="h-4 w-4" />}
              onClick={() => prefs.setState(property.id, "notInterested")}
            />
            <ActionChip
              iconOnly
              active={state === "favorite"}
              label="Favorite"
              icon={<Heart className={`h-4 w-4 ${state === "favorite" ? "fill-current" : ""}`} />}
              onClick={() => prefs.setState(property.id, "favorite")}
            />
            <ActionChip
              iconOnly
              active={state === "hidden"}
              label="Hide"
              icon={<EyeOff className="h-4 w-4" />}
              onClick={() => {
                prefs.setState(property.id, "hidden");
                onClose();
              }}
            />
          </>
        )}

        {isSignedIn && (hasWorkspaceAccess || onDeleteProperty) && (
          <ActionChip
            iconOnly
            active={showWorkspace}
            label="Export / Schedule"
            icon={<Calendar className="h-4 w-4" />}
            onClick={() => setShowWorkspace((v) => !v)}
          />
        )}

        {hasIconActions && hasTextActions && (
          <span className="mx-1 h-5 w-px bg-stone-200 dark:bg-stone-700" aria-hidden="true" />
        )}

        {isSignedIn && prefs && canWrite && (
          <button
            type="button"
            onClick={() => prefs.addToCompare(property.id)}
            aria-pressed={inCompare}
            className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              inCompare
                ? "border-primary-500 bg-primary-500 text-white"
                : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
            }`}
          >
            {inCompare ? "In compare" : "Compare"}
          </button>
        )}

        {isSignedIn && onAnalyze && (
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="text-primary-700 dark:text-primary-300 border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-950/40 hover:bg-primary-100 dark:hover:bg-primary-900/40 inline-flex items-center rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : "Analyze"}
          </button>
        )}
      </div>

      {isSignedIn && prefs && !canWrite ? (
        <p className="text-xs text-stone-500">
          You have view-only access to this workspace. Saved states reflect the owner&apos;s
          preferences.
        </p>
      ) : !isSignedIn ? (
        <p className="text-xs text-stone-500">Sign in to save preferences, compare, and analyze.</p>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Floating prev/next LISTING arrows — to the sides of the dialog, not on it. */}
      {(onPrev || onNext) && (
        <div className="pointer-events-none fixed inset-0 z-[60] hidden items-center justify-between px-3 sm:px-5 md:flex">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label="Previous listing"
            className="hover:text-primary-600 dark:hover:text-primary-400 pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-700 shadow-lg backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-30 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label="Next listing"
            className="hover:text-primary-600 dark:hover:text-primary-400 pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-white/90 text-stone-700 shadow-lg backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-30 dark:border-stone-700 dark:bg-stone-900/90 dark:text-stone-200"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
      <Dialog
        open={Boolean(property)}
        onClose={onClose}
        size="3xl"
        title={property.title}
        subtitle={`${property.address}, ${property.city}, ${property.state} ${property.zipCode}`}
        footer={footer}
      >
        {/* Media left, all listing info right; analysis + workspace span full width below. */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Media */}
          <div className="relative aspect-[4/3] w-full self-start overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-950">
            {images.length > 0 ? (
              <img
                src={images[currentImageIdx]}
                alt={`${property.title} — photo ${currentImageIdx + 1} of ${images.length}`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <NoListingMedia />
            )}
            {images.length > 1 && (
              <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 items-center justify-between px-3">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length)
                  }
                  className="rounded-full bg-black/40 p-2 text-white backdrop-blur-md transition hover:bg-black/60"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentImageIdx((prev) => (prev + 1) % images.length)}
                  className="rounded-full bg-black/40 p-2 text-white backdrop-blur-md transition hover:bg-black/60"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* RIGHT column — price, facts, details */}
          <div className="flex flex-col gap-3">
            {/* Price + key facts: compact chips, no giant decorative numbers. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-primary-600 dark:text-primary-400 font-mono text-xl font-semibold">
                ${property.price.toLocaleString()}
              </span>
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                {property.status} · {property.propertyType}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <Fact label="Beds" value={property.beds} />
              <Fact label="Baths" value={property.baths} />
              <Fact label="Sq ft" value={property.sqft.toLocaleString()} />
              <Fact label="Year" value={property.yearBuilt ?? "—"} />
              {pricePerSqft !== null && <Fact label="$/sqft" value={`$${pricePerSqft}`} />}
              {typeof property.distanceMiles === "number" && (
                <Fact label="Distance" value={`${property.distanceMiles.toFixed(1)} mi`} />
              )}
            </div>

            {property.description ? (
              <div className="min-h-0">
                <h3 className="mb-1 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                  Details
                </h3>
                <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {property.description}
                </p>
              </div>
            ) : null}

            {property.sourceUrl ? (
              <a
                href={property.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 inline-block text-xs font-medium hover:underline"
              >
                View source listing ↗
              </a>
            ) : null}
          </div>

          {/* Analysis output (Gemini-backed, cited/qualified, honest no-data). */}
          {(analyzing || analysis) && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 md:col-span-2 dark:border-stone-800 dark:bg-stone-950/40">
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-stone-500 uppercase">
                <Star className="h-3.5 w-3.5" /> AI analysis
              </h3>
              {analyzing ? (
                <p className="flex items-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing listing data…
                </p>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-line text-stone-700 dark:text-stone-300">
                  {analysis}
                </p>
              )}
              <p className="mt-2 text-[10px] text-stone-400">
                AI-generated from listing fields only. Verify independently; not provider-verified
                fact or investment advice.
              </p>
            </div>
          )}

          {/* Workspace actions (Sheets / Calendar / delete) folded into the compact pattern. */}
          {showWorkspace && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-3 md:col-span-2 dark:border-stone-800 dark:bg-stone-950/40">
              {hasWorkspaceAccess && onExportToSheet && (
                <button
                  type="button"
                  onClick={() => onExportToSheet(property)}
                  disabled={isExporting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
                >
                  {isExporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sheet className="h-4 w-4" />
                  )}
                  Export to Google Sheets
                </button>
              )}

              {hasWorkspaceAccess && onScheduleViewing && onCalendarEventTimeChange && (
                <div className="space-y-2">
                  <label
                    htmlFor={`viewing-time-${property.id}`}
                    className="block text-xs font-semibold tracking-wider text-stone-500 uppercase"
                  >
                    Viewing date &amp; time
                  </label>
                  <input
                    id={`viewing-time-${property.id}`}
                    type="datetime-local"
                    value={calendarEventTime}
                    onChange={(e) => onCalendarEventTimeChange(e.target.value)}
                    className="focus:border-primary-500 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => onScheduleViewing(property)}
                    disabled={isScheduling || !calendarEventTime}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-900 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
                  >
                    {isScheduling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                    Schedule calendar viewing
                  </button>
                </div>
              )}

              {onDeleteProperty && (
                <button
                  type="button"
                  onClick={() => {
                    onDeleteProperty(property.id);
                    onClose();
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete listing
                </button>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 dark:border-stone-800 dark:bg-stone-950">
      <span className="block text-[10px] tracking-wider text-stone-400 uppercase">{label}</span>
      <span className="block text-sm font-semibold text-stone-900 dark:text-stone-100">
        {value}
      </span>
    </div>
  );
}

function ActionChip({
  active,
  label,
  icon,
  onClick,
  iconOnly = false,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  /** Render the icon alone (label becomes the tooltip + accessible name). */
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={iconOnly ? label : undefined}
      aria-label={iconOnly ? label : undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border text-xs font-semibold transition ${
        iconOnly ? "p-2" : "px-2.5 py-1.5"
      } ${
        active
          ? "border-primary-500 bg-primary-500 text-white"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-200 dark:hover:bg-stone-900"
      }`}
    >
      {icon}
      {!iconOnly && label}
    </button>
  );
}
