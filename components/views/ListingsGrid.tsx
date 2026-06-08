import React, { useState } from "react";
import { ListingProperty } from "../../types/listings";
import { MapPin, BedDouble, Bath, Maximize2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export function ListingsGrid({ properties }: { properties: ListingProperty[] }) {
  const [selectedProperty, setSelectedProperty] = useState<ListingProperty | null>(null);

  if (properties.length === 0) {
    return (
      <div className="text-center py-32 bg-stone-50 dark:bg-stone-900/40 rounded-3xl border border-stone-200 dark:border-stone-800 border-dashed">
        <h3 className="text-lg font-bold">No properties found</h3>
        <p className="text-stone-500 mt-2">Adjust your filters or harvest new leads.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {properties.map((prop) => (
          <PropertyCard key={prop.id} property={prop} onClick={() => setSelectedProperty(prop)} />
        ))}
      </div>

      <AnimatePresence>
        {selectedProperty && (
          <PropertyProfileModal property={selectedProperty} onClose={() => setSelectedProperty(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function PropertyCard({ property, onClick }: { property: ListingProperty, onClick: () => void }) {
  const images = property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.imageUrl];
  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev + 1) % images.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div 
      onClick={onClick}
      className="group bg-white dark:bg-stone-900 rounded-2xl overflow-hidden border border-stone-200 dark:border-stone-800 hover:border-primary-400 dark:hover:border-primary-600 transition-all cursor-pointer shadow-sm hover:shadow-xl"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100 dark:bg-stone-950">
        <img 
          src={images[currentImageIdx]} 
          alt={property.title}
          className="w-full h-full object-cover transition duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
        />
        
        {/* Navigation Arrows for Carousel */}
        {images.length > 1 && (
          <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={handlePrev} className="bg-stone-900/60 hover:bg-stone-900/90 text-white p-1.5 rounded-full backdrop-blur-sm transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleNext} className="bg-stone-900/60 hover:bg-stone-900/90 text-white p-1.5 rounded-full backdrop-blur-sm transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Carousel Indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${i === currentImageIdx ? "w-4 bg-white" : "w-1.5 bg-white/50"}`} />
            ))}
          </div>
        )}
        
        <div className="absolute top-3 left-3 flex gap-2">
          <span className="bg-white/90 dark:bg-stone-900/90 backdrop-blur-md px-3 py-1 rounded-full text-xs font-semibold text-stone-900 dark:text-white shadow-sm">
            {property.status}
          </span>
        </div>
      </div>

      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-lg text-stone-900 dark:text-white line-clamp-1">{property.title}</h3>
            <p className="text-stone-500 text-sm flex items-center mt-1">
              <MapPin className="w-3.5 h-3.5 mr-1" />
              {property.address}, {property.city}
            </p>
          </div>
          <span className="font-mono font-bold text-lg text-primary-500">
            ${property.price.toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 py-4 border-t border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <div className="bg-stone-50 dark:bg-stone-800 p-1.5 rounded-md">
              <BedDouble className="w-4 h-4 text-stone-500" />
            </div>
            <div>
              <span className="block font-semibold text-sm">{property.beds}</span>
              <span className="block text-[10px] text-stone-400 uppercase tracking-wider">Beds</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-stone-50 dark:bg-stone-800 p-1.5 rounded-md">
              <Bath className="w-4 h-4 text-stone-500" />
            </div>
            <div>
              <span className="block font-semibold text-sm">{property.baths}</span>
              <span className="block text-[10px] text-stone-400 uppercase tracking-wider">Baths</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-stone-50 dark:bg-stone-800 p-1.5 rounded-md">
              <Maximize2 className="w-4 h-4 text-stone-500" />
            </div>
            <div>
              <span className="block font-semibold text-sm">{property.sqft}</span>
              <span className="block text-[10px] text-stone-400 uppercase tracking-wider">SqFt</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PropertyProfileModal({ property, onClose }: { property: ListingProperty, onClose: () => void }) {
  const images = property.imageUrls && property.imageUrls.length > 0 ? property.imageUrls : [property.imageUrl];
  const [currentImageIdx, setCurrentImageIdx] = useState(0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/80 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        className="relative bg-white dark:bg-stone-900 w-full max-w-5xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row z-10"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-20 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full transition backdrop-blur-md">
          <X className="w-5 h-5" />
        </button>

        {/* Larger Carousel */}
        <div className="w-full md:w-3/5 bg-stone-950 relative h-64 md:h-auto">
          <img 
            src={images[currentImageIdx]} 
            alt="Feature"
            className="w-full h-full object-cover"
          />
          {images.length > 1 && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-4">
              <button onClick={() => setCurrentImageIdx(prev => (prev - 1 + images.length) % images.length)} className="bg-black/40 hover:bg-black/60 text-white p-3 rounded-full backdrop-blur-md transition">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button onClick={() => setCurrentImageIdx(prev => (prev + 1) % images.length)} className="bg-black/40 hover:bg-black/60 text-white p-3 rounded-full backdrop-blur-md transition">
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="w-full md:w-2/5 p-8 overflow-y-auto bg-stone-50 dark:bg-stone-900">
          <div className="mb-6">
            <div className="inline-block bg-primary-500/10 text-primary-500 px-3 py-1 rounded-full text-xs font-bold mb-4 uppercase tracking-wider">
              {property.status} • {property.propertyType}
            </div>
            <h2 className="text-3xl font-extrabold mb-2">{property.title}</h2>
            <p className="text-stone-500 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {property.address}, {property.city}, {property.state} {property.zipCode}
            </p>
          </div>

          <div className="text-4xl font-mono font-bold text-primary-500 mb-8 pb-8 border-b border-stone-200 dark:border-stone-800">
            ${property.price.toLocaleString()}
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="bg-white dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <span className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Bedrooms</span>
              <span className="text-2xl font-semibold">{property.beds}</span>
            </div>
            <div className="bg-white dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <span className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Bathrooms</span>
              <span className="text-2xl font-semibold">{property.baths}</span>
            </div>
            <div className="bg-white dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <span className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Square Feet</span>
              <span className="text-2xl font-semibold">{property.sqft}</span>
            </div>
            <div className="bg-white dark:bg-stone-950 p-4 rounded-xl border border-stone-200 dark:border-stone-800 shadow-sm">
              <span className="block text-xs uppercase tracking-wider text-stone-500 mb-1">Year Built</span>
              <span className="text-2xl font-semibold">{property.yearBuilt || 'N/A'}</span>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-lg mb-3">Property Output Details</h3>
            <p className="text-stone-600 dark:text-stone-400 leading-relaxed text-sm">
              {property.description || "No full description provided. Harvested via email agent."}
            </p>
          </div>

        </div>
      </motion.div>
    </div>
  );
}
