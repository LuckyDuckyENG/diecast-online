-- Whether anyone actually leaves for a shop.
--
-- This is the gap nothing else closes. Page views say someone looked at a car;
-- they cannot separate "found a good price and went to buy it" from "looked,
-- was not convinced, and left". Those are opposite outcomes and they are
-- identical in every other measurement on this site.
--
-- It is also the only measurement that speaks to whether the PRICE COMPARISON
-- works, as opposed to whether the catalogue is being read. `was_cheapest`
-- exists for exactly that: if people overwhelmingly click the cheapest option,
-- the ranking is doing its job. If they do not, the reason is worth knowing --
-- postage, brand preference, or a layout that buries the best price.
--
-- Added before the traffic arrives, deliberately. Instrumentation cannot be
-- backfilled: a week not recorded is a week that can never be asked about.

create table if not exists outbound_clicks (
  id            uuid primary key default gen_random_uuid(),

  -- Which model was being looked at. Nullable rather than a foreign key: a
  -- click is worth keeping even if the model is later merged or deleted, and
  -- a cascade would quietly erase the evidence that someone wanted it.
  model_id      uuid,

  -- The page it happened on, so a click survives the model going away.
  car_slug      text,

  -- Which shop, by name rather than id, for the same reason.
  retailer      text,

  -- 'shop' or 'ebay'. eBay links carry affiliate tracking and shop links do
  -- not, so this separates the commercial question from the useful one.
  kind          text        not null default 'shop',

  -- What the visitor saw at the moment they clicked, in AUD. Recorded because
  -- prices move, and a click is only interpretable against the number that
  -- was actually on screen.
  price_aud     numeric,

  -- Was this the cheapest option shown for that model? The single most
  -- informative column here.
  was_cheapest  boolean,

  country       text,
  is_bot        boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists outbound_clicks_created_idx
  on outbound_clicks (created_at desc);

create index if not exists outbound_clicks_model_idx
  on outbound_clicks (model_id)
  where is_bot = false;

-- RETENTION: ninety days, matching search_queries.
--   delete from outbound_clicks where created_at < now() - interval '90 days';

alter table outbound_clicks enable row level security;

-- Written only by the server via the service role, which bypasses RLS. No
-- policy for anon or authenticated, so the browser can neither read nor write.
