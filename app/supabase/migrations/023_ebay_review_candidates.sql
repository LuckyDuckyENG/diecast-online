-- The eBay matches a person has to judge, kept instead of thrown away.
--
-- WHAT WAS HAPPENING
--
-- batch-ebay-search produces two kinds of match. A listing whose title prints
-- the model's part number is written straight to ebay_links; every auto-linked
-- row on the site has one, 5,025 of 5,025. The other kind names the race and
-- the driver but no part number, and must never write itself: inside a search
-- group every model shares chassis, scale, year and manufacturer and differs
-- ONLY by race, so a wrong link made that way is indistinguishable from a
-- right one.
--
-- Those went into the API response and nowhere else. The pass over every
-- season on 2026-09-28 produced about 625 of them and discarded all 625 when
-- the panel closed. Getting them back costs a full re-run against eBay.
--
-- WHY REJECTION IS A COLUMN AND NOT A DELETE
--
-- This is the decision the whole table turns on. A rejected candidate that is
-- deleted comes back on the next search, identical, for ever — the queue
-- refills as fast as it is emptied and no amount of work reduces it. Keeping
-- the "no" is what makes this a queue rather than a treadmill.
--
-- It also records something real. "This listing looked like that model and is
-- not" is a judgement worth having, and a second opinion later can read it.

create table if not exists ebay_review_candidates (
  id            uuid primary key default gen_random_uuid(),

  model_id      uuid not null references models(id) on delete cascade,

  -- The listing. Same shape as ebay_links so accepting is a copy, not a
  -- translation -- a mismatch between the two would be a bug that only
  -- appears at the moment of writing, which is the worst time to find it.
  ebay_item_id  text not null,
  ebay_url      text,
  ebay_title    text,
  ebay_image    text,
  ebay_price    text,
  currency      text,
  price_aud     numeric,
  marketplace   text,
  item_condition text,
  seller        text,

  -- Which rule matched, and the sentence shown to the person deciding.
  -- `reason` is not decoration: a candidate demoted for being far above its
  -- car's median price says so here, and accepting it anyway should be a
  -- choice made in full view rather than a click on an unexplained row.
  tier          text,
  reason        text,

  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected')),

  -- When the search found it. A listing can sell or vanish between being
  -- found and being judged, so the age of a candidate is part of reading it.
  found_at      timestamptz not null default now(),
  decided_at    timestamptz
);

-- One row per (model, listing). This is what lets a re-run recognise a
-- candidate it has already offered, which is what makes a stored rejection
-- mean anything.
create unique index if not exists ebay_review_candidates_model_item_idx
  on ebay_review_candidates (model_id, ebay_item_id);

-- Drives the queue itself. Partial, because pending is the only status
-- anything reads in bulk and it shrinks as the queue is worked.
create index if not exists ebay_review_candidates_pending_idx
  on ebay_review_candidates (found_at)
  where status = 'pending';

-- Admin bookkeeping, not catalogue data: RLS on with no policy makes it
-- invisible to the browser while server code using the service key is
-- unaffected. Same treatment as ebay_search_log and the other private tables.
alter table ebay_review_candidates enable row level security;

-- Confirm
select
  (select count(*) from ebay_review_candidates)                          as rows,
  (select count(*) from information_schema.tables
     where table_name = 'ebay_review_candidates')                        as table_exists,
  (select relrowsecurity from pg_class
     where relname = 'ebay_review_candidates')                           as rls_on;
