-- Which PAGE the click happened on, as opposed to which car it was about.
--
-- WHAT WAS MISSING
--
-- outbound_clicks already stores car_slug, and its comment calls it "the page
-- it happened on". It is not. Both writers pass the CAR's slug:
--
--   SavingsList.tsx   carSlug: r.carSlug
--   CarDetail.tsx     carSlug: car.slug
--
-- So a click from /savings and a click from that car's own page produce
-- identical rows. The two cannot be told apart afterwards by any query.
--
-- WHY THAT MATTERS NOW
--
-- /savings was reachable only from the desktop navbar until 2026-10-04, so it
-- had one visitor against 51 on car pages. That is not evidence the page is
-- unwanted; nobody on a phone could reach it, and 71% of visitors are on a
-- phone. The question "is the best-prices page worth it" is open, and the
-- measurement that would settle it is whether clicks arrive from it.
--
-- Without this column that question stays unanswerable no matter how long the
-- data is left to accumulate. Added BEFORE the car-page affordance work, so
-- the clicks that change is meant to produce land somewhere they can be
-- attributed.
--
-- WHAT IT IS NOT
--
-- Not a referrer and not a session. It is the surface the link was rendered
-- on, which the component already knows for certain at the moment of the
-- click. A referrer header would be the page the visitor came from, which is
-- a different fact, and sessions are not recorded here at all.

alter table outbound_clicks
  add column if not exists source text;

comment on column outbound_clicks.source is
  'Which page the link was rendered on: car | savings. Null for rows written before 2026-10-05.';

-- Pending rows keep null rather than a guess. Every click recorded so far
-- predates /savings being reachable on mobile, and all 12 of them are
-- overwhelmingly likely to be car-page clicks -- but "overwhelmingly likely"
-- is not a measurement, and backfilling it would launder an assumption into
-- the record the table exists to keep honest.

create index if not exists outbound_clicks_source_idx
  on outbound_clicks (source, created_at desc)
  where is_bot = false;

-- Confirm
select
  (select count(*) from outbound_clicks)                      as rows,
  (select count(*) from outbound_clicks where source is null) as unattributed,
  (select count(*) from information_schema.columns
     where table_name = 'outbound_clicks' and column_name = 'source') as column_exists;
