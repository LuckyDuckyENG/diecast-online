-- Create retailers table for Australian diecast stores
CREATE TABLE IF NOT EXISTS retailers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  shopify_domain TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create retailer_links table (similar to ebay_links)
CREATE TABLE IF NOT EXISTS retailer_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL REFERENCES diecast_models(id) ON DELETE CASCADE,
  retailer_id INTEGER NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  product_url TEXT NOT NULL,
  price DECIMAL(10,2),
  title TEXT,
  image_url TEXT,
  in_stock BOOLEAN DEFAULT true,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(model_id, retailer_id)
);

-- Insert known Australian retailers
INSERT INTO retailers (name, website_url, shopify_domain, active) VALUES
  ('Anthony''s Diecasts', 'https://anthonysdiecasts.com.au', 'anthonysdiecasts.myshopify.com', true),
  ('Downies Collectables', 'https://downies.com', 'downies.myshopify.com', true),
  ('Hobbyco', 'https://www.hobbyco.com.au', 'hobbyco.myshopify.com', true)
ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_retailer_links_model_id ON retailer_links(model_id);
CREATE INDEX IF NOT EXISTS idx_retailer_links_retailer_id ON retailer_links(retailer_id);
