-- COMPLETE CLEAN INSTALL
-- Run this to completely remove any previous attempts and start fresh

-- Drop everything related to listing_inventory
DROP TABLE IF EXISTS listing_inventory CASCADE;
DROP FUNCTION IF EXISTS update_listing_inventory_updated_at() CASCADE;

-- Now create from scratch
CREATE TABLE listing_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Listing details
  title TEXT NOT NULL,
  price TEXT,
  url TEXT NOT NULL,
  image_url TEXT,

  -- Source information
  source_type TEXT NOT NULL,
  source_name TEXT,
  retailer_id UUID,

  -- AI scoring
  ai_score INTEGER NOT NULL,
  ai_reason TEXT,

  -- Context
  searched_model_id TEXT,
  search_query TEXT,

  -- Metadata
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign keys
ALTER TABLE listing_inventory
  ADD CONSTRAINT listing_inventory_retailer_fkey
  FOREIGN KEY (retailer_id) REFERENCES retailers(id) ON DELETE SET NULL;

ALTER TABLE listing_inventory
  ADD CONSTRAINT listing_inventory_searched_model_fkey
  FOREIGN KEY (searched_model_id) REFERENCES diecast_models(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_listing_inventory_status ON listing_inventory(status);
CREATE INDEX idx_listing_inventory_searched_model ON listing_inventory(searched_model_id);
CREATE INDEX idx_listing_inventory_score ON listing_inventory(ai_score);
CREATE INDEX idx_listing_inventory_source ON listing_inventory(source_type);

-- Trigger function
CREATE OR REPLACE FUNCTION update_listing_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
CREATE TRIGGER listing_inventory_updated_at
  BEFORE UPDATE ON listing_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_listing_inventory_updated_at();

-- Permissions
GRANT ALL ON listing_inventory TO authenticated;
GRANT ALL ON listing_inventory TO service_role;
