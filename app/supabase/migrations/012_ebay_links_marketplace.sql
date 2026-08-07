-- eBay listings need more than a URL and a price string.
--
-- eBay is a secondary market, not a retailer: a discontinued 2023 model can
-- trade above its original retail. Presenting a listing identically to a shop
-- price would misrepresent it, so we record where it came from and in what
-- currency, and convert to AUD the same way retailer prices are.
--
-- eBay AU carries a fraction of the inventory eBay US does for niche F1
-- diecast (9 results vs 216 on a real query), so a search falls back to US.
-- "Available locally for AUD $189" and "available from the US plus shipping"
-- are different propositions and the page has to be able to say which.
--
-- ebay_item_id lets a future job ask eBay whether a listing still exists.
-- Retail links go stale; eBay links go dead when the item sells.
--
-- The table is currently empty, so this is additive with nothing to backfill.

-- auto_linked marks links added without a human looking at them. Deleting a
-- wrong link is one click; the expensive part is FINDING it among a hundred
-- correct ones. This turns review into a filtered list rather than a hunt,
-- which is what makes auto-adding acceptable at all.
ALTER TABLE ebay_links
  ADD COLUMN IF NOT EXISTS marketplace     TEXT,
  ADD COLUMN IF NOT EXISTS currency        TEXT,
  ADD COLUMN IF NOT EXISTS price_aud       NUMERIC,
  ADD COLUMN IF NOT EXISTS ebay_item_id    TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_linked     BOOLEAN DEFAULT false;

-- One eBay link per model, matching how price_history works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ebay_links_unique_model'
  ) THEN
    ALTER TABLE ebay_links
      ADD CONSTRAINT ebay_links_unique_model UNIQUE (model_id);
  END IF;
END $$;

-- Confirm
SELECT
  count(*)                                                          AS rows,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'ebay_links' AND column_name = 'marketplace') AS has_marketplace,
  (SELECT count(*) FROM pg_constraint
    WHERE conname = 'ebay_links_unique_model')                       AS has_unique
FROM ebay_links;
