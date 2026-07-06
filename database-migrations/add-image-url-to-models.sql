-- Add image_url column to models table to store Supabase Storage URLs
ALTER TABLE models
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN models.image_url IS 'URL to product image stored in Supabase Storage (model-images bucket)';
