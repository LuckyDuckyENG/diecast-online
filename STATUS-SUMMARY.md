# Status Summary — last updated 2026-09-02

> Handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** — it describes
> the scraper-first approach that was abandoned.

> ## ⏰ THE ONLY THING WITH A DEADLINE
>
> The site refuses to quote a price older than **30 days** (`STALE_DAYS`), so
> prices revert to "Check price on site" unless something re-checks them.
>
> ```
> retailer prices: first go stale 2026-08-28 · half by 2026-09-17
> eBay prices    : first go stale 2026-09-16 · half by 2026-09-24
> ```
>
> **Around mid-September, run 🔄 Refresh All Retailers and 🔁 Refresh eBay.**
> About an hour each, from localhost. Nothing breaks if they are late — prices
> stop being displayed, links stay, and a refresh brings them all back. This is
> the one job that cannot be deferred indefinitely.

## Where things stand

```
cars 736  |  models 1645  |  retailer links 3062  |  eBay links 1430  |  retailers 48  |  drivers 48
price observations 1572 (1142 retailer + 430 eBay)
seasons: 2020 (79) + 2021 (69) + 2022 (83) + 2023 (98) + 2024 (66) + 2025 (90) + 2026 (83)
slugs 568/568   |   models buyable 760/865   |   images 722/865
retailer links by state: 881 in stock · 78 pre-order · 803 out of stock
models with 2+ retailers 535  |  3+ 292
eBay: 382 models carry several listings · 82 still on one
```

**Read visibility as a share of cars that CAN be visible.** 86 cars have no models
at all — CSV rows with no SKU — so they are invisible by construction.

```
cars visible 445/568  =  92% of the 482 that have models
   2020 47/78   2021 49/50   2022 67/71   2023 85/86
   2024 59/59   2025 56/56   2026 82/82
```

2020 is the outlier at 47/78 and correctly so: shops barely stock that era, so
31 of its cars are carried by eBay or nothing at all.

**Images: 722/865, with only 42 buyable models still lacking one.** Sweeps fill a
missing image from the shop's own photo and never overwrite one already set —
demonstrated: shop A writes, shop B is skipped, A's photo survives. The guard is
`.is('image_url', null)` as a condition on the UPDATE, so concurrent sweeps
cannot race through it. Placeholders are refused (`Image_Placeholders_F1_<uuid>`).

**Where a model has no image but an eBay listing does, the photo is applied BY
HAND, deliberately** — 43 models are in that position. An eBay image is a photograph of one seller's actual item —
sometimes boxed, used, or on a kitchen table — where a retailer feed image is a
product shot. Since first-write is permanent, auto-applying one would block a
clean retailer photo forever. The per-listing picker shows a thumbnail beside
each 📸 so the choice is made on sight.

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

### Every season re-run under the multiple-listings matcher — 2026-08-24

```
eBay links            429 -> 1430
models on ONE listing 365 ->   82
models with several   ~40 ->  382
```

**Across those 382 models the cheapest listing is on average 39% below the
dearest.** That is what showing one arbitrary listing was costing — not the odd
outlier like the 426-against-125 case that started this, but a systematic 39%
gap. It is the single clearest measure of why this work was worth doing.

2026 is deliberately at zero: unreleased pre-orders have no secondary market.
Searching its SKUs returned coincidental matches on sewing patterns and revenue
stamps, nothing else. Revisit once the cars ship.

Per season: 2020 53/35 · 2021 66/56 · 2022 108/99 · 2023 109/90 · 2024 68/54 ·
2025 60/48 (linked / with several).

**2025 was silently missed on the first pass** and showed 56 linked with ZERO
multiples while every other season had plenty — that shape is the tell if a
scope ever fails to take.

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
  stop the server, `rm -rf .next`, restart. This caught us FOUR times, and is now
  guarded: `predev` removes `.next/` only when it contains a production build,
  identified by the `BUILD_ID` file that `next build` writes and `next dev` does
  not. A blanket `rimraf .next` was the obvious fix and the wrong one — it throws
  away the incremental compile cache on every start, a daily cost to prevent an
  occasional mistake.
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
- **A bootstrap makes one source's quirks into the standard.** The season CSV
  generator learns its vocabulary from the single most structured shop, so
  Anthony's "W17E" became canonical over Downies' and Stone's "W17" (61 votes to
  16) AND over the site's own five-season convention of W12..W16. Worse, it then
  failed to MATCH the W17 titles, so most of the Mercedes season vanished as "no
  chassis found" — indistinguishable from "not an F1 car". Where several sources
  exist, let them vote on the output rather than trusting the one you parsed first.
- **A structural invariant catches what a matcher cannot report.** Both of that
  generator's worst bugs were invisible to it and obvious to a human glance: Audi
  with four drivers (substring collision, AMR26 contains R26) and Mercedes with 3
  cars against McLaren's 13. A grid is 11 teams of two. Keep a shape you can check.
- **Hardcoded year ranges rot silently.** The admin's season buttons were
  `2025 - i` for 31 years, so 79 imported 2026 cars existed in the database and
  could not be selected. Derive from the data plus next calendar year — models go
  on sale months before a season starts.
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

**Imported 2026-08-21: 83 cars, 187 models, 0 errors, no duplicates.**
118 CSV rows, 66 cross-confirmed by two shops agreeing on a SKU. Swept for prices
the same day — Downies 178 links, Stone Model 33 — so 180 of 187 models are priced
and every 2026 car is visible.

Reference rows had to be created by hand first: sync-csv.js LOOKS UP season, team,
driver and manufacturer and silently skips the row if any is missing. 2026, Audi
and Cadillac and Arvid Lindblad did not exist. A "Racing Bulls" team was created
too and then deleted — sync-csv.js deliberately maps it onto the existing `RB` row,
which is what keeps a renamed team's cars on one hub page across seasons (see the
teamMappings table in that file: Ferrari -> Scuderia Ferrari works the same way).

### What it took to get from 65 rows to 118

Three separate causes, found by investigating the skipped titles BEFORE importing
rather than importing and topping up later:

- **The alias table was built and never consulted.** Events were canonicalised when
  learned — "Barcelona GP" stored as "Spanish GP" — but extraction searched titles
  for the tokens of the CANONICAL name. No title says "Spanish GP". Now stores
  { spelling, canonical }: match what the shop wrote, write what the catalogue says.
- **Chassis codes with internal spaces never matched.** Anthony's writes VCARB-03,
  Downies writes VCARB 03; hyphens fold away but spaces split.
- **The largest loss was one step further down.** Downies titles name no
  manufacturer at all, so its products were matched CORRECTLY and then discarded
  for having no maker. Manufacturer now falls back to the SKU prefix, which is
  better evidence than a title anyway.

### The bug worth remembering: W17E

Mercedes came out of the first import with 3 cars against McLaren's 13, which is
not a plausible shape for a season. The vocabulary bootstraps from ONE shop, so
that shop's idiosyncrasies become the standard: Anthony's writes W17E where Downies
(x44) and Stone (x22) write W17, and the catalogue's own convention across five
seasons is W12, W13, W14, W15, W16.

It did not merely look wrong. **W17E never MATCHED the titles saying W17**, so most
of the Mercedes season was skipped as "no chassis found" — which is
indistinguishable from "not an F1 car". A whole team went missing without a warning.

Now: a trailing letter directly after a digit is treated as the same chassis
(narrow, so SF26/VCARB03/AMR26/MAC26 are untouched), and every shop votes on the
spelling that gets written. chassis_name goes into the slug, so this is the
difference between /cars/2026-mercedes-w17-... and a URL breaking the pattern of
every other season.

### Still open on 2026

- **113 titles still match nothing**, down from 328. Diminishing, but not zero.
- **7 of 187 models have no retailer link.**
- **Zero images.** See Next up — this is the biggest single gap.
- Anthony's and Horizondiecast not swept. Low value: Anthony's 2026 stock is
  entirely AUD 20/50 deposits the guard will refuse, Horizondiecast had 13 products.

## 2020 — hand research beat feed discovery 7 to 1

**2020 is in: 79 cars, 135 models**, from a hand-researched CSV. The feed
generator managed 11. That is the headline finding and it qualifies everything
below: *feed discovery* dies below 2021, but the CSV pipeline does not — a
researched season imports exactly as well as it ever did.

The hand-built file also got right what the generator got wrong. "Mercedes /
George Russell / Sakhir GP" is the correct race for his single 2020 Mercedes
drive; the generator filed it as "Season" because the shop titles never named it.

### Checking a 92-row hand-built CSV before import

Worth repeating on any researched season, because two of the four checks found
something:

- **SKU collisions against the catalogue.** One row carried `537224304` for a
  2020 Sainz car — already held for **2022 MCL36 Norris Bahrain GP**. Two models
  sharing one SKU means every sweep and eBay search links the same product to
  both cars. Cleared the SKU, kept the car (Sainz really did finish 2nd at Monza).
- **The year embedded in a Minichamps SKU.** Positions 4-5 are the season, so
  every Minichamps SKU self-checks: `537`**`22`**`4304` fails against 2020. All 55
  others agreed. Free validation, no lookup needed.
- **Duplicate SKUs inside the file** — none.
- **Rows with no SKU at all** — 15. `sync-csv.js` creates the car and no models,
  and a car with no models contributes nothing to `driverGroups`, so it is
  invisible in the admin, browse AND the sitemap. Held in
  `f1_2020_HOLD_no_sku.csv` until a SKU turns up.

**28 of 92 rows carried pattern-derived SKUs** (`round + driver number`, never
seen in a listing) — the same convention the 2022 CSV uses. That is acceptable
because a wrong SKU usually matches nothing, which is harmless. The dangerous
case is a wrong SKU that is real for ANOTHER car, and that is exactly what the
collision check exists to catch.

### Reference rows a 2020 import needs

Teams that stopped existing: **Racing Point** (became Aston Martin) and
**Renault** (became Alpine). Drivers never carried before: **Robert Kubica**,
**Romain Grosjean**, **Pietro Fittipaldi** (who substituted for Grosjean after
Bahrain). And multi-driver rows must use the catalogue's `+` convention —
"Hamilton/Bottas" resolves to nothing, "Lewis Hamilton + Valtteri Bottas" works.

## Feed-based discovery dies below 2021 — measured 2026-08-22

Attempted 2020 with the season CSV generator. It produced **21 rows across 6
teams, several with one driver, and ZERO cross-confirmed** — against 2026's 118
rows, 11 teams of two, 66 cross-confirmed.

**11 of the 21 were imported** (14 models), after checking all 21 by hand —
feasible precisely because there were only 21. Every imported row names a real
race and matches what the shops say. The other 10 are parked in
`f1_2020_HOLD_season_rows.csv`, all with `event_name = Season`, because that is
where the risk turned out to be concentrated: the "no race named -> Season"
fallback filed specific race cars as season models. Two are provably wrong from
their own SKUs — `M6052-BAH-RUS` is Russell's Sakhir car (Bahrain, his only 2020
Mercedes drive) and `M6052-TUR-HAM` is Hamilton's Turkish GP title-clincher.
Minichamps encodes it too: `413200444` is round 04 / car #44, and round 4 was the
British GP, which is what that row says. Those ten need a person, not a matcher.

The method was not the problem; the stock is. F1 products per season across all
seven readable shops:

```
2022 625 · 2021 393 · 2020 136 · 2019 73 · 2018 47 · 2014 38 · 2010 32
2005  25 · 2000  53 · 1995 51
```

**The cliff is 2021 -> 2020, a 65% drop in one year.** Below that it flattens —
and note it is NOT a decay curve: 2000 (53) and 1995 (51) beat 2005 (25) and
2010 (32). Older is not scarcer, LESS ICONIC is scarcer. Senna and
Schumacher-era cars get reissued; a 2005 Toyota does not. So "work backwards
year by year" is the wrong strategy; go by era if you go at all.

**The structural limit: the eBay pipeline cannot DISCOVER.** It searches by SKU,
so a model must already exist in the catalogue. For old seasons eBay is where the
models are, and it has no way to tell us they exist. Feed discovery covers
roughly 2021+; below that the honest options are a hand-built CSV, or an
eBay-title discovery path with a real review queue (a project, not an afternoon).

### What 2020 taught the generator anyway

- **Which shops matter depends on the year.** SHOPS listed four, excluding Mini
  Model Shop, Yuui and Notjustcollectibles "on evidence" — they had zero 2026
  products. They are back-catalogue specialists, and running 2020 without them
  gave SIX rows. Now every shop is fetched and the year decides who contributes.
- **`--seed` mode**, for seasons the shops barely stock: seed drivers, teams and
  events from the catalogue and discover only the chassis codes from feeds. The
  2026 bootstrap needs ~164 structured titles to reconstruct a grid; 2020 has 22.
- **Seeded events need alias spellings.** Shops write "Turkey GP" and "Austria
  GP" where the catalogue says Turkish and Austrian, and "Barcelona Test" for
  "Test Session (Barcelona)".
- **A title naming no race is a `Season` car** — the catalogue already has 59.
  But ONLY when no race is named at all; an unrecognised race is a skip, because
  filing a specific car under the wrong event merges it with others silently.

### The bug that nearly shipped: auto-created events

To cover 2020's COVID one-offs (Tuscan, Eifel, Portuguese, Sakhir, 70th
Anniversary), the generator briefly accepted any `<Words> GP` seen twice or more.
It produced:

```
Hamilton Turkey GP ×13   Russell Sakhir GP ×3   Winner Turkish GP ×3
Winnaar GP ×3            Oostenrijkse GP ×3     JARIG JUBILEUM GP ×2
```

The pattern swallows whatever capitalised words precede "GP" — a driver surname,
a placing — and Yuui is a DUTCH shop, so its titles yielded Dutch words for
winner, Austrian and anniversary. Every one would have become a race that never
existed, with cars filed under it.

**Frequency is no defence: a systematic parsing error repeats exactly as
reliably as a fact.** Unknown races are now reported for a person to add, never
created. Removing it dropped 26 rows to 21 — the 5 lost were fabrications.

**Also still true and worth not repeating:** the `Season` fallback filed
"Mercedes / George Russell / 2020" as a season car. Russell drove a Mercedes
exactly once that year, substituting at the Sakhir GP. The titles do not name the
race, so it is unverifiable from the feed — plausible, wrong, and quiet.

## The biggest unclaimed win — measured 2026-08-28

**The shops carry ~1,130 F1 products in 1:18/1:43 whose SKU the catalogue does
not hold.** Not obscure variants: race winners, last races, first poles.

```
season   held   NOT held
2020      20      51
2021      41     145
2022      82     265
2023     103     262
2024     135     208
2025     145     199
2026     319      44
```

Samples of what is missing:

```
18S775  Vettel - Abu Dhabi GP (Last Race) 2022      537246104 Norris - Singapore GP Winner 2024
18S776  Verstappen - Abu Dhabi GP Winner 2022       LS18F1069 Sainz - Mexico GP Winner 2024
S8525   Perez - Saudi Arabian GP (First Pole) 2022  18S999    Hamilton - British GP Winner 2024
```

**Why the gap exists: the season generator has only ever been run on 2026 and
2020.** 2021-2025 came from hand-built CSVs months ago and have never been
checked against the shops — which is why 2026, the one season built FROM feeds,
has the smallest gap by far (44).

### 2023, 2024 and 2025 done — 2026-08-30

**601 models and 200 cars added in one day.** The catalogue went 1,044 -> 1,645
models and 621 -> 736 cars; `/browse` went from 502 to 692.

```
                    26 Aug     30 Aug
cars                   568        736
models                 865      1,645
retailer links       1,744      3,062
models with image      722      1,455
cars with no store       —         44   (31 of them 2020)
```

Every season 2020-2026 has now been through the generator. **2021 is the only
one left with a known gap** (145 unheld SKUs).

Each import cost one new bug, all of them silent, all found by the import
COLLIDING rather than by anything looking wrong. In order:

1. **A backspace character in a regex** (see the trap below). `namesARace` could
   never be true, so every title naming an unrecognised race was filed as a
   season car. Cost: 19 wrong rows in the 2022 import, repaired.
2. **Event matching demanded the catalogue's exact wording.** `Emilia Romagna GP
   (Imola)` required the token "imola"; `Brazilian GP` never matched "Brazil GP".
   99 of 2023's 323 field-match failures. An event now matches if ANY of its
   spellings matches IN FULL.
3. **`537` is not a 1:43 prefix.** Minichamps' 5xx series runs across scales and
   their 1:18 McLarens live in it, so 22 good 2024 rows were thrown out as
   "SKU/scale disagreement". Ambiguous prefixes now return null.
4. **The maker came from the title, not the SKU.** Horizondiecast writes "BBR x
   MINICHAMPS", and MANUFACTURERS lists Minichamps first, so BBR254416 was
   offered as a Minichamps part and collided on the unique constraint.
5. **A shared parenthetical matched two races.** `United States GP (Austin)` and
   `United States GP Sprint (Austin)` both end in "(Austin)", so Sainz's Austin
   SPRINT car went to the non-sprint race. Shared parentheticals are now
   computed from the catalogue and suppressed as standalone spellings.

### Ties, and how they get settled

The generator refuses to guess when two shops name two different races for one
SKU. It settles by counting shops, and where that ties it REPORTS and leaves the
row alone. Hand decisions are recorded in `EVENT_OVERRIDES` with their evidence,
so a re-run does not ask again.

**A Minichamps SKU encodes the round.** `417 25 02 30` is year 25, round 02,
driver 30 — so the part number itself names the race. Where both signals existed
they agreed: 117250263 decodes to round 2 / car 63, exactly the Chinese GP the
three-shop vote had chosen. This is the strongest evidence available and is
worth automating if ties keep appearing.

**Source reputation is not evidence.** LIVECARMODEL was the wrong side of every
tie in 2023 and 2024, and right all three times in 2025.

### 2022 done — 2026-08-29 (commit 0c878fc)

**179 new models, 54 new cars, 0 errors. 2022 went 128 -> 307 models; the
catalogue went 865 -> 1044.**

LIVECARMODEL is now the eighth source. It has no products.json, so it is read
via its sitemap and written into the same `.feed-cache/` the Shopify shops use
— one more source, no new code path. Rebuild that cache by hand before a run;
the generator warns loudly rather than reporting an empty feed as "no stock".
Its SKUs carry a warehouse prefix (`US-S7852` is Spark's `S7852`) which must be
stripped, or 86 products read as missing when we already hold them.

`--seed` now takes the season's chassis from our own `cars` table and refuses
to let a feed overwrite one. That is the direct fix for W17E.

**Four defects the run itself exposed. All fixed, all worth knowing about
before running 2021, 2023, 2024 or 2025:**

1. **A shop's SKU field is not always a part number.** Stone Model files the
   Verstappen partwork as `Edition 110`; LIVECARMODEL writes Bburago as
   `18-38067 #77` with the driver number glued on. 34 dropped — and printed,
   because some are real models behind a broken SKU. The fence rejects none of
   the 865 SKUs already held. It deliberately does NOT repair `18-38067 #77` by
   cutting at the space: a wrong SKU looks like a fact and gets swept, priced
   and linked as one.
2. **"Zhou Guanyu" and "Guanyu Zhou" were two drivers.** Surname matching
   cannot fold them, because the shops disagree about which word is the
   surname. It had already cost 6 cars split across two rows and a duplicate
   2024 C44 Season page. `canonicalDriver` now folds same-words-either-order;
   the database was merged too.
3. **One SKU was becoming two cars.** A shop that names the race and a shop
   that does not produced two rows for the same box. The named race wins —
   "Season" is what the generator writes when it found nothing, not a claim.
4. **`sync-csv --dry-run` was doing none of the lookups.** It printed "Would
   create car and models" unconditionally: 164 claimed new cars when 88 already
   existed. Useless as the gate for the one failure the generator warns loudest
   about. Only INSERTs are gated now. It then predicted 179 new models / 76
   held, which is exactly what the import did.

Also normalised: the two cars filed under a bare `Italian GP` moved to
`Italian GP (Monza)` where the other 17 live, slugs regenerated to match.
Note the parenthetical is NOT always noise — `Abu Dhabi GP (FP1)` is a
different session, and Barcelona/Fiorano are different tests. Do not fold
those.

### Next: the same run for 2023, 2024, 2025, 2021

262, 208, 199 and 145 unheld SKUs. The machinery is now proven four times and
every trap above is already fenced, so these should be much quieter than 2022
was. One season per sitting:

```
node scripts/build-season-csv.mjs --year 2023 --seed --out ../f1_2023_NEW.csv
node sync-csv.js ../f1_2023_NEW.csv --dry-run     # now tells the truth
node sync-csv.js ../f1_2023_NEW.csv
```

### The LIVECARMODEL sweep is now resumable — 2026-08-29

Importing 2022 took its prefilter from **573 candidates to 884**, which broke
the sweep two ways at once: past `MAX_CANDIDATES = 800`, so 84 were silently
dropped, and 800 pages three-at-a-time is ~365s against a 300s route limit.
Measured, not guessed — the real prefilter run offline returned 884, and a
timed pass came in at 368s.

A count ceiling was the wrong bound, because the number to set it to changes
every time a season is imported. **The sweep now stops on a clock** (240s,
leaving the sitemap fetch and the writes inside 300s), reports how far it got,
and takes an `offset` to continue. Press the same button again and it resumes
from exactly where it stopped; the panel says `read 620 of 884 candidates — run
again to continue`. Nothing is dropped without being counted, and no future
import can make it time out.

**LIVECARMODEL needs two to three passes** depending on how fast their server
is that day. Shopify shops are unaffected — they page themselves and always
finish.

One trap found by running it: the offset was first written as a single number
shared by both buttons, so a dry run that stopped at 516 would have made Apply
start at 516 and silently write none of the first 516 candidates' links. The
cursor now records which mode produced it and switching modes restarts from
zero (52942fa). Both buttons show "continue from N" rather than keeping it as
invisible state — which is what caused the bug in the first place.

### The LIVECARMODEL sweep ran — 2026-08-29 evening

Three passes, applied. **+118 retailer links, +120 images.** LIVECARMODEL went
from 532 links to 650, and it is now the single largest source of links in the
catalogue.

```
                 before   after
models buyable      760     878
models with image   722     842
2022 buyable        112     230
2022 with image     108     228
2022 cars hidden     58      16   <- these are now on /browse
```

**2022 was the whole point of this and it worked**: 58 of its 125 cars were
invisible after the import because a car with no retailer and no eBay link is
kept off `/browse` by `REQUIRE_RETAILER`. 42 of them are now live.

Two things to know for the next shop:

- **Passes are not a fixed number.** The first attempt read 516 candidates in
  263s; an hour later the same run read 381 in 262s. Their server sets the
  pace, so keep pressing Apply until the "continue from" text disappears from
  the button.
- **Two Solido A522s are still held** as "4.0x BELOW the 1:18 median". They are
  a real price — Solido is a budget brand, ~AUD 97 for a 1:18 is genuinely what
  they cost. The check compares against a 1:18 median of AUD 389.92 set by
  Spark (n=54) and Minichamps (n=189), and Solido has fewer than 4 priced
  models so it has no baseline of its own. That is circular: cheap brands get
  held, so they never earn a baseline. The fix is to compare against the
  MANUFACTURER + scale median where there is enough data and fall back to scale
  only when there is not. BBR 1:43 already sits at 2.11x and would trip the
  same wire for the same wrong reason.

**The new models arrive bare** — no image, no retailer link, no eBay link.
2022 is now 307 models with only 108 images. They become real pages when the
retailer sweeps and the eBay matcher run over them, so plan a sweep pass after
the imports rather than after each one.

**2019 is still the worst available use of the time.** 73 F1 products across
all shops, half of 2020's 136 — and 2020 needed hand research to reach 79 cars.

**2019 is the worst available use of the time.** 73 F1 products across all shops,
half of 2020's 136 — and 2020 needed hand research to reach 79 cars. Hardest
work, thinnest result, while five seasons of easy high-value models sit
unclaimed.

## The 1000-row cap bit FOUR readers in one day — 2026-08-30

`models` crossed PostgREST's silent 1000-row limit when the imports took it from
865 to 1,645. Four readers were truncating, and not one of them errored:

```
lib/browseData.ts                  /browse showed 502 cars instead of 631
lib/hubData.ts                     hub pages under-counted what is buyable
lib/relatedCars.ts                 related cars looked unbuyable
app/api/admin/get-f1-data          admin showed 87 models for 2025; there are 270
app/api/admin/batch-ebay-search    the eBay matcher's WORK LIST
```

**The last one never got to fail, and would have been the worst.** That unpaged
select IS the list of models the eBay pass iterates. It would have taken the
first 1,000 of 1,645, skipped 645 — every model imported this week — and
reported success. The only symptom would have been seasons sitting at zero eBay
links for no visible reason.

**The lesson is not "page this table". It is "page them all at once".**
`hubData` was fixed on 2026-08-17 for `price_history` and `ebay_links` — the two
over the cap that day — and `models` was left because it was at 865. `get-f1-data`
had exactly the same half-fix. Both broke the moment the next table grew.

**Why it is so dangerous:** it never looks like a failure. A truncated read
presents as a smaller catalogue, a healthy page, a plausible number. The site hid
a fifth of itself for hours and nothing anywhere said so.

Tables over the cap: `price_history` 3,062 · `price_observations` 1,572 ·
`ebay_links` 1,430 · `models` 1,645. `cars` is at 736 and paged pre-emptively.

## The comparison is on the pages now — 2026-09-01

Maintenance mode, and it turned into the first product work in a while.

**Car page** (b91cb04) and **browse cards** (f73c7a1) now state the spread
instead of leaving a visitor to work it out:

```
AUD 152.32 – 194.01
1:43 Minichamps · 4 prices · cheapest on eBay
```

676 cards carry a price, 513 show a range, 357 say the cheapest is on eBay.
On the car page: 408 variants show a shop range, 772 an eBay range, 272 both.

**Two ranges, never one.** A shop price and a used eBay asking price are
different kinds of number. On the car page they are printed separately; on a
card the floor is attributed instead. The span logic lives in `lib/priceSpan.ts`
and both pages import it, so they cannot drift.

**Bucket by scale AND maker.** Grouping by scale alone gave cards reading
`AUD 28.82 – 831.78` — a Bburago and a hand-built BBR of the same car, at the
same scale. Found by reading the output rather than the totals. Checking the
suspicious floor was worth it twice: every price under AUD 60 turned out to be
genuine Bburago, which is what proved the grouping was wrong, not the data.

**"Lowest Price" is now "Lowest shop price".** It always excluded eBay and the
label never said so. Survivable until an eBay range sat beside it, because on
the 738 models carrying both, **eBay is cheaper than every shop 51% of the
time, by up to 69%.** That is a sharper pitch than the spread average.

**"Price: Low to High" had never worked.** Both sorts read a formatted string
`browseData` never set, so every comparison was 0 against 0 for all 729 cars.
The control was in the dropdown and selectable the whole time.

Also today: the retailer sweep records price history at last (c1c96e6). It was
the busiest of the three price-writing paths and the only one keeping none, so
observations sat at 1,572 rows dated 18 August while links went 1,744 to 3,385.
Sweeping Anthony's writes 2 links and records 485 observations, because 483
prices HELD — and "this did not move for three weeks" is what a price index is
for. The `.next` collision is guarded too (27ae20c), firing only when a
production build is actually present so the dev cache survives.

## Price history: the component already exists

`app/components/PriceHistory.tsx` is 119 lines, works, and has an empty state.
It is wired to `/models/[id]`, which passes `priceHistory: []`.

So building it is one query plus putting it on a real page. It is NOT complex.

**Three reasons it waits:**

1. **Three recording days** — 17 Aug, 18 Aug, 31 Aug. A chart of three points is
   a line between two guesses. The data accrues on its own now, so the feature
   is worth more every week it is not built. After the September refresh there
   is a fourth point and a month of movement.
2. **`/models/[id]` is orphaned** — client-fetched, absent from the sitemap, and
   the only link into it comes from a component rendered on itself. History
   belongs on `/cars/[slug]`, which is server-rendered and indexed.
3. **`lib/modelHelpers.ts` invents data** — `generatePriceHistory` is a random
   walk, `rating: Math.random() * 1.5 + 3.5`, `generateReviews()`. NOT reaching
   users today, because `/models/[id]` hardcodes empties — but one import away
   from putting fabricated reviews and prices on a site whose entire value is
   that its numbers are real. Delete them.

**Order when picking this up:** decide what `/models/[id]` is for, delete the
fabrication helpers, then build history on the car page after the refresh.

## Price history — designed, not built. 2026-09-02

Migration 018 is applied and the undo path was exercised for real: two rows
written under one `batch_id`, read back, deleted by batch, table returned to
1,748. Every sweep and refresh now stamps `batch_id` and `source`.

### Why it is not built yet — the number is 5%

```
buyable models with 2+ observation days        379 of 1,615   (23%)
models where ONE SOURCE was seen on 2+ days     74            (5%)
car pages with any chartable variant            68 of 786     (9%)
models with ANY observation                    603            (37%)
```

The honest chart is per-source, and per-source needs the same seller observed
on two different days. 17–18 Aug were refresh runs, 31 Aug was one shop's
sweep, so they barely overlap. Building now means **91% of car pages read "No
price history available yet"**, which makes the site look emptier than it is.

### The reference is Keepa, not StockX

StockX is built on TRANSACTIONS — last sale, bid/ask, volume. We have none.
A vanished eBay listing 404s whether it sold, expired or was delisted, so every
row means "we observed this offer at this price", never "it sold for this"
(migration 017 says so, and any UI must use that wording).

Keepa and CamelCamelCamel track ASKING prices, which is what we have, and their
conventions exist because of that constraint: step charts never smoothed, one
line per source, gaps where unobserved, low/high/average as text.

**One row makes the case better than any argument. Spark 1:43 S8580:**

```
17 Aug   eBay      AUD 1,283.91     one seller's asking price
18 Aug   retailer  USD 109.95  ->  AUD 164.93
18 Aug   retailer  AUD 156.00
18 Aug   retailer  EUR  59.92  ->  AUD  95.87
```

Three shops between AUD 96 and 165, and one optimist asking eight times retail
who will never sell it. That single row rules out:

- **all-time high** — it would headline a fantasy price. StockX can show a high
  because someone PAID it.
- **average** — dragged 40% by one listing.
- **a single shared chart** — plot 1,284 against 96–165 and the three real
  prices collapse into a smudge at the bottom of the axis.

So per-source lines are not only about the coverage artefact. They are the only
way the chart is READABLE.

### The coverage artefact, for when this gets built

237 of the 379 chartable models had the NUMBER of sellers observed change
between days. Worked example — Minichamps 1:43 537256281:

```
17 Aug:  1 price,  cheapest AUD 338.07
18 Aug:  3 prices, cheapest AUD 164.93
```

A "cheapest anywhere" line draws a 51% crash. Nothing crashed; we looked at
three sellers instead of one. A per-source line cannot do this, because a
source not observed that day leaves a gap in its own line instead of moving a
combined number.

**"Lowest we have seen" is the most fragile statistic available.** It covers
37% rather than 5%, which is tempting — but a `min()` over an append-only table
is poisoned permanently and INVISIBLY by one bad row. No outlier dot to spot,
just a number that quietly makes every future price look expensive. This is the
strongest reason `batch_id` exists.

### Where it goes on the page

Not StockX's always-on chart under the buy box: that works because StockX is
one product per page. A car page carries up to 8 variants (median 2, mean 2.3),
each a different model with its own history.

So: **inside each variant card, in the price block that already shows the
ranges** — a sparkline directly under "2 shops · AUD 164.93–254.92", because it
is the same claim extended backwards. No axes, ~60x20px. Click to expand the
per-source step chart, rendered on demand so 8 variants are not 8 charts.

Ruled out: one chart at the top of the car page — "the price of this car" spans
a Bburago at 28.82 and a BBR at 831.78, the same trap the browse cards hit. And
a separate Price History tab, which would have to hold N charts anyway.

**The sparkline degrades honestly and the chart does not.** With three points a
sparkline is a shrug, which is fine at 20 pixels tall; the full chart looks
broken. So the sparkline can ship earlier, against the 37%.

### Order when picking this up

1. **Run the baseline refresh** — Refresh All Retailers + Refresh eBay. This is
   the mid-September task brought FORWARD, and it does four things: creates a
   full-coverage baseline with provenance, turns 74 chartable models into
   several hundred, resets the 30-day staleness clock to today (pushing the
   deadline to ~1 October), and exercises `batch_id` at scale while a mistake is
   still cheap to undo. Retailers first if only one — their numbers are the more
   comparable ones.
2. **Sparkline** in the variant price block.
3. **Expandable per-source step chart** in October, once the second full
   reading exists.

### Price alerts — the idea that needs no history at all

"Email me when this drops below AUD 200." Works from today's data, brings
people BACK rather than once, and for a site whose stated purpose is feedback
it produces a signal — what people actually want to be told about — that
traffic numbers never will.

## Next up

Items 1 and 2 were the whole of this list two days ago and are now done: sweeps
fill images (722/865), and every season has been re-run under the
multiple-listings matcher (382 models carry several, 82 remain on one).

1. **THE eBAY PASS.** The single biggest gap left: **464 of 1,645 models have an
   eBay listing**, so ~1,200 have never been searched, including nearly every
   model imported this week. eBay is where the multi-listing price comparison
   comes from, so this is the difference between a catalogue and a price index.
   Safe to run now that batch-ebay-search is paged — it was not, this morning.

   ```
   year   models   retail   eBay
   2022      307      280    108
   2023      383      352    109
   2024      283      269     68
   2025      270      242     60
   2026      187      185      0     <- suspicious, 187 models and not one link
   ALL     1,645    1,440    464
   ```

   2026's zero is most likely the truncated work list above, but confirm it
   rather than assume.

2. **2021** — the last season with a known gap, 145 unheld SKUs. Same three
   commands as the others; every trap above is now fenced.

3. **Finish the shop sweeps.** Horizondiecast, Yuui and Notjustcollectibles have
   not been swept at all and carry the back-catalogue and Bburago stock nothing
   else has. LIVECARMODEL now needs about FOUR presses of Apply — its candidate
   list grew from 884 to 1,443 as the catalogue grew.

   **Press Apply repeatedly; do not alternate with Dry run.** The cursors are
   deliberately separate per mode, so switching restarts at 0 and you never reach
   the end. Also: an offset is only valid while the catalogue is unchanged —
   importing a season re-sorts the candidate list and makes an old offset point
   somewhere else. Restart from 0 after an import.

4. **The mid-September refresh** — see the deadline box at the top. Only 6
   retailer links are past 30 days so far, because the sweeps have been
   refreshing them as a side effect.
2. **The retailer SWEEP records no price observations.** `refresh-prices` and
   `refresh-ebay` both append to `price_observations`; the sweep writes through
   `attachRetailerLink` and does not. So links created by a sweep sit outside the
   price history until a Refresh All Retailers picks them up. Third write path,
   two of them recording history — the kind of inconsistency that gets forgotten.
3. **A `predev` guard for the `.next` collision.** A production build left in
   `.next/` breaks route registration and every `/api/*` returns 404 with an HTML
   body while pages still render. **This has now bitten FOUR times**, most
   recently from a build dated eight days earlier that lay dormant until a fresh
   dev start. `"predev": "rimraf .next"` or similar ends it permanently.
4. **Own the images, or keep hotlinking.** Every product photo is served from a
   retailer's CDN — 24 hosts, their bandwidth, their copyright, and any of them
   can break every image by renaming a file. None block a `diecasts.app` referer
   today, but that is a snapshot. Copying to Supabase Storage at fill time solves
   breakage, bandwidth and ownership together; ~700 images is cheap now and a
   migration later. **A real decision, not a nice-to-have.**
5. **42 buyable models still have no image**, 43 of the image-less have an eBay
   photo available. Applied by hand on purpose — see the images note at the top.
6. **86 cars have no models at all**, so they are invisible by construction.
   15 of them are 2020 rows held in `f1_2020_HOLD_no_sku.csv` awaiting a SKU.
7. **Remove the TLD currency guess** in `attachRetailerLink` — it caused every
   problem in the currency audit.
8. **8 retailer links whose URL states a different scale than the model** — see
   Data findings. Splits into wrong links and wrong catalogue scale; do not
   blind-fix.
9. **More seasons, if wanted — but by ERA, not chronology.** Feed discovery dies
   below 2021; hand-researched CSVs do not (2020 gave 79 cars against the
   generator's 11). And stock is not a decay curve: 2000 and 1995 have more
   product than 2005 and 2010, because iconic sells and mid-2000s midfield does
   not.
10. **2026 eBay**, once the cars actually ship. Zero secondary market today.
11. Review queue for the eBay `event-driver` tier, and a "recently auto-added" view.
12. Structured data (Product/Offer JSON-LD), gated on the freshness rules.
13. Rotate the eBay and Exa credentials still sitting in the repo history.

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
