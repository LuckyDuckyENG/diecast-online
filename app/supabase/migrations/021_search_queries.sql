-- What people searched for, and whether it found anything.
--
-- The point of this table is the rows where `results` is 0. A search that
-- returns nothing is a visitor stating, in their own words, what they wanted
-- and the catalogue did not have -- which is a better answer to "what should I
-- build next" than guessing at the next season, and far faster than SEO, whose
-- feedback loop runs to months.
--
-- WHY A TABLE AND NOT ANALYTICS. Page views are bought rather than built:
-- Vercel measures them at the edge, filters bots, and costs the database
-- nothing. Custom events would have covered searches too, but they are
-- excluded from the Hobby plan and cost USD 20/month on Pro. A table costs
-- effectively nothing and gives proper SQL over the result, which is better
-- than a dashboard panel would have been for ranking thousands of distinct
-- strings.
--
-- One row per search, not per page view, so the write volume is small.

create table if not exists search_queries (
  id          uuid primary key default gen_random_uuid(),

  -- Lower-cased and trimmed by the caller so "Senna" and "senna " group, and
  -- capped at 80 characters so a pasted paragraph cannot become an unbounded
  -- value. Nothing anyone genuinely searches for is longer.
  query       text        not null,

  -- How many cars came back. 0 is the interesting case.
  results     integer     not null,

  -- Country only, from the hosting layer's own header. Deliberately not city:
  -- country informs a real decision (is it worth localising currency) while
  -- city informs none, and city combined with a timestamp and a distinctive
  -- query starts to narrow towards identifying a person.
  country     text,

  -- Set when the user agent looks automated. Recorded rather than dropped, so
  -- the filtering rule can be revisited without having lost the rows it
  -- excluded.
  is_bot      boolean     not null default false,

  created_at  timestamptz not null default now()
);

-- Ranking recent searches, and the empty ones specifically.
create index if not exists search_queries_created_idx
  on search_queries (created_at desc);

create index if not exists search_queries_empty_idx
  on search_queries (query)
  where results = 0 and is_bot = false;

-- RETENTION: ninety days.
--
-- Nothing here is personal, but the default retention for any log is "for
-- ever", which is how a modest table quietly becomes something that has to be
-- thought about. Ninety days answers "what should I build next" perfectly well
-- and keeps the question of what is in here simple.
--
-- Run periodically:
--   delete from search_queries where created_at < now() - interval '90 days';

alter table search_queries enable row level security;

-- Written only by the server, using the service role, which bypasses RLS.
-- No policy is granted to anon or authenticated, so the table is not readable
-- or writable from the browser.
