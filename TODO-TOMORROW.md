# TODO for Tomorrow

> **Everything below "The July plan" is STALE** — it describes the
> scraper-first approach that was abandoned. The live handoff doc is
> `STATUS-SUMMARY.md`. This file is kept for the commands at the top.

## Everyday

```
git push origin main

cd app
npm run dev
```

**Visit the live site without polluting your own analytics:**

```
https://diecasts.app/?notme=1     arm it  (once per browser, persists)
https://diecasts.app/?notme=0     turn it back off
```

Per-browser, stored in localStorage as `diecasts:notme`, so **the phone and
the laptop each need arming once** and a fresh incognito window never has it.
79% of real traffic is mobile, so the phone is the one that matters.

It silences `search_queries`, `outbound_clicks` **and Vercel page views**.
This paragraph used to say page views were NOT covered; that stopped being
true when `SiteAnalytics` gained
`beforeSend={event => (isOwnerVisit() ? null : event)}`. Corrected
2026-10-18, after the stale version was used to argue that the visitor count
was inflated by the owner's own browsing. It is not.

**So an unarmed browser is the only leak.** The flag lives in localStorage
per browser, so the phone, the laptop and every fresh incognito window each
need arming separately. 79% of real traffic is mobile, so the phone is the
one that matters.

Search Console is unaffected either way: it counts arrivals from Google's
results page, so typing the URL or using a bookmark never registered there.

See `app/lib/ownerVisit.ts` and `app/app/components/SiteAnalytics.tsx`.

## The retailer sweep

**TWO TERMINALS, AT THE SAME TIME.** The script does not read shops itself,
it drives `/api/admin/sweep-retailer` on a running server. Starting the sweep
in the terminal that was running dev kills dev, and the script then reports
every shop as unreachable.

```
cd app
npm run dev                                 # terminal 1, LEAVE IT RUNNING

cd app                                      # terminal 2, a SECOND window
node scripts/fetch-fx.mjs                   # always first, see below
node scripts/sweep-gaps.mjs --all           # dry run, writes nothing
node scripts/sweep-gaps.mjs --all --apply   # ~3 hours
```

`cd app` matters in both. The scripts live under `app/scripts/` and read
`.env.local` relative to the working directory, so from the repo root you get
`Cannot find module`.

**`fetch-fx.mjs` first, every time.** The sweep writes `price_aud` for
thousands of rows, and `price_aud` is what decides which shop the site calls
cheapest. Whatever rate is current when it runs is the one baked into every
link people click.

**`--all` versus the default.** Gaps-only is the right tool straight after an
import: it looks only for models with no link at that shop and refreshes no
prices. `--all` does both, which is what promotes a model from 2 shops to 3 —
the threshold `/savings` is gated on — and what clears stale prices.

**Not the admin buttons.** "Refresh retailer links" re-reads links you already
have and discovers nothing, so it never promotes anything. "Refresh eBay
listings" is a different dataset entirely and deletes listings that 404.

**Expect some shops not to finish.** On 2026-10-17 the dry run predicted 111
new links, 738 refreshes and 706 review candidates, with four shops unclean:
Miniatures Minichamps, Metro Hobbies and Hobbyco TRUNCATED, and LIVECARMODEL
failing outright with 0 passes. LIVECARMODEL is the biggest shop in the
catalogue by shared models, so it is worth re-running on its own afterwards.

A `FAILED fetch failed` on the first shop or two usually means the dev server
is still compiling the admin route rather than the shop being down.

## Refreshing SPR Models

Not in the retailer sweep, and cannot be: that pipeline narrows a shop's
sitemap by matching model words against the product URL, and SPR's URLs are
bare `product_id=7073` with no slug to match. 494 products is small enough to
read in full instead.

```
cd app
node scripts/spr-fetch.mjs          # ~4 min, re-reads all 494 products
node scripts/spr-import.mjs         # dry run, shows what would change
node scripts/spr-import.mjs --apply
```

**Run it before 13 November.** Prices stop being quoted at 30 days and SPR
holds the cheapest price on 90 models, so it is the worst shop on the roster
to let expire.

The import updates in place, one row per model, so re-running never
duplicates. It refuses to run if `fx_rates` has no AUD to NZD rate rather
than converting on a guess.

## The July plan

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

## to commit a change
git push origin main


cd app
npm run dev