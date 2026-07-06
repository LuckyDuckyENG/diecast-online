-- ============================================
-- MANUFACTURERS TABLE
-- ============================================
-- Stores diecast model manufacturers (Spark, Minichamps, etc.)
-- Safe to re-run
-- ============================================

-- Create manufacturers table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS manufacturers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add optional columns if they don't exist
ALTER TABLE manufacturers
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Add manufacturer_id to models table
ALTER TABLE models
ADD COLUMN IF NOT EXISTS manufacturer_id UUID REFERENCES manufacturers(id);

-- Insert major F1 diecast manufacturers
INSERT INTO manufacturers (name) VALUES
  ('Spark'),
  ('Minichamps'),
  ('Looksmart'),
  ('Bburago'),
  ('Solido'),
  ('BBR'),
  ('Amalgam')
ON CONFLICT (name) DO NOTHING;

-- Update descriptions (optional, run after insert)
UPDATE manufacturers SET
  description = 'High-end resin models with exceptional detail',
  website_url = 'https://sparkmodel.com'
WHERE name = 'Spark';

UPDATE manufacturers SET
  description = 'Premium diecast and resin models',
  website_url = 'https://minichamps.de'
WHERE name = 'Minichamps';

UPDATE manufacturers SET
  description = 'Premium resin models specializing in modern F1',
  website_url = 'https://looksmartmodels.com'
WHERE name = 'Looksmart';

-- Verify manufacturers were created
SELECT id, name, description FROM manufacturers ORDER BY name;
