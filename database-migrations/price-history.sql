-- ============================================
-- PRICE HISTORY
-- ============================================
-- Links models to retailers with current prices
-- Dependencies: models, retailers must exist
-- Safe to re-run - clears old data and regenerates
-- ============================================

-- Clear existing price history (so we can regenerate with fresh data)
TRUNCATE TABLE price_history;

-- Link each model to 3-5 random retailers with varying prices
DO $$
DECLARE
  model_record RECORD;
  retailer_ids UUID[];
  retailer_id UUID;
  base_price DECIMAL;
  retailer_price DECIMAL;
  num_retailers INT;
BEGIN
  -- For each model in the database
  FOR model_record IN SELECT id, price FROM models LOOP
    base_price := model_record.price;

    -- Randomly select 3-5 retailers for this model
    num_retailers := 3 + floor(random() * 3)::int;

    SELECT ARRAY_AGG(id) INTO retailer_ids
    FROM (SELECT id FROM retailers ORDER BY random() LIMIT num_retailers) AS random_retailers;

    -- Link model to each selected retailer with realistic price variation
    FOREACH retailer_id IN ARRAY retailer_ids LOOP
      -- Price variance: -5% to +10% from base price
      retailer_price := base_price * (0.95 + random() * 0.15);

      INSERT INTO price_history (model_id, retailer_id, price, recorded_at)
      VALUES (model_record.id, retailer_id, ROUND(retailer_price, 2), NOW());
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Price history generated successfully!';
END $$;

-- Verify price history was created
SELECT
  m.description AS model,
  r.name AS retailer,
  ph.price,
  ph.recorded_at
FROM price_history ph
JOIN models m ON ph.model_id = m.id
JOIN retailers r ON ph.retailer_id = r.id
ORDER BY m.description, r.name
LIMIT 20;
