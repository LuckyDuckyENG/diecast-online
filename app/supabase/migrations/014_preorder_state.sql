-- A pre-order is a third state, and the schema only had two.
--
-- in_stock is a boolean, so "orderable but not shipping for months" had nowhere
-- to live and landed as In Stock. Shopify reports a pre-order as available, so
-- the sweep believed it. Five Stone Model rows are already wrong this way, and
-- 2025 would make it far worse: of the ~224 2025 products that shop lists, most
-- carry a [Pre-Order] prefix.
--
-- The failure is not cosmetic. A collector clicks a link labelled In Stock,
-- expecting a model to arrive next week, and finds a six-month wait. On a site
-- whose whole value is being trustworthy about price and availability, that is
-- the expensive kind of wrong.
--
-- Deposits are a separate problem and are already handled: a pre-order priced
-- far below its peers is refused at write time, because a AUD 50 deposit stored
-- as a price wins every "cheapest" sort. This column is for pre-orders at a
-- REAL price -- a genuine offer where only the timing differs.

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS is_preorder BOOLEAN NOT NULL DEFAULT false;

-- Drives the "buyable now" filter behind the headline price
CREATE INDEX IF NOT EXISTS price_history_preorder_idx
  ON price_history (is_preorder)
  WHERE is_preorder = true;

COMMENT ON COLUMN price_history.is_preorder IS
  'Retailer sells this as a pre-order: orderable, not yet shipping. Set from the '
  'shop''s own product title during a sweep. Excluded from the lowest-price claim '
  'on a car page, but still shown with its price and a badge.';

-- Confirm
SELECT
  count(*)                                    AS rows,
  count(*) FILTER (WHERE is_preorder)         AS preorders,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'price_history'
       AND column_name = 'is_preorder')       AS column_exists
FROM price_history;
