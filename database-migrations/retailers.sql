-- ============================================
-- RETAILERS
-- ============================================
-- Australian F1 Diecast Model Retailers
-- Safe to re-run - won't create duplicates
-- ============================================

-- First, ensure unique constraint exists on retailer names
ALTER TABLE retailers ADD CONSTRAINT IF NOT EXISTS retailers_name_unique UNIQUE (name);

-- Add Australian retailers
INSERT INTO retailers (name, url) VALUES
  ('Anthony''s Diecasts', 'https://anthonysdiecasts.com.au'),
  ('Downies Collectables', 'https://www.downies.com'),
  ('Metro Hobbies', 'https://www.metrohobbies.com.au'),
  ('Frontline Hobbies', 'https://www.frontlinehobbies.com.au'),
  ('Hobbyco', 'https://www.hobbyco.com.au')
ON CONFLICT (name) DO NOTHING;

-- Verify retailers were added
SELECT * FROM retailers ORDER BY name;
