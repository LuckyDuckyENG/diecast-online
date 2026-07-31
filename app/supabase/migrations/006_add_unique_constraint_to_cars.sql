-- Add unique constraint to prevent duplicate cars
-- Each car must be unique by: season + team + chassis (livery_name) + driver + event

-- Step 1: Add driver_id column to cars table (if not exists)
ALTER TABLE cars ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

-- Step 2: Migrate driver data from car_drivers junction table to cars.driver_id
UPDATE cars
SET driver_id = (
  SELECT driver_id
  FROM car_drivers
  WHERE car_drivers.car_id = cars.id
  LIMIT 1
)
WHERE driver_id IS NULL;

-- Step 3: Add unique constraint on cars table for season + team + livery + event + driver
ALTER TABLE cars
ADD CONSTRAINT cars_unique_season_team_livery_event_driver
UNIQUE (season_id, team_id, livery_name, event_name, driver_id);

-- Note: We keep the car_drivers junction table for backwards compatibility
-- but cars.driver_id is now the source of truth and enforces uniqueness
-- This allows Monaco GP to have separate cars for Lando Norris and Oscar Piastri
