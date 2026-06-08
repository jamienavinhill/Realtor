export interface ListingProperty {
  id: string;
  title: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  propertyType: "Single Family" | "Condo" | "Townhouse" | "Multi-Family" | "Land" | string;
  status: "Active" | "Pending" | "Sold" | "Seed";
  imageUrl: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  yearBuilt?: number;
  description?: string;
  source: string; // 'realty_api', 'seeded', 'manual', etc.
  createdAt: string;
  updatedAt: string;
}

export interface PropertyAlert {
  id: string;
  userId: string;
  name: string;
  criteria: {
    minPrice?: number;
    maxPrice?: number;
    city?: string;
    beds?: number;
    baths?: number;
    propertyType?: string;
  };
  isActive: boolean;
  createdAt: string;
}
