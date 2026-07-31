-- One retailer link per (model, retailer)
--
-- price_history is a CURRENT-STATE table despite the name: refresh-prices
-- updates rows in place rather than appending. Nothing enforced that, so
-- re-pasting a URL created a second row for the same shop — which would make
-- the "cheapest price" comparison count that retailer twice.
--
-- Run the dedupe below first if this constraint fails to apply.

-- Safety net: collapse any remaining duplicates, keeping the most recent.
DELETE FROM price_history a
USING price_history b
WHERE a.model_id = b.model_id
  AND a.retailer_id = b.retailer_id
  AND a.recorded_at < b.recorded_at;

-- Guarded so re-running this file is harmless. ADD CONSTRAINT has no
-- IF NOT EXISTS form, and a bare failure aborts the whole script.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'price_history_unique_model_retailer'
  ) THEN
    ALTER TABLE price_history
      ADD CONSTRAINT price_history_unique_model_retailer
      UNIQUE (model_id, retailer_id);
  END IF;
END $$;
