# Status Summary — last updated 2026-07-31

## Where things stand

```
cars 67 | models 110 | retailer links 104 | retailers 21 | manufacturers 8
models with >=1 link: 91/110      all data is 2024
```

Retailer refresh now works and can be trusted. Migrations 008 and 009 are applied.

## ⚠️ Do this first

**Commit.** Nothing has been committed for days and there is a lot outstanding:
`api/admin/refresh-prices`, `get-f1-data`, `update-model`, `create-model`, `search-car`,
`add-retailer-link`, `save-retailer-link`, both detail pages, the admin page, and six new
lib files (`currency`, `freshness`, `retailerLink`, `eventName`, `teamName`, `driverName`).

**Then run 🔄 Refresh All Retailers once.** Every link currently carries a backfilled
`last_checked_at` (copied from `recorded_at`), so the ages on the site are approximate.
After one real run they mean what they say.

## Done today

**Refresh — Phase 1 (correctness).** It had two bugs that would have corrupted data on the
first full run:
- `price_aud` was set to `NULL` for every non-AUD link — 19 links would have dropped out of
  the cheapest-price comparison entirely. Now converts via `lib/currency.ts`.
- A cents heuristic divided any whole number > 100 by 100, which would have turned Stone
  Model's $392 into $3.92 across **34 of 104 links**. Replaced with real JSON-LD parsing plus
  a units check anchored to the stored price: a ~100x gap is a units mismatch (Shopify serves
  cents — Anthony's 34999 = $349.99), anything else is a real change.
- Stock is now evaluated *before* the no-price bail-out, so listings that sell out and hide
  their price get marked out of stock instead of keeping a stale price forever.
- **Plausibility guard**: any read more than 5x from the stored price is quarantined, never
  written, and reported. It caught a pre-order page returning 5000 against a stored 399.99.
- `dryRun: true` reports what would change and writes nothing.

**Availability detection** — microdata first, then JSON-LD, then free text. Tibormodel
declares `itemprop="availability" href=".../OutOfStock"` with no JSON-LD at all; the old
text-only check missed it because "no longer available" doesn't contain "unavailable".
Structured markup wins so Shopify's variant-picker noise ("Sold out") can't cause false
negatives.

**Refresh — Phase 2 (usability).** `🔄 Refresh All Retailers` and `🧪 Dry-run All` in the admin
header. Walks the links in batches of 8 with a progress bar, live counters, a Stop button,
and a list of anything quarantined. The plan is interleaved by retailer so the busiest host
(42 of 104 links) is hit every ~2.5 slots instead of 42 times in a row.

Full dry run: **104 checked · 53 would change · 45 unchanged · 5 no price · 1 quarantined**,
about 2.5 minutes.

**Per-row refresh button fixed.** `RetailerPrice` had no `id`, so the button sent
`priceHistoryId: undefined` and the route silently refreshed *every* retailer on that model.
`get-f1-data` now returns `price_history.id`. Cleared 5 long-standing TS errors.

**Freshness, shown to visitors** (`lib/freshness.ts`)
- `last_checked_at` stamped only on a **successful** check, including the unchanged case —
  which `recorded_at` can never capture. Links that 403 or hide prices deliberately age.
- Inline under each retailer: "Price checked 3 hours ago", amber once ageing.
- Under 7 days: shown plainly. 7–30 days: shown, labelled. Over 30 days or never checked:
  the number is withheld ("Check price on site") but the retailer and link remain.
- **Lowest Price now excludes stale and out-of-stock links.** A stale low price is the worst
  failure a comparison site can have — it sends someone to a shop where it costs more.
- Disclaimer at the foot of the pricing section.

**Data corrected:** `410240111` 7995 → 79.95 EUR (a cents misread, `price_aud` 12792 → 127.92);
both Tibormodel rows marked out of stock; duplicate LIVECARMODEL row removed.

**Frontend guard:** detail pages skip rows priced 0, so a failed extraction can't present as
the cheapest offer.

## Known issues, roughly by cost

- **`lib/driverName.ts` is written but NOT wired in.** Fixes "Lando Norris + Oscar Piastri"
  vs stored "Norris + Piastri", and accented names (Pérez, Hülkenberg) which the current
  `[^a-z0-9]` strip mangles into "prez"/"hlkenberg". Two-line change in `create-model` and
  `update-model`.
- **Currency rates are hardcoded and undated** (`USD 1.5, EUR 1.6, GBP 1.9` in
  `lib/currency.ts`). With AUD/EUR/GBP/USD side by side these decide which shop looks
  cheapest. Needs a real FX source.
- **Duplicate retailer rows**: `Miniatures-minichamps` (AU/AUD) and `Miniatures Minichamps`
  (US/USD) are one EU shop, created before hostname matching was fixed. Also a junk retailer
  named `Dc`. And `110242101` is labelled AUD 148.72 on a EUR shop — needs the native price
  confirmed.
- **5 links can't be price-checked** (403s, or shops that publish no price). They now age
  visibly rather than looking fresh. Need manual prices or removal.
- **1 quarantined**: an Anthony's pre-order page returning 5000 against a stored 399.99.
  Worth eyeballing — it may be deposit-only, in which case it doesn't belong in a price
  comparison.
- **`cars.driver_id` and `cars.event_name` are nullable**, so the composite UNIQUE doesn't
  block a NULL-keyed duplicate (Postgres treats NULLs as distinct). Guarded in application
  code only: `ALTER TABLE cars ALTER COLUMN driver_id SET NOT NULL;` (same for `event_name`).
- **6 junk rows in `teams`** with 0 cars each. `pickTeam()` now ranks by car count so they
  can't win, but they're still clutter.
- **All 110 models have no image.** `/placeholder.jpg` 404s — nothing in `public/`.
- Out-of-stock rows still show a bare price; "Last seen at $X" would read more honestly.
- One pre-existing TS error in `admin/ebay-linking/page.tsx` (missing `currency`), in
  unreachable code after a `return`.

## Ideas discussed, not built

- **"Refresh only what's stale"** — now possible thanks to `last_checked_at`. The version
  worth scheduling. Retailer is the other useful filter (parsing problems arrive per-site);
  season is useless until there's more than 2024.
- **Notify-me when a model comes back in stock** — the reason store-less cars stay reachable
  by direct URL and search.
- **Sold-out listings can't be recorded at all** — `price_history.price` is NOT NULL. Making
  it nullable would allow "listed here, currently no price". Condition agreed: null must be
  an explicit choice, never a fallback when extraction fails.
- **Bulk retailer linking** — discussed and deliberately deferred. Manual linking is what
  kept this data clean; the option if it's ever needed is retailer-first catalogue indexing
  matched on SKU, never title.

## Architecture

A car IS the tuple **season + team + chassis + driver + event**, with
`UNIQUE(season_id, team_id, chassis_name, driver_id, event_name)`. Models cascade-delete with
their car. Driver and event live on the car, never on the model.

Retailer links live in `price_history`, keyed by `model_id`, **one current row per
(model, retailer)** — now enforced by `UNIQUE (model_id, retailer_id)`. It is current state,
not an append log: refresh overwrites in place, so there is no price history and no undo.

`/browse` shows only cars with at least one retailer or eBay link
(`NEXT_PUBLIC_REQUIRE_RETAILER=false` disables). Search and car pages never filter, so every
car stays reachable.
