-- Drop ALL the problematic triggers completely
DROP TRIGGER IF EXISTS update_f1_cars_updated_at ON f1_cars;
DROP TRIGGER IF EXISTS update_diecast_models_updated_at ON diecast_models;
DROP TRIGGER IF EXISTS update_ebay_links_updated_at ON ebay_links;
DROP TRIGGER IF EXISTS update_model_inventory_updated_at ON model_inventory;

-- We'll handle updated_at manually in the application for now
