-- Create F1 Cars table
CREATE TABLE IF NOT EXISTS f1_cars (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  team TEXT NOT NULL,
  chassis TEXT NOT NULL,
  drivers TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Diecast Models table
CREATE TABLE IF NOT EXISTS diecast_models (
  id TEXT PRIMARY KEY,
  car_id TEXT NOT NULL REFERENCES f1_cars(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  scale TEXT NOT NULL,
  driver TEXT NOT NULL,
  event_name TEXT NOT NULL,
  sku TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create eBay Links table
CREATE TABLE IF NOT EXISTS ebay_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL REFERENCES diecast_models(id) ON DELETE CASCADE,
  ebay_url TEXT NOT NULL,
  ebay_price TEXT,
  ebay_title TEXT,
  ebay_image TEXT,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id) -- One eBay link per model
);

-- Create Model Inventory (staging area for unassigned models)
CREATE TABLE IF NOT EXISTS model_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  manufacturer TEXT,
  scale TEXT,
  driver TEXT,
  event_name TEXT,
  sku TEXT,
  year INTEGER,
  team TEXT,
  chassis TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
  source TEXT, -- 'ebay', 'spark', 'minichamps', etc.
  source_url TEXT,
  price TEXT,
  image_url TEXT,
  metadata JSONB, -- Store additional scraped data
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_f1_cars_year ON f1_cars(year);
CREATE INDEX IF NOT EXISTS idx_diecast_models_car_id ON diecast_models(car_id);
CREATE INDEX IF NOT EXISTS idx_diecast_models_sku ON diecast_models(sku);
CREATE INDEX IF NOT EXISTS idx_ebay_links_model_id ON ebay_links(model_id);
CREATE INDEX IF NOT EXISTS idx_model_inventory_status ON model_inventory(status);
CREATE INDEX IF NOT EXISTS idx_model_inventory_sku ON model_inventory(sku);

-- Enable Row Level Security (RLS)
ALTER TABLE f1_cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE diecast_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_inventory ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now, can restrict later)
CREATE POLICY "Allow all operations on f1_cars" ON f1_cars FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on diecast_models" ON diecast_models FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on ebay_links" ON ebay_links FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on model_inventory" ON model_inventory FOR ALL USING (true) WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to auto-update updated_at
CREATE TRIGGER update_f1_cars_updated_at BEFORE UPDATE ON f1_cars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_diecast_models_updated_at BEFORE UPDATE ON diecast_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ebay_links_updated_at BEFORE UPDATE ON ebay_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_inventory_updated_at BEFORE UPDATE ON model_inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
