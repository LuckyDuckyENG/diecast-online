-- Stop guessing the exchange rate.
--
-- lib/currency.ts has held four hardcoded, undated numbers since 31 July, and
-- price_aud -- which decides which shop the site calls cheapest -- is computed
-- from them. Checked against ECB reference rates on 2026-09-03:
--
--   USD  we use 1.5000, actual 1.3902   +7.9%   964 links
--   EUR  we use 1.6000, actual 1.6147   -0.9%   210 links
--   GBP  we use 1.9000, actual 1.8764   +1.3%   519 links
--
-- EUR and GBP are close enough to ignore. USD is not, and the error is
-- one-directional: every American shop looks 8% dearer than it is. Measured
-- against the live data, that hands the "cheapest" verdict to the wrong shop on
-- 31 of 413 models with competing offers, and every single flip is a US shop
-- that should have won. The quoted lowest price is 4.45% too high on average.
--
-- WHY A TABLE AND NOT A BETTER CONSTANT
--
-- A constant is how we got here. A rate with no date attached cannot be audited,
-- cannot be seen to be stale, and gets copied into a second file eventually.
--
-- Dated rows also make the price history honest. price_observations stores the
-- raw price and currency next to price_aud precisely so a conversion can be
-- redone; with dated rates it is possible to say WHICH rate a row used and, if
-- it was wrong, to recompute rather than to guess.
--
-- SHAPE
--
-- One row per (as_of, base, quote), not a column per currency. Adding a currency
-- is then an insert rather than a migration -- which matters because showing
-- prices in the reader's own currency is the obvious next step, and 21 of the
-- shops are American, 7 British and 6 European. The site is Australian only in
-- its presentation.

CREATE TABLE IF NOT EXISTS fx_rates (
  -- The DAY the rate is for, not the moment it was fetched. ECB publishes one
  -- reference rate per working day; two fetches on the same day are the same
  -- fact, which is why this is part of the key rather than fetched_at.
  as_of      DATE NOT NULL,

  -- Stored as a pair so any currency can be added later without a schema
  -- change. base -> quote: 1 unit of base costs `rate` units of quote.
  base       TEXT NOT NULL,
  quote      TEXT NOT NULL,

  -- Zero or negative is never a rate. Same reasoning as price_observations:
  -- this feeds a comparison, and one bad row makes "cheapest" wrong silently.
  rate       NUMERIC NOT NULL CHECK (rate > 0),

  -- Which authority said so, so a hand-entered stopgap is distinguishable from
  -- a published reference rate rather than blending in with it.
  source     TEXT NOT NULL,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (as_of, base, quote),

  -- A self-referential rate is a no-op that would quietly override nothing, and
  -- a rate from a currency to itself that is not 1 is a data error.
  CONSTRAINT fx_rates_not_self CHECK (base <> quote)
);

-- Every read is "the newest rate for this pair", so the index leads with the
-- pair and orders by date within it.
CREATE INDEX IF NOT EXISTS fx_rates_pair_idx
  ON fx_rates (base, quote, as_of DESC);

COMMENT ON TABLE fx_rates IS
  'Dated FX rates, one row per (day, base, quote). Replaces the hardcoded '
  'constants in lib/currency.ts, which were 7.9% wrong on USD. A rate with no '
  'date cannot be audited or seen to be stale.';

ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fx_rates_read ON fx_rates;
CREATE POLICY fx_rates_read
  ON fx_rates FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policy: only the service key writes, same as every
-- other table here.

-- Seed with the rates verified against ECB on 2026-09-03, so the table is never
-- empty and the first deploy does not silently fall back to the old constants.
INSERT INTO fx_rates (as_of, base, quote, rate, source) VALUES
  ('2026-09-03', 'USD', 'AUD', 1.3902, 'ecb-frankfurter'),
  ('2026-09-03', 'EUR', 'AUD', 1.6147, 'ecb-frankfurter'),
  ('2026-09-03', 'GBP', 'AUD', 1.8764, 'ecb-frankfurter')
ON CONFLICT (as_of, base, quote) DO NOTHING;
