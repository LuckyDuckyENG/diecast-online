# TODO for Tomorrow

## Current Status
✅ Database connected and working
✅ Scraper successfully finds products
✅ 30 real products scraped from retailers
✅ Browse and Model pages display real data

## Issues to Fix

### 1. Wrong Product Types Being Added
**Problem:** Products like helmets, shirts, dioramas are being scraped instead of just die-cast model cars.

**Solution:**
- Add product type filtering in scraper
- Only accept products with keywords: "model", "diecast", "scale"
- Reject products with: "helmet", "shirt", "cap", "diorama", "playset"

### 2. Product Matching Issues
**Problem:** When syncing, one model matches to slightly different products at different stores. Example: Charles Leclerc Bburago model links to "car only" at one shop and "car + pitcrew" at another.

**Solution:**
- Add product title similarity checking
- Ensure all retailers return the SAME or very similar product
- Compare scale, manufacturer, driver name across matches
- Flag mismatches for manual review

## Tasks for Tomorrow

### Priority 1: Clean Up Scraper
- [ ] Add product type filtering (reject helmets, shirts, etc.)
- [ ] Add title matching verification
- [ ] Improve search queries (use car name + driver + scale)
- [ ] Test on 1-2 models first

### Priority 2: Clean Database
- [ ] Delete bad matches from price_history table
- [ ] Remove non-working retailers (Grand Prix Models, Diecast Legends)
- [ ] Keep only: Anthony's Diecasts, Downies Collectables, Hobbyco

### Priority 3: Re-run Scraper
- [ ] Run improved scraper on all 10 models
- [ ] Verify matches are correct
- [ ] Test on website

## Goal
Once these two things are fixed (filtering wrong products + consistent product matching), we can move to the next phase!

## Files to Work On
- `/app/scraper/scrape-all.ts` - Main scraper file
- `/database-migrations/retailers.sql` - Remove bad retailers
- Supabase `price_history` table - Clean up bad data

## Notes
- Focus on quality over quantity
- Better to have 10 perfect matches than 30 mixed matches
- Test scraper improvements on 1-2 models before running on all 10


cd app
npm run dev