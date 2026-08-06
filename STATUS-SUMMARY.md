# Status Summary — last updated 2026-08-06

> Handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** — it describes
> the scraper-first approach that was abandoned.

## Where things stand

```
cars 164  |  models 245  |  retailer links 162  |  retailers ~24  |  drivers 30
seasons: 2023 (98 cars) + 2024 (66)     slugs: 164/164
browse shows 96 cars  |  87 of those have an image  |  models with an image 95/245
```

Live on Vercel at diecasts.app. Migrations 007–011 all applied. `npm run build`
passes, `tsc --noEmit` clean. **1 commit unpushed.**

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
- Season cars read "at the Season" in descriptions.
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
