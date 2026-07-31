-- Track when a retailer link was last VERIFIED, not just when it last changed.
--
-- recorded_at only moves when the price or stock actually changes, so a link
-- checked ten minutes ago that has been stable for a month still reads as a
-- month old. That's misleading to show a visitor, and it makes "refresh only
-- what's stale" impossible to implement.
--
-- last_checked_at is deliberately set ONLY on a successful check. Links we
-- can't read (403s, shops that publish no price) therefore age visibly instead
-- of hiding behind a fresh-looking timestamp — a row we cannot verify should
-- look stale.

ALTER TABLE price_history
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

-- Existing rows: the last time we know we saw them was when they were recorded.
UPDATE price_history
SET last_checked_at = recorded_at
WHERE last_checked_at IS NULL;

-- Lets "find the stale ones" stay cheap as the table grows.
CREATE INDEX IF NOT EXISTS price_history_last_checked_at_idx
  ON price_history (last_checked_at);
