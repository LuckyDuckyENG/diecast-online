-- ============================================
-- ADD EVENT NAME TO CARS TABLE
-- ============================================
-- Adds event_name field to store Grand Prix or special edition info
-- This is the PRIMARY identifier for browsing (Miami GP, Monaco GP, etc.)
-- Safe to re-run
-- ============================================

-- Add event_name column to cars table
ALTER TABLE cars
ADD COLUMN IF NOT EXISTS event_name TEXT;

-- Update the Norris Miami GP car with proper event name
-- First, let's find it by looking for the car that has models with Miami GP in description
UPDATE cars
SET event_name = 'Miami GP Winner'
WHERE livery_name = 'MCL38'
  AND id IN (
    SELECT DISTINCT car_id
    FROM models
    WHERE description LIKE '%Miami GP%'
  );

-- Verify the update
SELECT
  c.id,
  c.livery_name,
  c.event_name,
  d.name as driver,
  s.year as season,
  COUNT(m.id) as variant_count
FROM cars c
LEFT JOIN car_drivers cd ON cd.car_id = c.id
LEFT JOIN drivers d ON d.id = cd.driver_id
LEFT JOIN seasons s ON s.id = c.season_id
LEFT JOIN models m ON m.car_id = c.id
WHERE c.event_name IS NOT NULL
GROUP BY c.id, c.livery_name, c.event_name, d.name, s.year
ORDER BY c.event_name;
