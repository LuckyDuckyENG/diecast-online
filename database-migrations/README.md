# Database Migrations

This folder contains SQL scripts to manage your Supabase database.

## File Structure

```
database-migrations/
├── README.md              <- You are here
├── retailers.sql          <- Retailer/store data (independent)
└── price-history.sql      <- Links models to retailers with prices (depends on: models, retailers)
```

## How to Use

### Running Scripts

1. Go to your **Supabase Dashboard**
2. Click **SQL Editor** in the sidebar
3. Click **New Query**
4. Copy/paste the SQL file contents
5. Click **Run**

### Order Matters!

Some files depend on others. Run them in this order:

#### Independent Files (run anytime, any order):
- ✅ `retailers.sql` - Can run standalone

#### Dependent Files (run AFTER dependencies exist):
- ⚠️ `price-history.sql` - Requires: `models` and `retailers` to exist first

### Safe to Re-run

All files are designed to be **idempotent** (safe to run multiple times):
- `retailers.sql` - Uses `ON CONFLICT DO NOTHING` - won't create duplicates
- `price-history.sql` - Truncates and regenerates fresh data

## Adding New Data

### Adding More Retailers

Edit `retailers.sql` and add new entries:

```sql
INSERT INTO retailers (name, url) VALUES
  ('New Store Name', 'https://newstore.com')
ON CONFLICT (name) DO NOTHING;
```

Then re-run the file in Supabase SQL Editor.

### Refreshing Prices

Just re-run `price-history.sql` - it will:
1. Clear old price data
2. Generate new random price variations
3. Link models to retailers

## Future Organization

As you add more seasons, consider organizing like this:

```
database-migrations/
├── retailers.sql
├── manufacturers.sql
├── 2024-season/
│   ├── season.sql
│   ├── teams.sql
│   ├── drivers.sql
│   ├── cars.sql
│   └── models.sql
├── 2025-season/
│   ├── season.sql
│   ├── teams.sql
│   └── ...
└── price-history.sql
```

## Notes

- All SQL files include verification queries at the end to check results
- Price variations are random: -5% to +10% from base model price
- Each model is linked to 3-5 random retailers
- Timestamps show when prices were last updated
