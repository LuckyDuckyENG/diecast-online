# Plan — eBay refresh and price observations

Written 2026-08-17. Every number here was measured, not estimated; the commands
are in the session that produced this file.

## Two problems, one job

**1. Every eBay price disappears in three weeks.** `STALE_DAYS = 30` and
`shouldHidePrice()` makes a row render "Check price on site" instead of a number.
Nothing has ever re-checked an eBay link:

```
first of the 430 goes stale : 2026-09-06
half of them by             : 2026-09-09
all of them by              : 2026-09-16
```

Retailer links sit at 777 fresh / 374 ageing / **0 stale** because
`refresh-prices` keeps them alive. eBay was never wired into it. So the work we
just did — the price spread, the AUD 124.87 floor replacing 426.45 — becomes
invisible in September unless something re-checks.

This is NOT about listings dying. Measured twice: 0 of 77 dead in the morning,
1 of 54 by the afternoon. eBay listings here are Good-'Til-Cancelled and live for
**months to years** (age median 231 days, p90 742, max 922; 37 of 53 older than
90 days). Decay is slow. The staleness rule is what bites.

**2. Every observation is currently thrown away.** `price_history` is
current-state by design — refresh overwrites in place, so there is no series and
no undo. We hold exactly one data point per link.

**These are the same job.** A refresh observes a price. If it appends that
observation as well as overwriting the current row, history accumulates for the
cost of one extra insert. Build the refresh without it and every check between
now and whenever we add history is data destroyed.

## What eBay will and will not tell us

Confirmed against the live API today.

**A gone listing is opaque.** Sold, expired and delisted are indistinguishable:

```
GET /buy/browse/v1/item/v1|<id>|0
404  {"errorId":11001,"message":"The specified item Id was not found."}
```

Identical response for a fabricated id. **So we can never label a vanished
listing "Sold".** Anything that presents a 404'd listing as a completed sale is
a claim we cannot support.

**A sold-out-but-still-listed listing is readable, and common.**

```json
"estimatedAvailabilities": [{
  "estimatedAvailabilityStatus": "IN_STOCK",
  "estimatedAvailableQuantity": 1,
  "estimatedSoldQuantity": 0
}]
```

Of 51 sampled: **21 are multi-quantity**, 7 have already sold at least one, and
**2 are already not IN_STOCK**. Those we can badge truthfully, with a link that
still works and a price that is real.

**Real sold prices are not available to us.** eBay's Marketplace Insights API
covers ~90 days of sold data but is limited-release and needs an application; the
old Finding API `findCompletedItems` is retired. So this feature records **our own
observations** — "we saw this at AUD 250 on 15 August" — not "it sold for 250".
That wording matters and should reach the UI verbatim.

## Column types — resolved, not assumed

`models` and `cars` are **not created by any migration in this repo**. 007 only
`ALTER`s them, so they predate version control and their types cannot be read
from the files. PostgREST returns `uuid` and `text` identically as JSON strings,
so sampling the API could not settle it either.

Settled from PostgREST's own OpenAPI description (`GET /rest/v1/` with
`Accept: application/openapi+json`), which reports column formats directly:

```
models         id=uuid   car_id=uuid
retailers      id=uuid
price_history  id=uuid   model_id=uuid   retailer_id=uuid
ebay_links     id=uuid   model_id=uuid   ebay_item_id=text
```

So every id is `uuid` and `ebay_item_id` is `text`. Worth remembering as a
technique: that endpoint answers "what type is this column" without SQL access,
which is exactly what migration 015 needed and guessed at three times.

## Schema

### Migration 016 — status on `ebay_links`

```sql
ALTER TABLE ebay_links
  ADD COLUMN IF NOT EXISTS availability   TEXT,     -- eBay's estimatedAvailabilityStatus
  ADD COLUMN IF NOT EXISTS sold_quantity  INTEGER,
  ADD COLUMN IF NOT EXISTS available_qty  INTEGER;
```

`availability` drives the "Sold out" badge and excludes the row from the cheapest
claim — you cannot buy it — while still showing its price.

### Migration 017 — `price_observations`

Append-only. One row per (source, check) where the check succeeded.

```sql
CREATE TABLE IF NOT EXISTS price_observations (
  id            BIGSERIAL PRIMARY KEY,
  model_id      UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

  -- Exactly one of these is set. A CHECK enforces it rather than trusting
  -- callers, because a row belonging to neither source is unattributable and
  -- silently pollutes every range we compute from this table.
  retailer_id   UUID REFERENCES retailers(id) ON DELETE SET NULL,
  ebay_item_id  TEXT,

  price         NUMERIC NOT NULL CHECK (price > 0),
  currency      TEXT NOT NULL,
  price_aud     NUMERIC NOT NULL CHECK (price_aud > 0),

  in_stock      BOOLEAN,
  is_preorder   BOOLEAN,
  availability  TEXT,

  observed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT observation_has_one_source CHECK (
    (retailer_id IS NOT NULL AND ebay_item_id IS NULL) OR
    (retailer_id IS NULL AND ebay_item_id IS NOT NULL)
  )
);

CREATE INDEX price_observations_model_time_idx
  ON price_observations (model_id, observed_at DESC);
```

Notes on the shape:

- **`price > 0` and `price_aud > 0` as CHECKs, not conventions.** A zero price is
  always a failed extraction, and this table feeds min/max — one zero makes every
  "lowest ever" wrong forever, and unlike `price_history` there is no overwrite
  to correct it.
- **`ebay_item_id` is a plain column, not an FK.** Listings get deleted when they
  404; the observation of a price that WAS real should survive that. An FK would
  either cascade the history away or block the delete.
- **`retailer_id` is `ON DELETE SET NULL`,** same reasoning — losing a retailer
  record should not erase the prices we saw there. `model_id` DOES cascade,
  because an observation with no model is meaningless.
- **No unique constraint.** Two observations of the same thing on the same day
  are a duplicate reading, not a conflict, and de-duplication is a read-time or
  pruning concern.

## The jobs

### A. `refresh-ebay` — new route, mirrors `refresh-prices`

Reuse the existing pattern exactly, including **plan mode**: the route returns an
ordered list of ids and the admin UI walks it in small batches. That is how the
retailer refresh avoids `maxDuration`, and eBay needs it for the same reason —
430 listings today, and the retailer sweep already hit that wall.

Per listing: `GET /buy/browse/v1/item/v1|<id>|0`, then

| result | action |
|---|---|
| 200, price within 2% of stored | stamp `last_checked_at` only |
| 200, price moved >2% | update `price`, `price_aud`, `last_updated`, stamp checked |
| 200, not IN_STOCK | set `availability`, keep price, exclude from cheapest |
| 404 | delete the row (see below) |
| other error | count as failed, change nothing |

**The 2% threshold is not cosmetic.** Measured drift across 64 listings: median
**0.2%**, p90 1.6%, 33 of 36 changes under 2%. That is eBay's daily currency
conversion on USD/GBP listings, not sellers repricing — only 2 of 64 moved for
real. Without a threshold every run rewrites nearly every row and `last_updated`
stops meaning anything. `last_checked_at` always updates; that is the point.

**Every successful check also inserts a `price_observations` row**, including the
"unchanged" case — a confirmed unchanged price is a real observation and the most
common one.

### B. 404 handling — delete, and why that is now safe

A dead listing gets deleted. Three reasons:

1. We cannot label it. Sold, expired and delisted are the same 404.
2. The link is broken, so keeping it sends a visitor to "this listing has ended".
3. Its price survives in `price_observations`, which is the actual thing worth
   keeping.

The old objection was that deleting a model's only eBay link empties its page.
That mattered when a model held one listing; 21 models now hold several and that
grows with each scope applied. At the measured turnover (1 in 54 over ten days,
listings living 231 days median) a model rarely loses its only listing before the
next batch search finds a replacement.

**Sold-out-but-listed rows are capped at 3 per model**, newest kept. Unbuyable
rows should not crowd out buyable ones. At this turnover the cap will be dormant
for a long time, but bounding it now is cheaper than discovering the pile later.

### C. Retailer refresh also records observations

One insert added to `refresh-prices`, in both the "updated" and "unchanged"
branches. This is what makes the series cover retailers too, and retailers are
where most of the data is — 1,151 links against 430.

## Sequencing

1. **Migration 016** (`availability` on `ebay_links`) — small, additive.
2. **Migration 017** (`price_observations`) — additive, nothing reads it yet.
3. **`refresh-ebay` with plan mode**, writing observations from the first run.
4. **One insert into `refresh-prices`** so retailer checks are recorded too.
5. **Run it.** Freshness problem solved, series starts accumulating.
6. **Display — later, deliberately.** Nothing worth showing exists until there
   are several observations per model across weeks.

Steps 1–5 are what actually needs doing before 6 September. Step 6 can wait
months and should.

## Cost

- **API**: 430 calls per eBay pass, Browse allows 5,000/day. Not a constraint.
- **Time**: ~0.3s per listing, so ~2 minutes for a full eBay pass, batched by
  the UI so no single request is long.
- **Storage**: 1,581 links, so ~1,600 rows per full pass. Weekly is ~82k rows a
  year, on the order of 8MB. Irrelevant at this scale.
- **Reads must be paged from day one.** PostgREST caps a plain `.select()` at
  1000 rows silently, `price_history` already crossed it, and an observations
  table crosses it in the first month. Use `lib/selectAll.ts`.

## Open decisions

**How often to observe.** Weekly gives ~52 points a year and keeps freshness
comfortable. Monthly only just clears the staleness cliff and yields 12 points —
thin for a trend, and one missed run means stale prices on the site. **Recommend
weekly.**

**Manual or scheduled.** A button matches how this project is worked and mirrors
"Refresh All Retailers". But the staleness cliff recurs every 30 days forever, so
manual means remembering it monthly for the life of the site. **Recommend a
button now, cron once the job has proven itself.**

**Pruning.** Not needed for years at this size. **Recommend deciding not to
build it**, and recording that decision here so it is deliberate rather than
forgotten.

## What this plan deliberately does not do

- **No fake sold data.** No "Sold for X" anywhere, because the API cannot support
  it.
- **No backfill.** There is one data point per link today and no way to invent
  earlier ones. The series starts now; that is the cost of not having started
  sooner and cannot be paid retroactively.
- **No charts.** A range — "seen between AUD 124 and 426 over 6 months" — is
  most of the value and needs no new UI concepts.
- **No Marketplace Insights application.** Possible later, worth revisiting if
  genuine sold data becomes the point, but it is a dependency on eBay's approval
  and would not change the schema above.
