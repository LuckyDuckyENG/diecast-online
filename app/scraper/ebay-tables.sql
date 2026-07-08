-- ========================================
-- eBay Integration Database Schema
-- ========================================
-- Run this SQL in your Supabase SQL Editor
-- (Supabase Dashboard > SQL Editor > New Query)

-- Table for active eBay listings
CREATE TABLE IF NOT EXISTS ebay_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  ebay_item_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('auction', 'buy_it_now')),
  current_price NUMERIC,
  condition TEXT,
  image_url TEXT,
  listing_url TEXT NOT NULL,
  seller_username TEXT,
  ends_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for sold listings (pricing history)
CREATE TABLE IF NOT EXISTS ebay_sold_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  ebay_item_id TEXT NOT NULL,
  sold_price NUMERIC NOT NULL,
  condition TEXT,
  sold_at TIMESTAMPTZ NOT NULL,
  listing_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for ebay_listings
CREATE INDEX IF NOT EXISTS idx_ebay_listings_model_id ON ebay_listings(model_id);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_active ON ebay_listings(is_active);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_ebay_item_id ON ebay_listings(ebay_item_id);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_created_at ON ebay_listings(created_at DESC);

-- Indexes for ebay_sold_history
CREATE INDEX IF NOT EXISTS idx_ebay_sold_model_id ON ebay_sold_history(model_id);
CREATE INDEX IF NOT EXISTS idx_ebay_sold_date ON ebay_sold_history(sold_at DESC);

-- Comments for documentation
COMMENT ON TABLE ebay_listings IS 'Active eBay listings for diecast models';
COMMENT ON TABLE ebay_sold_history IS 'Historical sold prices from eBay for pricing analytics';

COMMENT ON COLUMN ebay_listings.listing_type IS 'Either auction or buy_it_now';
COMMENT ON COLUMN ebay_listings.condition IS 'Item condition (new, used_like_new, used_good, damaged_box, etc.)';
COMMENT ON COLUMN ebay_listings.raw_data IS 'Full eBay API response stored as JSONB for future reference';
COMMENT ON COLUMN ebay_listings.is_active IS 'False when listing ends or is removed';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'eBay tables created successfully!';
END $$;
