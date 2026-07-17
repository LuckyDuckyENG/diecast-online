-- Drop table if it exists with wrong schema
DROP TABLE IF EXISTS listing_inventory CASCADE;

-- Create universal inventory table for uncertain matches that need review
-- Works for eBay, retailers, and any future sources
CREATE TABLE listing_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Listing details
  title TEXT NOT NULL,
  price TEXT,
  url TEXT NOT NULL,
  image_url TEXT,

  -- Source information
  source_type TEXT NOT NULL, -- 'ebay', 'retailer', 'amazon', etc.
  source_name TEXT, -- e.g., "eBay", "Stone Model", "Anthony's Diecasts"
  retailer_id UUID, -- Foreign key added separately below

  -- AI scoring
  ai_score INTEGER NOT NULL, -- 0-100
  ai_reason TEXT, -- Why this score was given

  -- Context: what model was being searched when this was found
  searched_model_id TEXT, -- Foreign key added separately below
  search_query TEXT, -- The original search query

  -- Metadata
  status TEXT DEFAULT 'pending', -- pending, linked, rejected
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key constraints separately (more explicit)
ALTER TABLE listing_inventory
  ADD CONSTRAINT listing_inventory_retailer_fkey
  FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE SET NULL;

ALTER TABLE listing_inventory
  ADD CONSTRAINT listing_inventory_searched_model_fkey
  FOREIGN KEY (searched_model_id) REFERENCES diecast_models(id) ON DELETE SET NULL;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_listing_inventory_status ON listing_inventory(status);
CREATE INDEX IF NOT EXISTS idx_listing_inventory_searched_model ON listing_inventory(searched_model_id);
CREATE INDEX IF NOT EXISTS idx_listing_inventory_score ON listing_inventory(ai_score);
CREATE INDEX IF NOT EXISTS idx_listing_inventory_source ON listing_inventory(source_type);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_listing_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER listing_inventory_updated_at
  BEFORE UPDATE ON listing_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_inventory_updated_at();

-- Grant permissions
GRANT ALL ON listing_inventory TO authenticated;
GRANT ALL ON listing_inventory TO service_role;
