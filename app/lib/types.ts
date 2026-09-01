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
  /** Cheapest price anywhere for the cheapest scale, in AUD. Null when unpriced. */
  lowestPrice?: number | null;
  /** Which market that floor came from, so a card can say so. */
  lowestFrom?: 'shop' | 'ebay' | null;
  /** Scale AND maker the price describes — never mixed across either. */
  priceScale?: string | null;
  /** Cheapest and dearest for that scale. Null when there is nothing to compare. */
  priceRange?: { low: number; high: number; count: number } | null;
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
