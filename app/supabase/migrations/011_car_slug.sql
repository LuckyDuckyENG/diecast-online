-- Human-readable, search-friendly URLs for cars.
--
-- Car pages are currently /cars/<uuid>, which tells a visitor nothing and
-- carries none of the words people actually search for. The slug is built from
-- the same five fields that identify a car, so it is naturally unique:
--
--   /cars/c9dbbaae-6b03-4ddd-9bef-87cab2c6e100
--   /cars/2024-mercedes-w15-lewis-hamilton-bahrain-gp
--
-- Stored rather than derived on the fly, so the database is the authority: a
-- UNIQUE index makes a collision impossible to introduce, instead of something
-- discovered later when two pages fight over the same URL.
--
-- Nullable for now — backfilled by script immediately after this runs. Once
-- every row has one it can be made NOT NULL.
--
-- Safe to run more than once.

ALTER TABLE cars
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cars_slug_key
  ON cars (slug)
  WHERE slug IS NOT NULL;

-- Confirm
SELECT
  count(*)                          AS total_cars,
  count(slug)                       AS with_slug,
  count(*) - count(slug)            AS awaiting_backfill
FROM cars;
