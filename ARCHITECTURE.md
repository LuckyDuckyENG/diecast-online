# F1 Diecast Database Architecture

## Core Concept
A hierarchical system with three layers: Chassis → Driver → Event

## Data Structure

### Cars Table
Each car record represents a **unique combination** of:
- **Season** (year)
- **Team** (Mercedes, Ferrari, Red Bull, etc.)
- **Chassis** (W13, SF23, RB20, etc.)
- **Driver** (Lewis Hamilton, Max Verstappen, etc.)
- **Event** (Miami GP, Monaco GP, "Season", etc.)

**Uniqueness Constraint:**
```sql
UNIQUE(season_id, team_id, livery_name, driver_id, event_name)
```

### Examples

✅ **Correct - Separate Cars:**
- 2022 Mercedes W13 - Lewis Hamilton - Miami GP
- 2022 Mercedes W13 - Lewis Hamilton - Monaco GP
- 2022 Mercedes W13 - George Russell - Miami GP
- 2022 Mercedes W13 - Lewis Hamilton - Season

❌ **Wrong - These should NOT be in one car:**
- 2024 Red Bull RB20 with 28 models from different events mixed together

### Models Table
Physical diecast products that belong to ONE car:
- `car_id` → links to the specific car (chassis + driver + event combo)
- `driver_id` → should match the car's driver
- `event_name` → should match the car's event_name
- `manufacturer_id` → Spark, Minichamps, Looksmart, Bburago
- `scale` → 1:18, 1:43, 1:8, etc.
- `manufacturer_sku` → Unique product code

### Junction Tables
- `car_drivers` → Links cars to drivers (should have ONE driver per car in this architecture)

## Special Cases

### Season Cars
For models representing a whole season (not a specific race):
- `event_name = "Season"` (string, not NULL)
- Example: "2024 McLaren MCL38 - Lando Norris - Season"

### Event Name Consistency
- Car's `event_name` and all its models' `event_name` must match
- If they don't match, the car_id assignment is wrong

## Frontend Display

### Browse Page
Shows individual car cards, each representing one chassis + driver + event combo:
- "Miami GP Winner - W13 - Lewis Hamilton - 2022"
- "Monaco GP - SF23 - Charles Leclerc - 2023"

### Car Detail Page (/cars/[id])
Shows all models (different scales/manufacturers) for that specific combo:
- Title: "Miami GP - W13 - Lewis Hamilton - 2022"
- Variants section: Shows 1:18 Spark, 1:43 Minichamps, etc.

### Backend Admin (get-f1-data API)
Groups cars by chassis for admin view:
- Shows "2023 Ferrari SF23" with driver groups underneath
- Each driver group shows their models
- Used for inventory management, eBay linking, etc.

## Current Issues (to be fixed)

1. **Merged Cars**: Some cars have models from multiple events mixed together
   - Example: RB20 has 28 models from Las Vegas, Canada, Bahrain, Brazil, etc. all in ONE car
   - FIX: Split into separate cars per event

2. **Event Name Mismatches**: car.event_name doesn't match model.event_name
   - FIX: Either update car.event_name or split models into correct cars

3. **Missing Unique Constraint**: Database allows duplicate car combinations
   - FIX: Add unique constraint after cleaning up duplicates

## Fixing Strategy

1. Identify wrongly merged cars (cars with models from different events)
2. Extract correct event info from retailer URLs
3. Split models into correct car records (one per driver + event)
4. Add database unique constraint to prevent future duplicates
5. Update search-car logic to match by all 5 fields
