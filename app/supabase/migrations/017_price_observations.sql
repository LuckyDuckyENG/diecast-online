-- Stop throwing away every price we read.
--
-- price_history and ebay_links are CURRENT STATE by design: a refresh overwrites
-- in place, so there is no series and no undo. We hold exactly one data point
-- per link, which means the site can say what something costs today and nothing
-- at all about what it cost in March.
--
-- For a price INDEX that is the wrong way round. Anyone can show a current
-- price. "This has traded between AUD 150 and 400 over the past year" is the
-- thing that is hard to get and worth coming back for -- and it is free, because
-- a refresh already READS the price. It just discards it.
--
-- So this table is append-only, and the refresh jobs insert one row per
-- successful check, including the unchanged case. An unchanged price is a real
-- observation and will be the most common one.
--
-- WHAT THIS IS NOT: eBay sold prices. A vanished listing returns
-- 404 errorId 11001 with no detail -- sold, expired and delisted are the same
-- response, verified against a fabricated id. eBay's Marketplace Insights API
-- has genuine sold data but is limited-release and covers ~90 days; the old
-- Finding API findCompletedItems is retired. So every row here means "we
-- observed this offer at this price at this time", never "it sold for this".
-- Any UI built on this table must use that wording.
--
-- Types are not guessed. PostgREST's OpenAPI description
-- (GET /rest/v1/ with Accept: application/openapi+json) reports models.id and
-- retailers.id as uuid and ebay_links.ebay_item_id as text. models and cars are
-- created outside this migrations directory, so the files cannot tell you and
-- migration 015 wasted three attempts assuming.

CREATE TABLE IF NOT EXISTS price_observations (
  id            BIGSERIAL PRIMARY KEY,

  -- Cascades: an observation with no model is unattributable and meaningless.
  model_id      UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

  -- Exactly one source per row, enforced below rather than trusted. A row
  -- belonging to neither is unattributable and silently poisons every range
  -- computed from this table.
  --
  -- retailer_id is ON DELETE SET NULL, and ebay_item_id is a plain column with
  -- NO foreign key, both for the same reason: the sources are deleted routinely
  -- -- eBay listings when they 404, retailers when they get merged -- and the
  -- observation of a price that WAS real should outlive the thing that had it.
  -- A cascading FK here would quietly erase the history this table exists for.
  retailer_id   UUID REFERENCES retailers(id) ON DELETE SET NULL,
  ebay_item_id  TEXT,

  -- CHECKs, not conventions. This table feeds min/max, and unlike price_history
  -- there is no overwrite to correct a bad row later: one zero makes "lowest
  -- ever seen" wrong permanently. A zero price has always been a failed
  -- extraction rather than an offer.
  price         NUMERIC NOT NULL CHECK (price > 0),
  currency      TEXT    NOT NULL,
  price_aud     NUMERIC NOT NULL CHECK (price_aud > 0),

  -- State at the time of observation, so a range can exclude what was not
  -- buyable. Nullable because eBay reports availability and retailers report
  -- stock, and neither knows about the other's field.
  in_stock      BOOLEAN,
  is_preorder   BOOLEAN,
  availability  TEXT,

  observed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT observation_has_one_source CHECK (
    (retailer_id IS NOT NULL AND ebay_item_id IS NULL) OR
    (retailer_id IS NULL     AND ebay_item_id IS NOT NULL)
  )
);

-- Every read is "the observations for this model, newest first".
CREATE INDEX IF NOT EXISTS price_observations_model_time_idx
  ON price_observations (model_id, observed_at DESC);

-- Deliberately NO unique constraint. Two observations of the same offer on the
-- same day are a repeated reading, not a conflict. De-duplication is a read-time
-- concern, and forbidding it here would make a re-run of a refresh fail rather
-- than record what it saw.

COMMENT ON TABLE price_observations IS
  'Append-only log of every price we have READ, from any source. One row per '
  'successful check including unchanged ones. Means "observed at this price at '
  'this time" -- never "sold for this price", which eBay does not tell us.';

-- RLS, consistent with every other table: the public site reads, nothing else.
ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_observations_read ON price_observations;
CREATE POLICY price_observations_read
  ON price_observations FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy on purpose. Only the refresh jobs write here
-- and they use the service key, which bypasses RLS. Writes stay server-side.

-- Confirm
SELECT
  (SELECT count(*) FROM price_observations)                            AS rows,
  (SELECT count(*) FROM information_schema.tables
     WHERE table_name = 'price_observations')                          AS table_exists,
  (SELECT count(*) FROM pg_indexes
     WHERE tablename = 'price_observations')                           AS indexes,
  (SELECT relrowsecurity FROM pg_class
     WHERE relname = 'price_observations')                             AS rls_on;
