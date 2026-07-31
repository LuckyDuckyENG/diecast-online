-- ============================================================
-- Row Level Security
--
-- The anon key ships to every visitor's browser — it is public by design.
-- Without RLS it also granted full write access: anon could INSERT into cars
-- and price_history and DELETE price_history rows. Anyone reading the page
-- source could edit or wipe the catalogue.
--
-- Model used here:
--   * anon / authenticated  -> SELECT only, and only on tables the public site
--                              actually reads (including tables reached through
--                              nested joins, which PostgREST also checks)
--   * service_role          -> bypasses RLS entirely (Supabase built-in), so
--                              every admin route keeps working unchanged
--
-- Tables with RLS enabled and NO policy are therefore fully private: invisible
-- to the browser, still reachable from server code using the service key.
--
-- Safe to run more than once.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Public catalogue — readable by anyone, writable by no one
-- ------------------------------------------------------------

ALTER TABLE cars           ENABLE ROW LEVEL SECURITY;
ALTER TABLE models         ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE manufacturers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE retailers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_links     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read ON cars;
CREATE POLICY public_read ON cars          FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON models;
CREATE POLICY public_read ON models        FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON drivers;
CREATE POLICY public_read ON drivers       FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON teams;
CREATE POLICY public_read ON teams         FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON seasons;
CREATE POLICY public_read ON seasons       FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON manufacturers;
CREATE POLICY public_read ON manufacturers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON retailers;
CREATE POLICY public_read ON retailers     FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON price_history;
CREATE POLICY public_read ON price_history FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS public_read ON ebay_links;
CREATE POLICY public_read ON ebay_links    FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------------
-- 2. Admin / internal — no public access at all
--
-- RLS on with no policy = denied for anon and authenticated. The admin API
-- routes reach these with the service key, which is not subject to RLS.
-- ------------------------------------------------------------

ALTER TABLE listing_inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE diecast_models      ENABLE ROW LEVEL SECURITY;
ALTER TABLE f1_cars             ENABLE ROW LEVEL SECURITY;

-- Legacy / unused tables. Locked rather than dropped, so nothing breaks if
-- something still references them.
ALTER TABLE ebay_listings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ebay_sold_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_cars         ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_inventory     ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews             ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 3. Confirm
-- ------------------------------------------------------------

SELECT
  c.relname                          AS table_name,
  c.relrowsecurity                   AS rls_enabled,
  count(p.polname)                   AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relrowsecurity, c.relname;
