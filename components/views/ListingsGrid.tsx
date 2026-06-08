import React, { useState } from "react";
import { ListingProperty } from "../../types/listings";
import {
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  X,
  Sheet,
  Calendar,
  Trash2,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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
}: ListingsGridProps) {
  const [selectedProperty, setSelectedProperty] = useState<ListingProperty | null>(null);

  if (properties.length === 0) {
    const inventoryEmpty = totalPropertyCount === 0;

    return (
      <div className="rounded-3xl border border-dashed border-stone-200 bg-stone-50 px-6 py-32 text-center dark:border-stone-800 dark:bg-stone-900/40">
        <h3 className="text-lg font-bold text-stone-900 dark:text-stone-100">
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

  return (
    <>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {properties.map((prop) => (
          <PropertyCard key={prop.id} property={prop} onClick={() => setSelectedProperty(prop)} />
        ))}
      </div>

      <AnimatePresence>
        {selectedProperty && (
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
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PropertyCard({ property, onClick }: { property: ListingProperty; onClick: () => void }) {
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
    <article className="group hover:border-primary-400 dark:hover:border-primary-600 w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm transition-all hover:shadow-xl dark:border-stone-800 dark:bg-stone-900">
      <div tabIndex={0} onClick={onClick} onKeyDown={handleCardKeyDown} className="cursor-pointer">
        <div className="relative aspect-4/3 overflow-hidden bg-stone-100 dark:bg-stone-950">
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
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-full bg-stone-900/60 p-1.5 text-white backdrop-blur-sm transition hover:bg-stone-900/90"
                aria-label="Next image"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

          {images.length > 1 && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === currentImageIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`}
                />
              ))}
            </div>
          )}

          <div className="absolute top-3 left-3 flex gap-2">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-stone-900 shadow-sm backdrop-blur-md dark:bg-stone-900/90 dark:text-white">
              {property.status}
            </span>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h3 className="line-clamp-1 text-lg font-bold text-stone-900 dark:text-white">
                {property.title}
              </h3>
              <p className="mt-1 flex items-center text-sm text-stone-500">
                <MapPin className="mr-1 h-3.5 w-3.5" />
                {property.address}, {property.city}
              </p>
            </div>
            <span className="text-primary-500 font-mono text-lg font-bold">
              ${property.price.toLocaleString()}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-stone-100 py-4 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-stone-50 p-1.5 dark:bg-stone-800">
                <BedDouble className="h-4 w-4 text-stone-500" />
              </div>
              <div>
                <span className="block text-sm font-semibold">{property.beds}</span>
                <span className="block text-[10px] tracking-wider text-stone-400 uppercase">
                  Beds
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-stone-50 p-1.5 dark:bg-stone-800">
                <Bath className="h-4 w-4 text-stone-500" />
              </div>
              <div>
                <span className="block text-sm font-semibold">{property.baths}</span>
                <span className="block text-[10px] tracking-wider text-stone-400 uppercase">
                  Baths
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-stone-50 p-1.5 dark:bg-stone-800">
                <Maximize2 className="h-4 w-4 text-stone-500" />
              </div>
              <div>
                <span className="block text-sm font-semibold">{property.sqft}</span>
                <span className="block text-[10px] tracking-wider text-stone-400 uppercase">
                  SqFt
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function NoListingMedia() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-stone-100 to-stone-200 p-6 text-center dark:from-stone-900 dark:to-stone-950">
      <div>
        <MapPin className="mx-auto mb-3 h-8 w-8 text-stone-400" />
        <p className="text-xs font-semibold tracking-wider text-stone-500 uppercase">
          No listing media
        </p>
      </div>
    </div>
  );
}

interface PropertyProfileModalProps {
  property: ListingProperty;
  onClose: () => void;
  onExportToSheet?: (property: ListingProperty) => void;
  onScheduleViewing?: (property: ListingProperty) => void;
  onDeleteProperty?: (propertyId: string) => void;
  sheetsExportingPropId?: string | null;
  calendarSchedulingPropId?: string | null;
  calendarEventTime?: string;
  onCalendarEventTimeChange?: (value: string) => void;
  hasWorkspaceAccess?: boolean;
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
}: PropertyProfileModalProps) {
  const images = (
    property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.imageUrl]
  ).filter(Boolean);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const isExporting = sheetsExportingPropId === property.id;
  const isScheduling = calendarSchedulingPropId === property.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        className="relative z-10 flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl md:flex-row dark:bg-stone-900"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 rounded-full bg-black/40 p-2 text-white backdrop-blur-md transition hover:bg-black/60"
          aria-label="Close property details"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative h-64 w-full bg-stone-950 md:h-auto md:w-3/5">
          {images.length > 0 ? (
            <img
              src={images[currentImageIdx]}
              alt={`${property.title} — photo ${currentImageIdx + 1} of ${images.length}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <NoListingMedia />
          )}
          {images.length > 1 && (
            <div className="absolute inset-y-0 right-0 left-0 flex items-center justify-between px-4">
              <button
                type="button"
                onClick={() =>
                  setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length)
                }
                className="rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition hover:bg-black/60"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentImageIdx((prev) => (prev + 1) % images.length)}
                className="rounded-full bg-black/40 p-3 text-white backdrop-blur-md transition hover:bg-black/60"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          )}
        </div>

        <div className="w-full overflow-y-auto bg-stone-50 p-8 md:w-2/5 dark:bg-stone-900">
          <div className="mb-6">
            <div className="bg-primary-500/10 text-primary-500 mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wider uppercase">
              {property.status} • {property.propertyType}
            </div>
            <h2 className="mb-2 text-3xl font-extrabold">{property.title}</h2>
            <p className="flex items-center gap-2 text-stone-500">
              <MapPin className="h-4 w-4" />
              {property.address}, {property.city}, {property.state} {property.zipCode}
            </p>
          </div>

          <div className="text-primary-500 mb-8 border-b border-stone-200 pb-8 font-mono text-4xl font-bold dark:border-stone-800">
            ${property.price.toLocaleString()}
          </div>

          <div className="mb-8 grid grid-cols-2 gap-6">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
              <span className="mb-1 block text-xs tracking-wider text-stone-500 uppercase">
                Bedrooms
              </span>
              <span className="text-2xl font-semibold">{property.beds}</span>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
              <span className="mb-1 block text-xs tracking-wider text-stone-500 uppercase">
                Bathrooms
              </span>
              <span className="text-2xl font-semibold">{property.baths}</span>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
              <span className="mb-1 block text-xs tracking-wider text-stone-500 uppercase">
                Square Feet
              </span>
              <span className="text-2xl font-semibold">{property.sqft}</span>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-950">
              <span className="mb-1 block text-xs tracking-wider text-stone-500 uppercase">
                Year Built
              </span>
              <span className="text-2xl font-semibold">{property.yearBuilt || "N/A"}</span>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="mb-3 text-lg font-bold">Property Output Details</h3>
            <p className="text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              {property.description || "No full description provided. Harvested via email agent."}
            </p>
          </div>

          {(onExportToSheet || onScheduleViewing || onDeleteProperty) && (
            <div className="space-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
              <h3 className="text-sm font-bold tracking-wider text-stone-500 uppercase">
                Workspace Actions
              </h3>

              {hasWorkspaceAccess && onExportToSheet && (
                <button
                  type="button"
                  onClick={() => onExportToSheet(property)}
                  disabled={isExporting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
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
                    Viewing Date &amp; Time
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
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-900 transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:hover:bg-stone-900"
                  >
                    {isScheduling ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                    Schedule Calendar Viewing
                  </button>
                </div>
              )}

              {onDeleteProperty && (
                <button
                  type="button"
                  onClick={() => onDeleteProperty(property.id)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Listing
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
