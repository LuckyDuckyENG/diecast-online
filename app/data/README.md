# 2024 F1 GP Winners Data

This CSV contains all 2024 F1 Grand Prix race winners with their official diecast model SKUs.

## Important Notes

### Ferrari Exclusivity
All 2024 Ferrari models are made ONLY by **Looksmart** and **BBR** (not Minichamps or Spark). This is due to exclusive licensing agreements between Ferrari and these manufacturers.

### Missing Scale Exception
For the Alpine Indiana Jones edition (Austin GP), Spark announced it primarily as a 1:18 model. The 1:43 scale slot is intentionally left blank.

### Special Liveries Included
- **Belgian GP - Deadpool Edition** (Alpine)
- **Miami GP - Chameleon Edition** (Visa Cash App RB)
- **Singapore GP - Denim Edition** (Visa Cash App RB)
- **Las Vegas GP - Glitter Edition** (Visa Cash App RB)
- **Mexico City GP - Retro Yellow** (Williams - Franco Colapinto)
- **Las Vegas GP - Flame Edition** (Kick Sauber)
- **Austin GP - Indiana Jones Edition** (Alpine)

### Colapinto Effect
Franco Colapinto's Williams with the yellow retro engine cover from Mexico City is included, tracking the mid-season driver switch.

## CSV Format

```
event_name,driver_name,team_name,livery_name,year,manufacturer,sku_1_18,sku_1_43
```

## Usage

Run the CSV importer:
```bash
cd app
npx tsx scraper/import-from-csv.ts
```
