-- Drop the problematic triggers
DROP TRIGGER IF EXISTS update_ebay_links_updated_at ON ebay_links;

-- Recreate trigger correctly (only for UPDATE, not INSERT)
CREATE TRIGGER update_ebay_links_updated_at
  BEFORE UPDATE ON ebay_links
  FOR EACH ROW
  WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION update_updated_at_column();
