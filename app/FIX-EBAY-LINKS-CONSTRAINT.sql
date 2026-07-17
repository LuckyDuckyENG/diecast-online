-- Fix ebay_links foreign key to point to models table instead of diecast_models
-- This allows newly created models (in models table) to have eBay links

-- Step 1: Drop the old foreign key constraint
ALTER TABLE ebay_links
  DROP CONSTRAINT IF EXISTS ebay_links_model_id_fkey;

-- Step 2: Delete old ebay_links that reference diecast_models (TEXT IDs like "model-w15-ham-bahrain")
-- We'll keep them in diecast_models but can't use them with new models table
DELETE FROM ebay_links WHERE model_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

-- Step 3: Now we can safely change model_id to UUID (only UUID strings remain)
ALTER TABLE ebay_links
  ALTER COLUMN model_id TYPE UUID USING model_id::uuid;

-- Step 4: Add new foreign key constraint pointing to models table
ALTER TABLE ebay_links
  ADD CONSTRAINT ebay_links_model_id_fkey
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE;

-- Also fix listing_inventory foreign key
ALTER TABLE listing_inventory
  DROP CONSTRAINT IF EXISTS listing_inventory_searched_model_fkey;

-- Delete old inventory items with TEXT model IDs
DELETE FROM listing_inventory WHERE searched_model_id IS NOT NULL AND searched_model_id NOT SIMILAR TO '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

ALTER TABLE listing_inventory
  ALTER COLUMN searched_model_id TYPE UUID USING searched_model_id::uuid;

ALTER TABLE listing_inventory
  ADD CONSTRAINT listing_inventory_searched_model_fkey
  FOREIGN KEY (searched_model_id) REFERENCES models(id) ON DELETE SET NULL;
