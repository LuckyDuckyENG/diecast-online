# Status Summary — last updated 2026-08-20

> Handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** — it describes
> the scraper-first approach that was abandoned.

## Where things stand

```
cars 406  |  models 543  |  retailer links 1151  |  eBay links 429  |  retailers 48  |  drivers 46
price observations 1572 (1142 retailer + 430 eBay)  |  links stale: 0 of 1580
seasons: 2021 (69) + 2022 (83) + 2023 (98) + 2024 (66) + 2025 (90)     slugs: 406/406
models buyable 502/543   |   images 326/543   |   currencies: AUD, EUR, GBP, USD
retailer links by state: 638 in stock · 45 pre-order · 487 out of stock
models with 2+ retailers 351  |  3+ 192
```

**Read visibility as a share of cars that CAN be visible.** 84 cars have no models
at all — CSV rows with no SKU — so they are invisible by construction.

```
cars visible 312/406  =  97% of the 322 that have models
   2021 48/50 (96%)   2022 67/71 (94%)   2023 82/86 (95%)
   2024 59/59 (100%)  2025 56/56 (100%)
```

**4 visible cars now have no image**, which is new — that line used to read "every
visible car has an image". The LIVECARMODEL sweep made 336 more models buyable, and
visibility is what pulls a car into browse, so images became the lagging half:
**176 of the 502 buyable models have no image.** Nothing is broken (they render the
team-colour panel) but the gap grew rather than shrank.

Live on Vercel at diecasts.app. Migrations 007–017 applied. `next build` clean.
**Submitted to Google Search Console 2026-08-13** — domain verified by DNS,
sitemap accepted, 297 pages discovered, **358 URLs in the sitemap today**.
**eBay Partner Network live** — campaign 5339190001, tracking on all eBay links.

## Pre-order is a third state

`in_stock` is a boolean, so "orderable but not shipping for months" had nowhere to
live and landed as **In Stock**. Shopify reports a pre-order as available, so the
sweep believed it. Migration 014 adds `is_preorder`.

**Pre-order and deposit are different things**, and the wording alone cannot tell
them apart — Anthony's uses "Pre-Order" for deposits, Stone Model for ordinary
full-price stock. Only the price separates them:

```
pre-order wording + price far below peers  ->  a deposit, refused at write time
pre-order wording + a normal price         ->  a real offer, stored and badged
```

The first sweep after this shipped proved why it mattered: **Anthony's held back 27
rows, 25 of them 2025 models at a flat AUD 20 (1:43) or AUD 50 (1:18) deposit.**
Without the guard those would have been the displayed price on the newest season,
and each would have won "cheapest" on its car page.

Pre-orders are excluded from the `from $X` headline — that claim should mean
buyable now — but still shown with their price, badged **blue** (amber already
means eBay) and with the price in the same blue so a skimmed number cannot read as
buy-it-now.

## eBay affiliate — live

EPN campaign `5339190001`, AUD, category *Toys, Hobbies & Games* at **3%**, **1-day
last-click** attribution. Payouts lock 30 days after month end, paid 10 days later
— six to ten weeks from sale to money.

`lib/ebayAffiliate.ts` builds tracked URLs from the stored item id. Inert unless
`EBAY_CAMPAIGN_ID` is set, so clearing that one variable switches tracking off
everywhere. Built from a link EPN's own generator produced, not from documentation;
the `amdata` blob it appends is item-specific and deliberately not reproduced.

`customid` carries the model SKU, so EPN reports say *which model* converted.

A marketplace with no known `mkrid` gets an **untracked** link rather than a guessed
one — a wrong rotation id loses attribution silently, which is worse than none.
Only `EBAY_AU` is confirmed. For US listings, generate one US link in EPN and add it.

`rel="sponsored"` on eBay links only; retailer links are not paid. Disclosure sits
inline on each eBay row, in Terms section 4, and in Privacy.

## Retailer sweep — feed instead of scraping

Shopify shops publish `/products.json`: the whole catalogue as JSON, 250 per
request, with SKU, price, availability and images already structured. Measured on
anthonysdiecasts.com.au — **54 requests, 13,400 products, 60 seconds**. The same
catalogue one product page at a time is 13,400 requests, about four hours, and is
what needed a scraping proxy.

The cost stops scaling with the catalogue and scales only with the number of
retailers, because matching happens in memory against a SKU index. **24 of 48
retailers are now readable** — 23 via Shopify plus LIVECARMODEL via its sitemap.
The other 24 are unchanged: `refresh-prices` still maintains their links and
discovery there stays manual.

One sweep does discovery *and* refresh, since both come from the same download.
Driven from the 🏪 panel: pick a shop → dry run → read it → apply.

**Identity needs no review tier** — the SKU is a structured field the retailer
filled in, not a regex over a listing title. All the risk is on price.

### Guards, every one of them earned

- **Both-sided price outliers.** The eBay guard only looked up, because an
  inflated listing was the failure we'd seen. Sweeping found the mirror image:
  1:18 models at AUD 50.00, which are pre-order *deposits*. Stored as a price one
  wins every "cheapest" sort — the same damage a zero does.
- **A pre-order title alone is not disqualifying.** Anthony's uses "Pre-Order"
  for AUD 50 deposits; Stone Model uses it for ordinary full-price stock, and the
  blanket rule withheld ten good links there. A deposit is now a pre-order title
  **and** a price far below its peers.
- **Currency comes from the rows already stored**, not from the shop. Nothing in
  a feed says what currency it is in: `products.json` carries none, and
  `meta.json` reports the shop's *base* currency, not what it presented to the
  request — Shopify converts by inferred location. Stone Model advertises USD, was
  recorded as CAD, and served numbers matching our stored AUD prices to within 1%.
  Trusting `meta.json` would have inflated every one of its prices by half.
- **A refreshed price moving more than 25% is held.** Real prices drift a few
  percent; that size of jump means the shop changed what it is quoting.
- **Truncation is reported**, never silent.

### Verifying a currency when there is no history

Cross-check shared SKUs against a retailer whose currency is known. Mini Model
Shop reads £77.99 where Anthony's reads AUD 149.99 — ≈AUD 156, so GBP is right.
If it were AUD they would be selling at 58% of everyone else, which isn't
credible. This is by hand today and **should be built into the sweep**: a shop
with no history currently takes its currency from `meta.json` alone, unanchored.

### All 24 sweepable shops have now been run

Retailer links went 199 → 506 in one session, then → 1,151 once LIVECARMODEL was
readable. Current standings:

```
LIVECARMODEL 363 · Anthony's 170 · Stone Model 135 · Mini Model Shop 108
Yuui (NL) 92 · Downies 70 · Notjustcollectibles 43 · Horizondiecast 34
```

One shop now holds **32% of every retailer link**, which is worth watching: if
LIVECARMODEL changes its sitemap path or its JSON-LD, a third of the price data
stops refreshing at once.

**Why the remaining shops return zero**, which is worth as much as the links:

- **Diecast Model Centre, RM Toys, Hobbyco** stock F1 but key it by *internal*
  SKUs (`BB-109672`, `HJ648006SP`). Unmatchable by design, not a bug.
- **Metro Hobbies** *does* use manufacturer SKUs (`18S1004`, `S9409`) but stocks
  only current and forthcoming seasons — RB21, VCARB, a 2026 Cadillac. The one
  link held there by hand, `18S896` from 2023, is no longer in its feed.

That second one is a **category, not a one-off**, and 2025 confirmed it from the
other side. Mini Model Shop, the back-catalogue specialist that supplied 54 links
for 2021, has **zero** 2025 stock. Metro Hobbies, written off as useless across
four seasons, carries 37. They are mirror images, and which shops are worth
sweeping depends entirely on how old the season is.

**Do not sample a feed to decide whether a shop uses manufacturer SKUs.** Judging
from the first 100 products called Horizondiecast and Notjustcollectibles
unmatchable; full sweeps matched 17 and 36. Only the full sweep tells the truth.

### Currency audit, 2026-08-12 — 35 links corrected, 3 deleted

Four non-Shopify shops had wrong currencies, all traceable to one line in
`attachRetailerLink` that guesses from the domain:

```ts
currency: hostname.endsWith('.au') ? 'AUD' : hostname.endsWith('.uk') ? 'GBP' : 'USD'
```

Anything not `.au` or `.uk` becomes USD. `diecastlegends.com` is a UK shop on a
`.com`, so its rows drifted across three currencies over time. **That guess should
be removed** — it manufactures confident metadata from nothing. The sweep already
ignores it in favour of stored rows, but manual link creation still trusts it.

| shop | fixed | effect |
|---|---|---|
| LIVECARMODEL | 17 rows AUD → USD | prices were ~50% understated |
| Diecastlegends | 14 rows → GBP | 4 wrong currency, 10 on a stale 1.9 rate |
| Miniatures-minichamps | 1 row AUD → EUR | |
| Tibormodel | 3 rows **deleted**, 1 → EUR | two priced 0, one AUD 10 for a 1:43 |

**How to settle a currency:** read the product page's Product JSON-LD
(`"priceCurrency"`), which is authoritative. Failing that, compare shared SKUs
against a shop whose currency is known — a shop pricing at 0.4x everyone else is
mislabelled, one at 0.8x is just cheaper.

**Tibormodel's zero prices came from its own pages** — naive extraction reads
`0 €` off them, which is almost certainly how they were created. Its remaining
2 links are unverified; treat that shop as suspect.

### Sweep — still open

- **Foreign shops are not labelled.** Yuui (NL) is a third of AU prices before
  international shipping, and 69 of its links are out of stock today. Out-of-stock
  links can't set the headline price (`carPageData` filters on `inStock`), so this
  is currently harmless — but when a EUR link becomes the cheapest *available*
  option, showing `retailers.region` on the car page stops it misleading.
- **`lib/currency.ts` rates are hardcoded and undated**, and now decide which shop
  looks cheapest across four currencies rather than mostly-AUD.
- **Shopify caps `products.json` pagination** around 25,000 products, so the very
  largest shops can't be read in full. Reported as `truncated`, never silent.

### LIVECARMODEL — built and swept, 2026-08-17 (`lib/sitemapFeed.ts`, commit fc9c094)

BigCommerce, no bulk feed: `/products.json`, WooCommerce and PrestaShop endpoints
all 404. But `/xmlsitemap.php` is a sitemap index, and that changes the economics.

```
1. sitemap index -> product sitemaps -> 65,263 URLs          8 requests
2. slug prefilter against our models                         528 candidates, 5.7s, no network
3. fetch only the candidates, read Product JSON-LD           536 requests, 237s
4. confirm by the page's real SKU, then existing guards apply
```

**Result: 336 new links, 2 refreshed, 18 unchanged, 2 held for review, 0 rejected.**
27 → 363 rows for this shop. Verified live on diecasts.app afterwards.

**The SKU confirmation is the whole design, and it earned its place**: 497 pages were
read and only 358 matched, so the page's own SKU rejected **139 slugs that looked
right**. The case that motivated it — a slug reading "minichamps 2024 mercedes w15
george russell" whose page said `410240163`, one digit from our `410241163` — stayed
rejected while the correct page was found and linked.

`fetchSitemapFeed` returns the same shape as `fetchShopifyFeed`, so matching, the
price guards, the currency anchor and pre-order detection all work unchanged.
**Adding a shop is one line in `SITEMAP_SHOPS`** — miniatures-minichamps,
tibormodel and dc.kyosho are candidates, and 24 retailers are still manual.

Both sides normalise identically or nothing matches — the first attempt scored 0
because slugs were flattened to spaces while the query kept `1-18`, and country
adjectives were folded on one side only.

**Two things learned building it:**

- **Sequential was too slow to finish.** 528 candidates 250ms apart is 6.2 minutes,
  past the route's 300s ceiling, so the sweep died before writing anything. Reading
  three pages at a time brings it to 237s — but that is only ~60s of headroom, and an
  *apply* run re-fetches the feed and then writes ~338 rows one at a time, which
  exceeds 300s. **Apply runs work locally (dev does not enforce `maxDuration`) but
  would time out on Vercel.** Batch the writes before running this from production.
- **A politeness delay placed after an early `continue` is not a delay.** Pages that
  parsed to nothing were fetched with no gap at all — fastest exactly where we were
  getting no value.

## eBay — the secondary market layer

The insight driving this: *the less likely a model is to be in a shop, the more likely
it is on eBay.* Most of the 79 models with no retailer are discontinued 2023 cars, which
is exactly what the secondary market covers. eBay is presented as a secondary market,
never as a shop price — a discontinued model trades above its original retail.

**Batch search** — `/api/admin/batch-ebay-search`, driven from the panel above
Refresh All. Scope is season, season+team, or all. **Always dry-run first**; the plan is
exactly what a live run does.

Models sharing a chassis and manufacturer are served by **one broad search**
("Minichamps RB19"), and matching assigns listings to models locally. 245 per-model
searches collapse to ~28. Scale is deliberately *not* in the query — titles write it
`1:43`, `1/43`, `1.43` — `preJudge` rejects on scale per model instead, which also lets
both scales share one search. The pool is **paged** to the full result set.

**Only a SKU printed in the title auto-links.** Inside a group every model shares
chassis, scale, year and manufacturer and differs *only by race*, so the checks that
make `preJudge` safe discriminate nothing there. A match decided on race name alone is
reported for review and never writes itself — a wrong link made that way looks
identical to a right one.

**Price guard on first write.** `refresh-prices` compares against the stored price; a
first write has no such anchor. Anything more than 3× the median for that car at that
scale — drawn from retailer prices and existing eBay links, *not* from the current run —
is demoted to review.

First real run: 2023 Red Bull, 25 models, 2 searches, 22 linked.

### Forecast for the remaining 223 models

Full dry run of every scope, 34 seconds, no writes:

```
127 auto-link  /  22 review  /  74 no match

Minichamps  143 ->  66 / 14 / 63
Looksmart    43 ->  32 /  3 /  8
Spark        37 ->  29 /  5 /  3
```

Roughly 20 minutes of clicking takes eBay coverage from 24 to ~150 models.
Reproduce with `{all: true, dryRun: true, recheckAfterDays: 0}`.

Minichamps trailing at 46% is partly genuine — they made far more models than AU
eBay carries — but a bug hid in exactly that signal once already, so it is worth
re-checking rather than assumed.

### Measured 2026-08-17 — expiry is not the problem, one-listing-per-model is

Checked 77 of the 382 links against the Browse API, sampled evenly by age:

```
alive 77 · dead 0 · errors 0            links are 1-10 days old, median 6
buyingOptions: FIXED_PRICE x58 · FIXED_PRICE+BEST_OFFER x6 · auctions x0
```

**Zero dead, and structurally so.** There are no auctions at all, and fixed-price
eBay listings are mostly Good-'Til-Cancelled, so they renew rather than expire.
Expiry checking was ranked first for two sessions on an assumption that measurement
does not support. **Re-measure at 40+ days before building it.**

Price drift looked alarming — 36 of 64 changed — until the magnitude was checked:
**median 0.2%, p90 1.6%, 33 of 36 under 2%.** That is eBay's daily currency
conversion on listings priced in USD/GBP, not sellers repricing. Only two moved for
real (−20%, and −10% on a BEST_OFFER). **A refresh without a threshold would rewrite
nearly every row with meaningless changes and make `last_updated` meaningless.**

**The real defect is showing one listing.** Of 52 models where 2+ listings exist and
we already hold a link, **34 have a cheaper listing than the one we display**:

```
417231001   showing 426.45   cheapest 124.87   -71%   (3 listings)
110230163   showing 297.61   cheapest 172.45   -42%   (5 listings)
110230101   showing 410.40   cheapest 256.14   -38%   (2 listings)
417230863   showing 194.62   cheapest 152.60   -22%   (2 listings)
LSF1063     showing 831.78   cheapest 660.81   -21%   (2 listings)
```

Median gap is **under 1%** — usually we already show the cheapest — but roughly
**1 in 8 is overstated by 20%+**. Probable cause: `akitsushima-models` is the priciest
seller in nearly every group and 426.45 is exactly their price, so the title scorer
prefers them, likely because their titles are the most keyword-complete. **Storing all
listings makes seller-picking irrelevant, which beats tuning the scorer.**

Listings per model run **1 to 6, never more** — so "as many as exist" needs no cap;
the cap belongs in the UI if anywhere. Guards it does need:

- **Dedupe by seller** — `hobbyland.bg` lists the same model twice at 296.89 and 321.56.
- **Store `condition`.** Used listings appear and are often *more* expensive than new
  (255.70 used vs 124.87 new), so this is an honesty issue, not a bargain trap — badge
  it, but the data does not justify excluding used from the lowest-price claim.
- **Do not claim exhaustiveness.** "Minichamps RB19" returned exactly 200 — the pool cap
  — while "Minichamps W14" returned 68. It is "listings we found", not "all on eBay".

### eBay refresh + price observations — built and run, 2026-08-18

Migrations 016 (`availability`, `sold_quantity`, `available_qty` on `ebay_links`)
and 017 (`price_observations`). Route `refresh-ebay`, driven by 🧪 Dry-run eBay /
🔁 Refresh eBay in the admin.

**The reason it was built is not the reason we kept discussing.** Listings do not
rot: 0 of 77 dead one morning, 1 of 54 the same afternoon, ages 231 days median
and 922 max because they are Good-'Til-Cancelled. What bites is that
`STALE_DAYS = 30` and nothing had EVER re-checked an eBay link, so every eBay
price was going to render "Check price on site" between 6 and 16 September.
Retailer links sat at zero stale purely because `refresh-prices` keeps them alive.

First full run over 430 listings:

```
unchanged 416 · price changed 13 · sold out 7 · deleted (gone) 1 · failed 0
history rows 430 · condition/seller backfilled 386 · quarantined 0
```

**416 unchanged is the point, not a failure.** Measured drift is 0.2% median,
1.6% p90, and 33 of 36 changes were under 2% — that is eBay converting USD/GBP
listings at the day's rate, not sellers repricing. `NOISE_THRESHOLD = 0.02` keeps
`last_updated` meaning "it changed" while `last_checked_at` always stamps.

The refresh also **backfilled condition and seller onto 386 rows** that predated
migration 015 and that a re-search could never reach, because the search pool
excludes listings we already hold.

`ebay_links` is now 429 with **0 stale**, and `price_observations` holds 430 rows.

**A dead listing is deleted, and its last price is rescued first.** 404 errorId
11001 is returned for sold, expired AND delisted alike — identical to a fabricated
id — so a vanished listing can never be labelled "Sold". The rescued observation
is stamped with the row's `last_checked_at`, not now: we did read that price, but
we read it then. Verified — exactly one of the 430 observations sits outside the
run's cluster, AUD 170.81 at 11:55 against a run at ~16:00.

**Sold-out-but-still-listed is the one case we can state truthfully**, because it
is readable. 41% of listings are multi-quantity and sell down while staying up. 7
rows are `OUT_OF_STOCK`: badged, price shown, excluded from the cheapest claim,
capped at 3 per model so unbuyable rows cannot crowd out buyable ones.

### Price observations — what the table is and is not

Append-only. One row per successful check including unchanged ones. Means **"we
observed this offer at this price at this time"** — never "it sold for this",
which eBay does not tell us. `price > 0` and `price_aud > 0` are CHECK constraints
rather than conventions, because this feeds min/max and there is no overwrite to
correct a bad row with.

`retailer_id` is `ON DELETE SET NULL` and `ebay_item_id` has no FK at all: both
sources get deleted routinely, and the observation of a price that WAS real should
outlive the thing that had it.

**1,572 rows: 1,142 retailer + 430 eBay**, covering 502 of 543 models. The first
full retailer refresh ran 2026-08-19 — 1,151 checked, 202 prices updated, 940
unchanged, 8 with no price found, 1 quarantined (an Anthony's pre-order page
reading AUD 5000 against a stored 399.99; the 5x guard refused it).

**No source has been observed twice yet**, so there is no trend to draw: eBay was
read on the 17th and retailers on the 18th-19th. A model showing "more than one
observation" today has several SOURCES at one moment, not a series. The time
dimension starts on the second run of each job. There is nothing worth displaying until several
observations exist per model across weeks; a range ("seen between AUD 124 and 426
over 6 months") is most of the value and needs no new UI concepts.

### eBay — not done

- **Review queue** for the `event-driver` tier and a "recently auto-added" view
  (`auto_linked` is recorded for exactly this).
- **Scheduling.** The staleness cliff recurs every 30 days forever, so a button
  means remembering it monthly for the life of the site. Cron once it has proven
  itself over a few manual runs.
- **Displaying history.** Deliberately deferred — see above.
- The 22 linked before paging came from a partial pool: correct, but a cheaper listing
  may have existed on page two. The matcher takes the cheapest it *saw*.
- Remaining 19 scopes not yet run. Expect thinner results for Alpine, Haas, Williams —
  less AU secondary-market presence.

## Key rotation — done, 2026-08-13

`.env.local` was committed in the initial commit and pushed to a **public** repo,
exposing the `service_role` key plus eBay and Exa credentials. Both Supabase keys
are now the new format and **the legacy JWTs are disabled**:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY   sb_publishable_…   reads ok, writes blocked by RLS
SUPABASE_SERVICE_ROLE_KEY       sb_secret_…        admin routes ok
leaked legacy JWT               rejected           verified dead
```

Order matters if this is ever repeated: new key into `.env.local` **and** Vercel →
redeploy → confirm `/browse` loads → *then* disable legacy. Reversing the last two
blanks the live site. Disabling took ~40 seconds to propagate.

The eBay and Exa credentials in that commit have **not** been rotated. They are
lower-value than a database key, but they are still in the repo history.

## SEO — done

The whole public site was client-rendered, so crawlers received HTML containing none
of its content, all 164 cars shared one `<title>`, URLs were UUIDs, and there was not
one crawlable link between pages.

| | Before | After |
|---|---|---|
| Content in car page HTML | none | full |
| Unique titles | 1 | 188 (164 cars + 24 hubs) |
| Links to cars from /browse | 0 | 96 |
| Links between car pages | 0 | ~16 each |
| Indexable driver/team pages | 0 | 24 |
| Sitemap URLs | 0 | 127 |
| Prerendered pages | 41 | 231 |

**Readable URLs** — `cars.slug`, unique index, built from season + team + chassis +
driver + event. Routing accepts slug *or* UUID against the stored column, so old links
never break. Set at creation, not backfilled.

**Server rendering** — car and browse pages. Data in `lib/carPageData.ts` and
`lib/browseData.ts`, using the **anon key** (RLS allows SELECT only, so a page bug
can't write). Interactive filters stay client-side on props. `generateStaticParams`
prerenders; `revalidate = 3600`.

**Per-page metadata** — title, description built from that car's own manufacturers,
scales and cheapest price, canonical, Open Graph.

**Internal linking** — related cars along four relationships (same chassis, same race,
same driver other seasons, same team+season as fallback). Only cars with a retailer are
suggested: a third of links previously landed on "no retailers found". Car pages also
link *up* to their hubs, and the breadcrumb team link points at the hub rather than a
`?team=` filter.

**Hub pages** — `/drivers/[slug]`, `/teams/[slug]`, `/seasons/[year]`. 13 + 9 + 2 = 24.
Only subjects with ≥ `MIN_CARS_FOR_HUB` (3) buyable cars qualify; the rest 404 rather
than being thin. Each carries a data-generated summary, not just a grid. These target
"Max Verstappen diecast" — previously unservable, since filters produced unindexable
`?driver=` URLs.

**Discovery** — `sitemap.ts` and `robots.ts` generated from the database. Only cars with
a retailer are submitted (96 of 164). `/admin`, `/api/`, `/search` disallowed.

## SEO — not done

- **Structured data** (Product/Offer JSON-LD) — the last meaningful code item. Must be
  gated on the freshness rules so a stale or out-of-stock price is never marked up.
- **Home page** still client-rendered. Low value; it's a brand page, not a search target.

## Known soft spots

- **176 of 502 buyable models have no image, and 4 visible cars have none at all.**
  This got worse, not better: the LIVECARMODEL sweep made 336 more models buyable, and
  a retailer link is what pulls a car into browse. Missing images render the
  team-colour panel rather than a broken image, so it degrades rather than breaks.
- **~26 uncommitted files** still sit in the tree: scraper `.ts` one-offs,
  `diecast-site-homepage-fixes/`, `f1_2022_models_by_team.csv`, and two `_*.mjs`
  scratch scripts. Decide whether they belong in the repo or in `.gitignore`.
- **Currency rates hardcoded and undated** (`lib/currency.ts`). They decide which
  retailer looks cheapest.
- **Duplicate retailer rows**: `Miniatures-minichamps` (AU/AUD) and `Miniatures Minichamps`
  (US/USD) are one EU shop. Also a junk retailer named `Dc`. `110242101` is labelled AUD
  on a EUR shop.
- **6 junk rows in `teams`** with 0 cars. `pickTeam()` ranks by car count so they can't
  win a lookup, but they still pollute hub slugs.
- **`cars.driver_id` / `cars.event_name` are nullable**, so the composite UNIQUE doesn't
  block a NULL-keyed duplicate. Guarded in application code only.
- **10 cars have models but no link at all** (down from 68) — excluded from browse,
  sitemap and related links, reachable only by direct URL. Reverses automatically when
  one gets a link. The other 84 invisible cars have no models to link.
- A few hub slugs fall back to the long form (`/teams/haas-f1-team`).
- **59 models have `event_name = "Season"`** — a legitimate category (generic
  season/launch-livery cars), not a data error. They can't use event matching, so eBay
  matching for them rests entirely on the SKU tier. They also read "at the Season" in
  descriptions.

## Traps worth remembering

- **`tsc --noEmit` is not the deploy gate.** `next build` type-checks unreachable code
  too; a type error after an early `return` failed a deploy.
- **Never run `npm run build` while the dev server is running.** The production build
  writes to `.next/` while dev serves `.next/dev/`; the collision breaks route
  registration — every `/api/*` 404s with an HTML page while pages still render. Fix:
  stop the server, `rm -rf .next`, restart. This caught us three times.
- **Module-scope API clients turn optional env vars into hard build dependencies.**
  `new Exa(process.env.EXA_API_KEY)` at module scope failed the entire deploy because
  the key wasn't set on Vercel. Construct per request.
- **Admin fetches must pass `cache: 'no-store'`.** A saved eBay link kept showing as
  "Not linked" while the API returned it — the browser was reusing an older response.
  The admin page fetches `get-f1-data` from **16** places; all now say `no-store`.
  `export const dynamic = 'force-dynamic'` controls *server* caching and does **not**
  add a response header, so it does not fix this on its own.
- **An untyped API response hides missing fields.** `DiecastModel` declared
  `driver: string`, but `get-f1-data` used the driver name only as a grouping key and
  never put it on the model. Every eBay search ran without a driver name, and nothing
  complained because the response was `any`.
- **A silent cap reads as a complete answer.** The eBay pool limit of 50 returned
  exactly 50 twice — a truncation, not a result. Always report when more was available.
- **PostgREST caps a plain `.select()` at 1000 rows.** No error, no flag, just a
  shorter array — so it is invisible at the call site and stays invisible until
  someone counts. `price_history` crossed 1000 on the LIVECARMODEL sweep (1,151) and
  silently broke three things at once: `sitemap.ts` decided which cars were worth
  indexing from a truncated set, the batch eBay search anchored its price-outlier
  guard on one, and the sweep route built its existing-link map from one. Every
  failure was quiet and in the unsafe direction. Use `lib/selectAll.ts` for any read
  not scoped by `.eq()` to a handful of rows. **`ebay_links` is at 382 and will cross
  1000 the moment multiple listings per model ship** — that read is already paged.
  A result of *exactly* 1000 should be treated as truncated until proven otherwise.
- **Ask the database for its own schema instead of guessing.** Migration 015 burned
  three attempts on catalog details (`attname` is `name` not `text`; `indkey` is an
  int2vector, not an array) and `models`/`cars` are created outside this migrations
  directory so the files cannot tell you their column types. PostgREST answers it
  directly: `GET /rest/v1/` with `Accept: application/openapi+json` returns every
  column with its format. That settled `models.id = uuid` in one request.
- **Order matters when one step destroys what another must save.** The eBay refresh
  deletes a dead listing and preserves its last price as history. Batching that
  insert to the end of the loop — which is right for every other observation — would
  have put it AFTER the delete, so a failed insert would lose the only record of the
  price. It is written per-listing before the delete, and the row is KEPT if the
  rescue fails. Found by testing the 404 path against a throwaway listing and
  noticing zero observations came out of it.
- **`=` where `+=` was meant hides work that actually happened.** The same refresh
  reported "0 history rows" on a run that wrote one, because the end-of-loop count
  assigned over what the dead-listing branch had already added. The data was right
  and the number on screen was not, which is the harder kind to notice.
- **A count is only meaningful against a matching denominator.** Making the matcher
  emit several listings per model turned a panel label into "30/19 matched" — the
  numerator had become listings while the denominator stayed models. Guarded against
  it in the totals and then missed it one component away.
- **The 1000-row cap hides in worklists, not just in counts.** Found in SEVEN
  places over two days, and the dangerous ones were never the displayed numbers:
  the sitemap's page list, the sweep's existing-link map, and `refresh-prices`
  plan mode, which returned exactly 1000 of 1,151 links so a full refresh would
  have skipped 151 silently — no refresh, no history row, nothing on screen. Caught
  by noticing "total links to refresh: 1000", a suspiciously round number. Treat
  any unpaged select that feeds a LIST OF WORK as suspect, not just ones that
  feed a total.
- **An audit script is code too.** The first read of the post-sweep numbers reported
  "1000 retailer links" — the cap, not a total — which made a fully successful
  338-row sweep look half-failed and produced wrong coverage figures. Page the
  queries in throwaway scripts, not just in the app.
- **A guard whose reference comes from the current batch weakens as the batch shrinks.**
  The price outlier check held back AUD 1293.40 on a 25-model run and passed the same
  listing on a 3-model re-run, because the sample fell below its minimum. Anchor
  guards to stored data, not to the run.
- **Display normalisation breaks scope filters.** The admin shows "Red Bull" for
  "Red Bull Racing", so an exact-match filter selected nothing — and reported it as
  "nothing to search", which reads as *done* rather than *matched nothing*. Use
  `teamMatches()`, and make empty results say which kind of empty they are.

## 2026 — a season built from shop feeds, not a CSV

`app/scripts/build-season-csv.mjs` (commit b85b114). Run:

```
node scripts/build-season-csv.mjs --year 2026
```

**Why this exists.** The catalogue is imported from hand-built CSVs, which works
for a finished season and not for the current one — 2026 is two-thirds run,
models release continuously, and there is no settled list to transcribe. The
shops are the live record, and a sweep already downloads them: it matches on SKU
and discards the rest, and for 2026 that discarded remainder IS the season.
164 F1 products at Anthony's, 179 at Downies, 60 at Stone Model.

**It writes a CSV, never the database.** Everywhere else a bad match produces a
wrong price on a real car — visible and fixable. Here it would invent a car that
never existed, which then attracts its own eBay links and retailer rows and looks
legitimate forever. The CSV puts a person in between and reuses sync-csv.js.

**Two passes, not one regex per shop.** Anthony's format is rigid, so parse it
strictly to learn the season's vocabulary (11 chassis + teams, 22 drivers,
events), then recognise those fields in any shop's title regardless of word
order. The vocabulary doubles as a fence: a grid is 11 teams of two, so anything
outside it is self-evidently wrong. That is why 2026 was chosen first and why the
1990s would not have been.

**Current output: 65 rows, every team with exactly two drivers, 9 cross-confirmed
by two shops agreeing on a SKU.**

### NOT yet imported — what 2026 still needs

1. **Reference rows sync-csv.js will not create.** It looks up season, team and
   driver and SKIPS the row if any is missing. Create: **season 2026**, teams
   **Audi** and **Cadillac**, driver **Arvid Lindblad**. Everything else mapped
   onto existing names.
2. **Read the CSV.** `verification_status` marks 9 rows CONFIRMED and 56 SINGLE
   SOURCE. Then `node sync-csv.js ../f1_2026_models_by_team.csv --dry-run`.
3. **Spot-check five or six rows against the actual product pages.** Nothing has
   been verified against an independent source yet. A coherent grid rules out
   STRUCTURAL error, not a wrong event-to-SKU pairing.
4. **328 titles matched no fields.** High. Likely Downies/Stone phrasing events
   in ways the vocabulary never learned from Anthony's, so probably recoverable
   rather than out of scope. Worth checking before treating 65 as all of 2026.

### Lessons from building it

- **A structural invariant catches what the matcher cannot.** Chassis were
  matched by substring, and Aston Martin's AMR26 contains Audi's R26 — so every
  Aston Martin product became an Audi one and **Audi finished with four
  drivers**. Nothing in the matcher could complain. A two-driver team is what
  made it visible. Now matched as whole tokens, hyphens folded first so "SF-26"
  stays one token.
- **Canonicalise names as the vocabulary is LEARNED, not after.** Fold later and
  it already contains both "Japan GP" and "Japanese GP", so the same race yields
  two different cars depending which shop listed it. Also "HAAS" finds no team
  and drops the row; "Charles LeClerc" creates a second person.
- **eBay is the wrong verifier for a current season.** 2026 models are unshipped
  pre-orders with no secondary market, and five-character Spark SKUs like `S9367`
  collide with sewing patterns and revenue stamps. Cross-shop agreement is the
  only independent check available here.
- **Do not hammer the feeds.** Five full catalogue downloads in ten minutes
  earned an HTTP 429 across four shops, and the empty responses got cached and
  read as authoritative. The script now refuses to cache an empty feed and says
  so loudly.

## Next up

1. **Apply the remaining eBay scopes.** Only 2023 Red Bull has been run under the
   multiple-listings matcher, which is why just 21 models hold more than one
   listing. 2021, 2022, 2024 and 2025 are still one-listing-per-model and carry
   the 1-in-8 overstatement. Panel sends `recheckAfterDays: 0`, so already-linked
   models are re-searched rather than skipped.
2. **Run Refresh All Retailers once** — it now records observations, so this is
   what starts the retailer half of the price history (1,151 links against eBay's
   429). Nothing else is needed; the insert is already wired in.
3. **Batch the sweep's writes** before running any sweep from the deployed admin.
   ~338 sequential `attachRetailerLink` calls, each doing two selects and a write,
   push an apply run past `maxDuration = 300`. Fine locally, times out on Vercel.
4. **Images are the lagging half now.** 176 of 502 buyable models have none, and 4
   visible cars have none at all — the first time that has been non-zero. Sweeping
   makes models visible faster than images get added.
5. **Remove the TLD currency guess** in `attachRetailerLink` — it caused every
   problem in the currency audit.
6. **8 retailer links whose URL states a different scale than the model** — see Data
   findings. Splits into wrong links and wrong catalogue scale; do not blind-fix.
7. **2020**, if you want another season. Retail coverage will be thin: back-catalogue
   specialists only, so it leans on eBay the way 2021 did.
8. **eBay listing decay** — handled by the refresh, and slower than assumed
   (1 dead in the first full pass of 430). Nothing to do; noted so the next person
   does not rebuild it.
9. More sitemap shops — one line each in `SITEMAP_SHOPS`: miniatures-minichamps,
   tibormodel, dc.kyosho. 24 retailers are still manual.
10. Review queue for the eBay `event-driver` tier, and a "recently auto-added" view.
11. Structured data (Product/Offer JSON-LD), gated on the freshness rules.
12. Rotate the eBay and Exa credentials still sitting in the repo history.

## Data findings worth acting on

- **`18S986`** is stored as *Australian GP*; Anthony's and an eBay listing both call
  it **Miami GP** ("1st Win"), which is the race Norris actually won first. Two
  independent sources against one record.
- **`417220101`** is flagged SKU CONFLICT in the 2022 CSV — one retailer attributes it
  to Bahrain, another to Saudi Arabia. Imported as Bahrain. Anthony's stocks it; their
  product title is a third opinion.
- **`417240124`** is recorded 1:18, but the `417` prefix means 1:43 in **57 of 58**
  cases. Bottas's equivalent pair is `117240177` (1:18) + `417240177` (1:43).
- **`127242444`** priced AUD 1074 at Horizondiecast against AUD 292 for `110242444`,
  the same car and scale at the same shop. May be a genuine limited edition.
- **Two retailer rows for one shop**: `Miniatures-minichamps` (8 links) and
  `Miniatures Minichamps` (1). No model is linked at both yet, so it is currently
  harmless, and neither is Shopify so no sweep can worsen it.
- Prefixes are **systematic, not noise**: `110`/`117` are both 1:18 lines, `417`/`410`
  both 1:43, and `112` is a two-car set. Do not treat one-character SKU differences as
  typos — `110231801` and `112231801` are a single car and a two-car set.
- **8 of 752 retailer links state a scale in the URL that disagrees with the model.**
  Found 2026-08-17. It splits two ways and must not be blind-fixed:
  ```
  417239947  model 1:43  url 1:18   LIVECARMODEL      link wrong (417 = 1:43)
  LS18F1046  model 1:18  url 1:43   Stone Model       link wrong (LS18 = 1:18)
  S9550      model 1:43  url 1:18   Horizondiecast    link wrong
  S9561      model 1:43  url 1:18   Horizondiecast    link wrong
  537255604  model 1:18  url 1:43   Downies           CATALOGUE likely wrong (537 = 1:43)
  LS64025    model 1:43  url 1:64   Anthony's / AGR / Horizondiecast  -- 3 shops agree
  ```
  `LS64025` is called 1:64 by **three independent shops** against our 1:43, so there
  the catalogue is probably wrong, not the links. `417239947` is confirmed the other
  way: the 1:43 page's own JSON-LD says `417239947` at USD 109.95, while our row
  points at the 1:18 page and shows its USD 259.95 price.
- **`preserveExistingUrl` + a wrong stored URL is a silent trap.** The sweep updates
  price while keeping a hand-picked link, so a row can end up with one page's price
  and another page's URL. `417239947` was only caught because the gap was −58% and
  tripped the review threshold; a 1:18/1:43 mismatch with a small price gap would pass
  silently. Review items are `write: false`, so the sweep correctly declined to touch it.

## Architecture

A car IS the tuple **season + team + chassis + driver + event**, with
`UNIQUE(season_id, team_id, chassis_name, driver_id, event_name)`. Driver and event live
on the car, never on the model. Models cascade-delete with their car.

Retailer links live in `price_history`, keyed by `model_id`, **one current row per
(model, retailer)** — enforced by a unique constraint. Current state, not an append log:
refresh overwrites in place, so there's no price history and no undo. `last_checked_at`
is stamped only on a successful check *and* when a link is added by hand, so unreadable
links age visibly. Prices older than 30 days stop being quoted; the retailer link stays.

RLS is on. anon/authenticated get SELECT on the nine tables the public site reads and
nothing else; `service_role` bypasses RLS, so admin routes are unaffected.
