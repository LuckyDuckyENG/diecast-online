# Status Summary — last updated 2026-08-03

> This is the handoff doc. `TODO-TOMORROW.md` is from early July and is **stale** —
> it describes the old scraper-first approach that was abandoned.

## Where things stand

```
cars 158  |  models 239  |  retailer links 104  |  retailers 21  |  drivers 30
seasons: 2023 (92 cars) + 2024 (66 cars)      models with an image: 12/239
```

Live on Vercel at diecasts.app. `main` is pushed and building. Production shares the
same database, so data changes appear there immediately without a deploy.

Migrations 007–011 are all **applied**. `npm run build` passes and `tsc --noEmit`
is clean.

## ⚠️ The one genuinely outstanding item

**The leaked `service_role` key is still valid.** `.env.local` was committed in the
initial commit and pushed to a *public* GitHub repo.

1. `SUPABASE_SERVICE_ROLE_KEY` → new `sb_secret_...` — **DONE** (local + Vercel)
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` → new `sb_publishable_...` — **NOT DONE**
3. Redeploy, confirm `/browse` loads
4. **Disable legacy keys** — this is what actually kills the leaked key

Do not do step 4 before step 2: public pages query Supabase from the browser with the
anon key, so disabling legacy first blanks the live site. The publishable key already
exists in Settings → API Keys (it was created alongside the secret key — there is no
separate "create" button for it). Also worth rotating: eBay and Exa keys.

## Done since the last update

**2023 imported.** 92 cars, 129 models, zero errors. `sync-csv.js` now takes a file
path argument (it had 2024 hardcoded) and parses quoted CSV fields properly.
19 cars have no models — the rows where no SKU was found yet, kept deliberately as a
worklist visible in the admin backend.

**Duplicate drivers fixed, and the leak that caused them.** `"Esteban Ocon "`,
`"Nico Hülkenberg"`, `"Sergio Pérez"` were separate rows from the real ones, splitting
one driver's cars across two identities. Root cause: `.ilike()` lookups miss on a
trailing space or accent, and the caller then created a "new" driver; comparisons used
a `[^a-z0-9]` strip that *deletes* accented characters (`pérez` → `prez`).
`resolveDriver()` in `lib/driverName.ts` is now the single lookup-or-create for all
three routes that touch drivers. Verified: creating a car for "Sergio Pérez" now
resolves to the existing driver and existing car.

**Readable URLs.** `/cars/2024-red-bull-rb20-max-verstappen-chinese-gp` instead of a
UUID. Slug stored in a column with a unique index (migration 011), all 158 backfilled.
Routing accepts slug *or* UUID, resolving against the stored column, so old links keep
working permanently. Browse and search link to slugs.

## Next up — SEO, agreed but not started

**The finding that matters:** every public page is `'use client'` and fetches in the
browser, so the HTML a crawler receives contains **zero** of the content. A car page
has no mention of its own car. All 158 pages share one `<title>`, because a client
component cannot export `generateMetadata`.

The plan, in order:

1. **Server-render `cars/[id]`** — server component fetching the car, `generateMetadata()`
   for unique titles, `generateStaticParams()` to prerender, `revalidate = 3600`. Keep
   the scale/manufacturer filter as a small client component taking props.
2. **Browse and home** — same pattern.
3. **`sitemap.ts` + `robots.ts`** from the database; `noindex` on `/search`.
4. **Later:** JSON-LD Product/Offer, gated on the freshness rules so a stale price is
   never marked up.

Decisions already made: use the **publishable** key server-side, not the service key
(RLS grants anon SELECT, which is all a public page needs). Strategy is **long-tail
product pages** — retailers own the broad terms, but none of them can answer "every
manufacturer and scale for this car, with prices side by side".

Worth knowing: retailer product pages are *not* weak. Their titles carry scale, year,
driver, event and manufacturer, and they ship JSON-LD. The winnable gap is aggregation,
not out-optimising them per SKU.

## Known soft spots

- **Only 12 of 239 models have an image**, and `/placeholder.jpg` 404s, so imageless
  cards show a broken-image icon. Images are easy to add from the admin side. This is
  strategic, not cosmetic: thin aggregation pages are exactly what search engines filter.
- **Currency rates are hardcoded and undated** (`lib/currency.ts`). They decide which
  retailer looks cheapest.
- **Duplicate retailer rows**: `Miniatures-minichamps` (AU/AUD) and `Miniatures Minichamps`
  (US/USD) are one EU shop. Also a junk retailer named `Dc`. And `110242101` is labelled
  AUD 148.72 on a EUR shop.
- **`cars.driver_id` / `cars.event_name` are nullable**, so the composite UNIQUE does not
  block a NULL-keyed duplicate. Guarded in application code only.
- **3 links fail every refresh** (403s or no published price) — they age visibly by design.
- **1 quarantined price**: an Anthony's pre-order returning 5000 against a stored 399.99.
- 18 cars with zero models (the 2023 SKU worklist).
- ~41 uncommitted files remain: one-off repair scripts targeting the old schema (all
  dead — `CLEAN-SLATE.js`, `fix-merge-disaster.js` etc. cannot run), scraper `.ts` files,
  `diecast-site-homepage-fixes/`, `.claude/settings.local.json`.

## Two traps worth remembering

- **`tsc --noEmit` is not the deploy gate.** `next build` type-checks unreachable code
  too; a type error in a block after an early `return` failed the deploy.
- **Never run `npm run build` while the dev server is running.** In Next 16 the
  production build writes to `.next/` while dev serves from `.next/dev/`, and the
  collision breaks route registration — every `/api/*` 404s with an HTML page while
  pages still render. Fix: stop the server, `rm -rf .next`, restart.

## Architecture

A car IS the tuple **season + team + chassis + driver + event**, with
`UNIQUE(season_id, team_id, chassis_name, driver_id, event_name)`. Driver and event live
on the car, never on the model. Models cascade-delete with their car.

Retailer links live in `price_history`, keyed by `model_id`, **one current row per
(model, retailer)** — enforced by a unique constraint. It is current state, not an
append log: refresh overwrites in place, so there is no price history and no undo.
`last_checked_at` is stamped only on a *successful* check, so unreadable links age
visibly. Prices older than 30 days stop being quoted; the retailer link remains.

RLS is on. anon/authenticated get SELECT on the nine tables the public site reads and
nothing else; `service_role` bypasses RLS, so admin routes are unaffected.
