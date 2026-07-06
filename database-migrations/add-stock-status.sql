-- Add stock availability tracking to price_history
ALTER TABLE price_history ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true;

-- Update existing prices to default true (assume in stock if we have a price)
UPDATE price_history SET in_stock = true WHERE in_stock IS NULL;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_price_history_in_stock ON price_history(in_stock);

-- Verify
SELECT
  m.manufacturer_sku,
  r.name as retailer,
  ph.price,
  ph.currency,
  ph.in_stock,
  ph.recorded_at
FROM price_history ph
JOIN models m ON ph.model_id = m.id
JOIN retailers r ON ph.retailer_id = r.id
ORDER BY ph.recorded_at DESC
LIMIT 10;
