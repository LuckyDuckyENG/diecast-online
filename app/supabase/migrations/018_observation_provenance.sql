-- Make a bad run undoable.
--
-- price_observations is append-only with no correction path -- that is the point
-- of it, and migration 017 says so twice. But it means a mistake is permanent
-- unless you can find exactly the rows the mistake wrote, and until now nothing
-- recorded which run wrote a row.
--
-- The only handle was a timestamp window, and a window is the wrong shape: three
-- jobs write to this table and they overlap. Deleting "everything from Tuesday
-- afternoon" to remove one bad sweep also deletes the good eBay refresh that ran
-- alongside it. So the choice was between keeping bad history or destroying good
-- history with it.
--
-- With a batch id, undoing a run is one statement that cannot take anything else
-- with it:
--
--   DELETE FROM price_observations WHERE batch_id = '...';
--
-- This matters most right now. The September refresh is the first time every
-- writer records together, which makes it the real start of the series -- and
-- the first run big enough that getting it wrong would matter.

ALTER TABLE price_observations
  -- One id per RUN, not per row. Nullable because the 1,748 rows already here
  -- predate batching and cannot be attributed to a run after the fact; NULL
  -- means "written before this migration", which is the truth.
  ADD COLUMN IF NOT EXISTS batch_id UUID,

  -- Which job wrote it: sweep, refresh-prices, refresh-ebay, rescue.
  --
  -- No CHECK constraint listing the values, deliberately. A DB-level enum would
  -- make adding a writer require a migration, and the failure it prevents -- a
  -- typo like 'sweep-retailer' where the rest of the code says 'sweep' -- is
  -- better caught by a TypeScript union in lib/priceObservation.ts, which every
  -- writer already imports. The constraint would sit in the wrong place and
  -- catch it later.
  ADD COLUMN IF NOT EXISTS source TEXT;

-- The undo path is a delete by batch, so it must not table-scan 1.7k rows and
-- rising. Partial, because the pre-migration rows have no batch to look up.
CREATE INDEX IF NOT EXISTS price_observations_batch_idx
  ON price_observations (batch_id)
  WHERE batch_id IS NOT NULL;

-- Answering "what did that run do?" without scanning: batches are read newest
-- first, the same way the model series is.
CREATE INDEX IF NOT EXISTS price_observations_source_time_idx
  ON price_observations (source, observed_at DESC);

COMMENT ON COLUMN price_observations.batch_id IS
  'One id per writing RUN. The only way to undo a bad run without destroying '
  'good rows written by other jobs at the same time. NULL for rows written '
  'before migration 018.';

COMMENT ON COLUMN price_observations.source IS
  'Which job wrote the row: sweep, refresh-prices, refresh-ebay, rescue. '
  'Values are constrained by a TypeScript union rather than a CHECK, so adding '
  'a writer does not need a migration.';
