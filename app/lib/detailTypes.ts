export interface ModelDetail {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  driver: string;
  team: string;
  grandPrix: string;
  scale: string;
  material: string;
  articleNumber: string;
  productionNumber: string;
  releaseDate: string;
  specialLivery: boolean;
  priceRange: {
    low: number;
    high: number;
    currency: string;
  };
  images: {
    main: string;
    thumbnails: string[];
  };
  priceHistory: {
    month: string;
    price: number;
  }[];
  retailers: {
    name: string;
    price: number;
    currency: string;
    availability: 'In Stock' | 'Pre-order' | 'Out of Stock';
    url: string;
  }[];
  rating: {
    average: number;
    count: number;
  };
  reviews: {
    id: string;
    username: string;
    rating: number;
    date: string;
    comment: string;
    verified: boolean;
  }[];
  relatedModels: {
    id: string;
    name: string;
    manufacturer: string;
    scale: string;
    price: string;
    imageUrl?: string;
  }[];
}
