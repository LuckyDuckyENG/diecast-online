# Status Summary — last updated 2026-08-12

> Handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** — it describes
> the scraper-first approach that was abandoned.

## Where things stand

```
cars 316  |  models 455  |  retailer links 613 (289 in stock)  |  retailers 48  |  drivers 38
eBay links 326  |  models buyable 406/455  |  images 257/455
seasons: 2021 (69) + 2022 (83) + 2023 (98) + 2024 (66)     slugs: 316/316
models with 2+ retailers 186  |  3+ 61      currencies: AUD, EUR, GBP, USD
```

**Read visibility as a share of cars that CAN be visible.** 50 cars have no models
at all — CSV rows with no SKU — so they are invisible by construction and drag the
raw percentage down.

```
cars visible 253/316  =  95% of the 266 that have models
   2021  48/50  (96%)      2023  80/86  (93%)
   2022  66/71  (93%)      2024  59/59  (100%)
```

Live on Vercel at diecasts.app. Migrations 007–013 all applied. `tsc --noEmit` clean.
**2 commits unpushed.**

## Retailer sweep — feed instead of scraping

Shopify shops publish `/products.json`: the whole catalogue as JSON, 250 per
request, with SKU, price, availability and images already structured. Measured on
anthonysdiecasts.com.au — **54 requests, 13,400 products, 60 seconds**. The same
catalogue one product page at a time is 13,400 requests, about four hours, and is
what needed a scraping proxy.

The cost stops scaling with the catalogue and scales only with the number of
retailers, because matching happens in memory against a SKU index. **23 of 48
retailers expose a feed**; the other 25 are unchanged — `refresh-prices` still
maintains their links and discovery there stays manual.

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

### All 23 sweepable shops have now been run

Retailer links went 199 → 506 in one session. Biggest contributors: Anthony's
123, Stone Model 90, Yuui (NL) 69, Mini Model Shop (UK) 54, Notjustcollectibles
37, Downies 27.

**Why the remaining shops return zero**, which is worth as much as the links:

- **Diecast Model Centre, RM Toys, Hobbyco** stock F1 but key it by *internal*
  SKUs (`BB-109672`, `HJ648006SP`). Unmatchable by design, not a bug.
- **Metro Hobbies** *does* use manufacturer SKUs (`18S1004`, `S9409`) but stocks
  only current and forthcoming seasons — RB21, VCARB, a 2026 Cadillac. The one
  link held there by hand, `18S896` from 2023, is no longer in its feed.

That second one is a **category, not a one-off**: shops selling only new stock
will never match a back-catalogue index. Older seasons therefore lean further
onto eBay than 2022 did — worth factoring into any 2021 decision.

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

### LIVECARMODEL — validated design, not yet built

BigCommerce, no bulk feed: `/products.json`, WooCommerce and PrestaShop endpoints
all 404. But `/xmlsitemap.php` is a sitemap index, and that changes the economics.

```
1. sitemap index -> 7 product sitemaps -> 65,168 URLs        8 requests
2. slug prefilter against our models                         free, in memory
3. fetch only the candidates, read Product JSON-LD           ~370 requests, ~5 min
4. confirm by the page's real SKU, then existing guards apply
```

**290 of 455 models have a plausible slug; 273 are not yet linked there.** Slugs
carry scale, manufacturer, year, team, chassis, driver and event, which is enough
to prefilter — but not to identify. Stage 4 is what makes it safe, and it works:
of three tested, two confirmed and one was correctly rejected (`410241163` vs the
page's `410240163` — one digit, a different round).

So matches are **auto-linkable at Shopify-sweep confidence**, not review-tier.

This generalises: **sitemap + slug prefilter + JSON-LD confirm** is not
BigCommerce-specific and could serve several of the 25 manual shops.

Both sides normalise identically or nothing matches — the first attempt scored 0
because slugs were flattened to spaces while the query kept `1-18`, and country
adjectives were folded on one side only.

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

### eBay — not done

- **Review queue** for the `event-driver` tier and a "recently auto-added" view
  (`auto_linked` is recorded for exactly this).
- **Expiry checking** — nothing notices when a listing sells. `ebay_item_id` is stored
  for it.
- The 22 linked before paging came from a partial pool: correct, but a cheaper listing
  may have existed on page two. The matcher takes the cheapest it *saw*.
- Remaining 19 scopes not yet run. Expect thinner results for Alpine, Haas, Williams —
  less AU secondary-market presence.

## ⚠️ The one item with real-world risk

**The leaked `service_role` key is still valid.** `.env.local` was committed in the
initial commit and pushed to a public GitHub repo.

1. `SUPABASE_SERVICE_ROLE_KEY` → `sb_secret_...` — **DONE** (local + Vercel)
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `sb_publishable_...` — **NOT DONE**
3. Redeploy, confirm `/browse` loads
4. **Disable legacy keys** — the step that actually kills the leaked key

Do not do 4 before 2: public pages query Supabase from the browser with the anon key,
so disabling legacy first blanks the live site. The publishable key already exists in
Settings → API Keys (created alongside the secret key; there is no separate button).
eBay and Exa keys were also in that file.

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

- **9 of 96 browse cars have no image**; 7 are linked only to `Miniatures-minichamps`,
  whose pages the image extraction can't read. They now render the team-colour panel
  rather than a broken image.
- **Currency rates hardcoded and undated** (`lib/currency.ts`). They decide which
  retailer looks cheapest.
- **Duplicate retailer rows**: `Miniatures-minichamps` (AU/AUD) and `Miniatures Minichamps`
  (US/USD) are one EU shop. Also a junk retailer named `Dc`. `110242101` is labelled AUD
  on a EUR shop.
- **6 junk rows in `teams`** with 0 cars. `pickTeam()` ranks by car count so they can't
  win a lookup, but they still pollute hub slugs.
- **`cars.driver_id` / `cars.event_name` are nullable**, so the composite UNIQUE doesn't
  block a NULL-keyed duplicate. Guarded in application code only.
- 68 cars have no retailer — excluded from browse, sitemap and related links, reachable
  only by direct URL. Reverses automatically when one gets a link.
- A few hub slugs fall back to the long form (`/teams/haas-f1-team`).
- **59 models have `event_name = "Season"`** — a legitimate category (generic
  season/launch-livery cars), not a data error. They can't use event matching, so eBay
  matching for them rests entirely on the SKU tier. They also read "at the Season" in
  descriptions.
- ~26 uncommitted files: scraper `.ts` scripts, `diecast-site-homepage-fixes/`.

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
- **A guard whose reference comes from the current batch weakens as the batch shrinks.**
  The price outlier check held back AUD 1293.40 on a 25-model run and passed the same
  listing on a 3-model re-run, because the sample fell below its minimum. Anchor
  guards to stored data, not to the run.
- **Display normalisation breaks scope filters.** The admin shows "Red Bull" for
  "Red Bull Racing", so an exact-match filter selected nothing — and reported it as
  "nothing to search", which reads as *done* rather than *matched nothing*. Use
  `teamMatches()`, and make empty results say which kind of empty they are.

## Next up

1. **Publishable key + disable legacy keys** — the only item with real-world risk,
   and now several sessions old. Create key → add to Vercel → redeploy → confirm
   `/browse` loads → *then* disable legacy. Reversing that order blanks the site.
2. **Build the LIVECARMODEL sitemap sweep** — design validated above, 273 links
   waiting. Biggest remaining retailer lever, roughly two hours.
3. **Remove the TLD currency guess** in `attachRetailerLink` — it caused every
   problem in the currency audit.
4. **9 visible cars still have no image**, all 2021.
5. **2020** if you want another season; retail coverage will be thinner again.
6. Review queue for the eBay `event-driver` tier, and a "recently auto-added" view.
7. Expiry checking for sold eBay listings.
8. Structured data (Product/Offer JSON-LD), gated on the freshness rules.

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
