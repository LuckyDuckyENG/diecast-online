-- Where the eBay listing physically is.
--
-- WHY THIS EXISTS
--
-- Every listing we hold is EBAY_AU, and eBay converts a foreign seller's price
-- into AUD before the API returns it. So a "price change" on such a listing is
-- frequently eBay's exchange rate moving rather than the seller doing anything.
--
-- Measured on the first three weeks of price_observations: of 391 eBay series
-- that moved, 208 moved by an identical -1.85% across 45 DIFFERENT sellers,
-- including a Bulgarian shop and two Japanese ones, and another 79 share
-- -9.09%. Independent sellers do not discount by the same figure on the same
-- day. It is the same shape of artefact as reading a chart off price_aud, and
-- it cannot be corrected after the fact because the conversion happens upstream
-- of us — we never see the native price.
--
-- A seller located in AU lists natively in AUD and has no conversion applied,
-- so this column is what lets the price history tell a real repricing from an
-- exchange-rate wobble, and draw only the former.
--
-- Nullable with no default and no backfill: every existing row is genuinely
-- unknown until refresh-ebay reads it again, and a guessed 'AU' here would put
-- a fabricated line on a page. Unknown must stay unknown.

ALTER TABLE ebay_links
  ADD COLUMN IF NOT EXISTS item_country TEXT;

COMMENT ON COLUMN ebay_links.item_country IS
  'ISO country of the listing (itemLocation.country). AU means the price is '
  'natively AUD; anything else means eBay converted it and its price history '
  'moves with the exchange rate. NULL = not yet re-read by refresh-ebay.';
