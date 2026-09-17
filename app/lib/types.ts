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
  /**
   * Human label for the card: the makers this car comes from, joined.
   *
   * Was `${variants.length} manufacturers`, which is a COUNT of models wearing
   * the word manufacturer — so a card read "2 manufacturers • 2024", and a car
   * with one model read "1 manufacturers".
   */
  manufacturer: string;
  /**
   * Every distinct maker and scale this car is available in.
   *
   * Plural because a car is not one of either: 56% of visible cars have models
   * at more than one scale and 35% come from more than one maker. Filtering
   * used to test a single value — `variants[0].scale` — so ticking 1:18 missed
   * 214 cars that have a 1:18 model, and the manufacturer filter tested the
   * count string above and therefore never filtered by manufacturer at all.
   */
  scales: string[];
  manufacturers: string[];
  /**
   * What the "Popular" sort runs on.
   *
   * Optional because only /browse can compute them — /search reads neither
   * eBay listings nor shop prices, and has no sort to feed. Absent is the
   * truth there, rather than a zero that would read as "nothing sold".
   */
  unitsSold?: number;
  listingCount?: number;
  shopCount?: number;
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
