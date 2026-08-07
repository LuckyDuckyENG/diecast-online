-- Remembering that we already looked.
--
-- A batch eBay search over every unlinked model is mostly wasted effort on the
-- second run: the models that matched now have an ebay_links row and are
-- skipped, but the ones that found nothing look identical to ones never tried.
-- Without a record we re-search them every time, paying for the same empty
-- answer indefinitely.
--
-- "eBay AU has nothing for this model" is also real information in its own
-- right. Most of these are discontinued 2023 cars; a model that no shop stocks
-- and no one is reselling is genuinely unobtainable, which is worth knowing and
-- worth showing.
--
-- One row per model, overwritten on each search — current state, not a log,
-- matching how price_history holds one current row per (model, retailer).
-- The name is kept for readability even though it isn't an append log.

CREATE TABLE IF NOT EXISTS ebay_search_log (
  model_id      UUID PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
  searched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Listings in the group's candidate pool, before matching. Zero means eBay
  -- returned nothing for the whole chassis/scale; a high number with no match
  -- means the pool was there and this model simply wasn't in it. Those two
  -- failures have different fixes, so they are stored distinctly.
  pool_size     INTEGER NOT NULL DEFAULT 0,
  matched       BOOLEAN NOT NULL DEFAULT false,
  marketplace   TEXT,
  query         TEXT
);

-- Drives "search the ones we haven't looked at recently"
CREATE INDEX IF NOT EXISTS ebay_search_log_searched_at_idx
  ON ebay_search_log (searched_at);

-- Admin bookkeeping, not catalogue data: RLS on with no policy makes it
-- invisible to the browser while server code using the service key is
-- unaffected. Same treatment as the other private tables in 010.
ALTER TABLE ebay_search_log ENABLE ROW LEVEL SECURITY;

-- Confirm
SELECT
  (SELECT count(*) FROM ebay_search_log)                                AS rows,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'ebay_search_log')                              AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'ebay_search_log') AS rls_on;
