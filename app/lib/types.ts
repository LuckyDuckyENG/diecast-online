export interface FilterOptions {
  years: string[];
  teams: string[];
  drivers: string[];
  scales: string[];
  manufacturers: string[];
  specialLivery: boolean | null;
}

export interface Model {
  id: string;
  name: string;
  manufacturer: string;
  year: number;
  driver?: string;
  team?: string;
  price?: string;
  imageUrl?: string;
  releaseDate?: string;
  scale?: string;
  specialLivery?: boolean;
}

export type SortOption = 'newest' | 'price-low' | 'price-high' | 'popular';
