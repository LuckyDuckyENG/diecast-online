-- One eBay listing per model was hiding the market.
--
-- Migration 012 gave ebay_links UNIQUE (model_id), mirroring how price_history
-- works. That is right for a retailer -- a shop has one price for a thing -- but
-- eBay is not a shop. It is many sellers listing the same model at once, and
-- collapsing them to one row means picking a winner and discarding the rest.
--
-- The picking was measurably bad. Of 52 models where two or more listings exist
-- and we already held a link, 34 had a CHEAPER listing than the one displayed:
--
--   417231001   showing 426.45   cheapest 124.87   -71%   (3 listings)
--   110230163   showing 297.61   cheapest 172.45   -42%   (5 listings)
--   110230101   showing 410.40   cheapest 256.14   -38%
--
-- The median gap is under 1%, so most of the time the choice was fine. But
-- roughly one model in eight was overstated by more than 20%, and on a site
-- whose entire claim is price accuracy, quoting 426 for something available at
-- 125 is the expensive kind of wrong. The likely cause is that the title scorer
-- prefers the most keyword-complete titles, and the priciest seller in nearly
-- every group writes the most complete titles. Storing every listing makes the
-- choice irrelevant, which beats tuning the scorer.
--
-- Listings per model run 1 to 6 in practice, never more, so there is no cap
-- here. A bound belongs in the UI if anywhere, not in the data.
--
-- This also removes the reason expiry checking was blocking: with three to six
-- listings on a model, one going dead no longer empties a page. Measured
-- 2026-08-17, none of 77 sampled links were dead at up to 10 days old and there
-- are no auctions at all, so decay is slow.
--
-- Safe to run: verified beforehand that all 382 rows have a non-null
-- ebay_item_id, none disagrees with its URL, and no (model_id, ebay_item_id)
-- pair repeats -- so the new constraint accepts the existing data unchanged.
--
-- An earlier draft of this file found the old constraints by introspecting
-- pg_constraint and comparing column-name arrays. It failed twice on type
-- details (attname is `name`, not `text`; indkey is an int2vector, not an
-- array). Naming the two constraints directly is duller and actually works --
-- DROP CONSTRAINT IF EXISTS cannot fail on a name that is not there. Step 5
-- prints what is left so nothing is assumed.

-- 1. Drop both unique constraints on (model_id).
--
-- There are two. Migration 012 added ebay_links_unique_model explicitly, and
-- migration 001 declared an inline UNIQUE(model_id) in CREATE TABLE, which
-- Postgres names <table>_<column>_key.
ALTER TABLE ebay_links DROP CONSTRAINT IF EXISTS ebay_links_unique_model;
ALTER TABLE ebay_links DROP CONSTRAINT IF EXISTS ebay_links_model_id_key;

-- 2. ebay_item_id becomes the thing that separates two listings, so it can no
-- longer be NULL.
--
-- It was nullable and save-ebay-link used to write `ebayItemId ?? null`, which
-- matters more than it looks: Postgres treats NULLs as DISTINCT, so under the
-- new constraint every id-less save would insert another row instead of
-- updating one. Backfill from the URL first -- eBay URLs carry the id -- then
-- make it required. (Currently 0 rows are NULL, so this is belt and braces.)
UPDATE ebay_links
SET ebay_item_id = 'v1|' || substring(ebay_url FROM '/itm/(?:[^/]*/)?([0-9]{9,15})') || '|0'
WHERE ebay_item_id IS NULL
  AND substring(ebay_url FROM '/itm/(?:[^/]*/)?([0-9]{9,15})') IS NOT NULL;

-- Fail loudly rather than quietly weakening the constraint.
DO $$
DECLARE orphans int;
BEGIN
  SELECT count(*) INTO orphans FROM ebay_links WHERE ebay_item_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION
      'ebay_item_id is still NULL on % row(s) and no id could be read from their URL. '
      'Fix or delete those rows, then re-run.', orphans;
  END IF;
END $$;

ALTER TABLE ebay_links ALTER COLUMN ebay_item_id SET NOT NULL;

-- 3. One row per (model, listing).
--
-- model_id leads the constraint, so its index still serves the `WHERE model_id
-- = ...` lookups the car page and admin do -- dropping the old constraints does
-- not cost a lookup path.
ALTER TABLE ebay_links
  DROP CONSTRAINT IF EXISTS ebay_links_unique_model_item;

ALTER TABLE ebay_links
  ADD CONSTRAINT ebay_links_unique_model_item UNIQUE (model_id, ebay_item_id);

-- 4. Condition and seller.
--
-- Condition is recorded for honesty, not filtering. Used listings turned out to
-- be often MORE expensive than new -- 255.70 used against 124.87 new on one
-- model, because the new one came from a cheaper seller -- so treating used as
-- non-comparable and hiding it from the lowest-price claim is not supported by
-- the data. Badge it and let people decide.
--
-- Seller is what dedupes: hobbyland.bg lists the same model twice at 296.89 and
-- 321.56, and showing both as if they were competing offers is noise. Keep the
-- cheapest per seller.
--
-- Named item_condition rather than condition: `condition` is a reserved word in
-- PL/pgSQL, and a column that has to be quoted in some contexts and not others
-- is a trap for later.
ALTER TABLE ebay_links
  ADD COLUMN IF NOT EXISTS item_condition TEXT,
  ADD COLUMN IF NOT EXISTS seller         TEXT;

COMMENT ON COLUMN ebay_links.item_condition IS
  'eBay''s own condition string (New, Used, ...). Shown as a badge. NOT excluded '
  'from the lowest-price claim -- used listings are frequently dearer than new.';

COMMENT ON COLUMN ebay_links.seller IS
  'eBay seller username. Listings are deduped to the cheapest per seller, so one '
  'shop listing the same model twice does not read as two competing offers.';

-- 5. Show what the table now has, so nothing is assumed.
--
-- pg_get_constraintdef returns the definition as text, which sidesteps the
-- array-comparison problem entirely. Expect exactly one unique constraint,
-- UNIQUE (model_id, ebay_item_id). If a UNIQUE (model_id) is still listed, the
-- migration has not achieved its purpose -- say so rather than continuing.
SELECT con.conname AS constraint_name,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace ns ON ns.oid = rel.relnamespace
WHERE rel.relname = 'ebay_links'
  AND ns.nspname = 'public'
  AND con.contype = 'u'
ORDER BY con.conname;

-- Any unique index not backed by a constraint would enforce one-per-model just
-- as effectively, so list the indexes too.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'ebay_links'
ORDER BY indexname;

-- Confirm
SELECT
  (SELECT count(*) FROM ebay_links)                                        AS rows,
  (SELECT count(DISTINCT model_id) FROM ebay_links)                        AS models,
  (SELECT count(*) FROM ebay_links WHERE ebay_item_id IS NULL)             AS null_item_ids,
  (SELECT is_nullable FROM information_schema.columns
     WHERE table_name = 'ebay_links' AND column_name = 'ebay_item_id')     AS item_id_nullable,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name = 'ebay_links'
       AND column_name IN ('item_condition', 'seller'))                    AS new_columns;
