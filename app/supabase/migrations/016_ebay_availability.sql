-- eBay's third state: still listed, nothing left to sell.
--
-- ebay_links records a price and a URL but never whether you can still buy the
-- thing. That was survivable while nothing re-checked a listing. It stops being
-- survivable the moment a refresh job exists, because the refresh has to do
-- something with a listing that is up but sold out.
--
-- Measured 2026-08-17 across 51 live listings:
--
--   quantity == 1        30      already sold >=1      7
--   quantity  > 1        21      status not IN_STOCK   2
--
-- So 41% are multi-quantity listings that sell down while staying listed, and
-- TWO of the current links are already in that state. It is not a hypothetical.
--
-- Why this matters more than it looks: a sold-out listing is READABLE and
-- therefore honest. A listing that has vanished returns 404 with no detail --
-- sold, expired and delisted are indistinguishable, so a gone listing can never
-- be labelled "Sold". This column is what lets the site say something true about
-- the only case where truth is available.

ALTER TABLE ebay_links
  ADD COLUMN IF NOT EXISTS availability  TEXT,
  ADD COLUMN IF NOT EXISTS sold_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS available_qty INTEGER;

COMMENT ON COLUMN ebay_links.availability IS
  'eBay estimatedAvailabilityStatus (IN_STOCK / LIMITED_QUANTITY / OUT_OF_STOCK). '
  'OUT_OF_STOCK means listed but nothing left: shown with a Sold out badge, price '
  'still displayed, and excluded from the cheapest claim because it is not buyable. '
  'NULL on rows written before the refresh job existed.';

COMMENT ON COLUMN ebay_links.sold_quantity IS
  'eBay estimatedSoldQuantity at last check. Only meaningful on multi-quantity '
  'listings, which are 41% of them.';

COMMENT ON COLUMN ebay_links.available_qty IS
  'eBay estimatedAvailableQuantity at last check.';

-- Confirm
SELECT
  count(*)                                            AS rows,
  count(availability)                                 AS with_availability,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'ebay_links'
       AND column_name IN ('availability','sold_quantity','available_qty'))
                                                      AS new_columns
FROM ebay_links;
