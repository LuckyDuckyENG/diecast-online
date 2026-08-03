export interface FilterOptions {
  years: string[];
  teams: string[];
  drivers: string[];
  scales: string[];
  manufacturers: string[];
}

export interface Model {
  id: string;
  /** Readable URL segment; falls back to id when absent. */
  slug?: string | null;
  name: string;
  manufacturer: string;
  year: number;
  driver?: string;
  team?: string;
  price?: string;
  imageUrl?: string;
  releaseDate?: string;
  scale?: string;
  liveryName?: string;
  teamPrimaryColor?: string;
  teamTextColor?: string;
  eventName?: string;
  /** True when at least one variant is sold somewhere (retailer or eBay). */
  hasStore?: boolean;
}

export type SortOption = 'newest' | 'price-low' | 'price-high' | 'popular';
