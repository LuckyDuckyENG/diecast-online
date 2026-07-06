export interface Season {
  id: string;
  year: number;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  season_id: string;
  created_at: string;
}

export interface Driver {
  id: string;
  name: string;
  number: number;
  created_at: string;
}

export interface Car {
  id: string;
  team_id: string;
  season_id: string;
  livery_name: string;
  created_at: string;
}

export interface CarDriver {
  id: string;
  car_id: string;
  driver_id: string;
  created_at: string;
}

export interface Manufacturer {
  id: string;
  name: string;
  created_at: string;
}

export interface Retailer {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

export interface DBModel {
  id: string;
  manufacturer_id: string;
  car_id: string;
  scale: string;
  price: number;
  release_date: string;
  image_url: string;
  description: string;
  stock_status: string;
  created_at: string;
}

export interface PriceHistory {
  id: string;
  model_id: string;
  retailer_id: string;
  price: number;
  recorded_at: string;
}

export interface Review {
  id: string;
  model_id: string;
  rating: number;
  comment: string;
  author: string;
  created_at: string;
}

// Joined types for queries
export interface ModelWithDetails extends DBModel {
  manufacturer: Manufacturer;
  car: Car & {
    team: Team;
    season: Season;
    drivers: Driver[];
  };
}
