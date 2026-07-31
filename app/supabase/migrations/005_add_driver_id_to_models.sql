-- Add driver_id column to models table
-- This allows us to group models by driver correctly

ALTER TABLE models
ADD COLUMN driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_models_driver_id ON models(driver_id);

-- Comment on the column
COMMENT ON COLUMN models.driver_id IS 'The driver this specific model represents';
