-- Pattern 2: Composite Key Schema Migration
-- This migration restructures the database to prevent data integrity issues

-- Step 1: Add driver_id column to cars table (if not exists)
ALTER TABLE cars 
ADD COLUMN IF NOT EXISTS driver_id UUID REFERENCES drivers(id);

-- Step 2: Drop the old car_drivers junction table (we don't need it anymore)
-- Cars will have direct driver_id foreign key instead
DROP TABLE IF EXISTS car_drivers CASCADE;

-- Step 3: Rename livery_name to chassis_name for clarity
ALTER TABLE cars 
RENAME COLUMN livery_name TO chassis_name;

-- Step 4: Add unique constraint on the 5-field composite key
-- This is THE KEY CONSTRAINT that prevents all the duplicate/orphan issues
ALTER TABLE cars
ADD CONSTRAINT cars_unique_composite_key
UNIQUE (season_id, team_id, chassis_name, driver_id, event_name);

-- Step 5: Ensure models have car_id (make it required)
ALTER TABLE models
ALTER COLUMN car_id SET NOT NULL;

-- Step 6: Add cascade delete so orphaned models are impossible
ALTER TABLE models
DROP CONSTRAINT IF EXISTS models_car_id_fkey;

ALTER TABLE models
ADD CONSTRAINT models_car_id_fkey 
FOREIGN KEY (car_id) 
REFERENCES cars(id) 
ON DELETE CASCADE;

-- Step 7: Remove duplicate fields from models table
ALTER TABLE models
DROP COLUMN IF EXISTS driver_id;  -- Get this from car

ALTER TABLE models
DROP COLUMN IF EXISTS event_name;  -- Get this from car

-- Step 8: Add unique constraint on SKUs to prevent duplicate models
ALTER TABLE models
ADD CONSTRAINT models_unique_sku
UNIQUE (manufacturer_id, manufacturer_sku, scale);

-- Step 9: Drop unused columns
ALTER TABLE cars
DROP COLUMN IF EXISTS master_car_id;

-- Step 10: Add notes column if it doesn't exist
ALTER TABLE cars
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE models
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Migration complete!
-- Next step: Run CSV sync script to populate clean data
