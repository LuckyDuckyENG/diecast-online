-- Add product_url column to price_history table
-- This will store the actual retailer product page URL

ALTER TABLE price_history
ADD COLUMN IF NOT EXISTS product_url TEXT;

-- Verify the column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'price_history';
