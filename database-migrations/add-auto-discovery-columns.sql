-- Add columns to support auto-discovery of models

-- Make car_id nullable (discovered models won't have a car yet)
ALTER TABLE models ALTER COLUMN car_id DROP NOT NULL;

-- Add discovery tracking columns
ALTER TABLE models ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false;
ALTER TABLE models ADD COLUMN IF NOT EXISTS discovered_from TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS discovered_at TIMESTAMPTZ DEFAULT NOW();

-- Add index for filtering models that need review
CREATE INDEX IF NOT EXISTS idx_models_needs_review ON models(needs_review) WHERE needs_review = true;

-- Verify
SELECT
  manufacturer_sku,
  description,
  scale,
  car_id,
  needs_review,
  discovered_from
FROM models
ORDER BY discovered_at DESC
LIMIT 10;
