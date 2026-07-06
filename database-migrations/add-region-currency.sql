-- Add region and currency columns to retailers table
ALTER TABLE retailers ADD COLUMN IF NOT EXISTS region TEXT DEFAULT 'AU';
ALTER TABLE retailers ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';

-- Add currency columns to price_history table
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'AUD';
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS price_aud NUMERIC;

-- Update existing retailers with correct currency
UPDATE retailers SET region = 'AU', currency = 'AUD' WHERE name IN ('Anthony''s Diecasts', 'Downies Collectables', 'Metro Hobbies', 'Hobbyco');
UPDATE retailers SET region = 'US', currency = 'USD' WHERE name IN ('Speedgear', 'Kai''s Kollectibles');
UPDATE retailers SET region = 'UK', currency = 'GBP' WHERE name = 'Car Model Store';
UPDATE retailers SET region = 'GLOBAL', currency = 'HKD' WHERE name = 'DrivenBy';

-- Update existing price_history with AUD defaults (all existing prices are AUD)
UPDATE price_history SET currency = 'AUD', price_aud = price WHERE currency IS NULL;

-- Add new international retailers (if they don't exist)
INSERT INTO retailers (name, url, region, currency) VALUES
  -- Australia
  ('Sherriffs Mini Cars', 'https://sherriffsminicars.com.au', 'AU', 'AUD'),
  ('Australian Diecast Show', 'https://australiandiecastshow.com.au', 'AU', 'AUD'),

  -- United States
  ('Speedgear', 'https://speedgear.com', 'US', 'USD'),
  ('Kai''s Kollectibles', 'https://kaiskollectibles.com', 'US', 'USD'),

  -- United Kingdom / International
  ('Car Model Store', 'https://www.carmodelstore.co.uk', 'UK', 'GBP'),
  ('DrivenBy', 'https://drivenby.co', 'GLOBAL', 'HKD')
ON CONFLICT (name) DO UPDATE SET
  url = EXCLUDED.url,
  region = EXCLUDED.region,
  currency = EXCLUDED.currency;

-- Verify
SELECT name, region, currency FROM retailers ORDER BY region, name;
