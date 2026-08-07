# Status Summary — last updated 2026-08-08

> Handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** — it describes
> the scraper-first approach that was abandoned.

## Where things stand

```
cars 164  |  models 247  |  retailer links 199 (167 models)  |  retailers 48  |  drivers 30
eBay links 24 (all EBAY_AU, 23 auto-linked)  |  ebay_search_log 25
seasons: 2023 (98 cars) + 2024 (66)     slugs: 164/164
browse shows 96 cars  |  87 of those have an image
```

Live on Vercel at diecasts.app. Migrations 007–013 all applied. `tsc --noEmit` clean.
**7 commits unpushed.**

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

1. **Publishable key + disable legacy keys** — the only item with real-world risk.
2. **Normalise `F1 W14` → `W14` in `cars.chassis_name`.** Two spellings of one chassis
   split it into two eBay searches, and the composite UNIQUE treats them as different
   cars, so a duplicate can slip through. Matching now tolerates it; the data shouldn't
   need it to.
3. Run the remaining eBay scopes (dry run, read the plan, link). ~127 links available.
4. Review queue + "recently auto-added" view.
5. Expiry checking for sold eBay listings.
6. Structured data (Product/Offer JSON-LD), gated on the freshness rules.

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
