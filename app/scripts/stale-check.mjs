/**
 * How much of the price data the site will still quote, and for how long.
 *
 *   node scripts/stale-check.mjs
 *
 * Read-only. Writes nothing, touches nothing.
 *
 * WHY THIS IS THE FIRST THING TO RUN BEFORE ANY OUTREACH
 *
 * The site refuses to quote a price older than STALE_DAYS (30, lib/freshness.ts)
 * and shows "Check price on site" instead. That is the right call -- a stale
 * price is worse than no price -- but it means the site's entire claim decays
 * on a timer whether anyone is looking or not.
 *
 * Sending people to a catalogue that has gone quiet is worse than not sending
 * them, because the one thing it is for is the one thing it would not be
 * doing. This answers "is it safe to invite people in" with a number instead
 * of a guess.
 *
 * STATUS-SUMMARY proposed this script on 2026-09-28 and it was never built;
 * the staleness figures quoted since have all been one-off queries.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const STALE_DAYS = 30;
const DAY = 86_400_000;
const now = Date.now();

/**
 * Pages every select. PostgREST caps .select() at 1000 rows silently, which
 * has produced wrong answers in this repo four times in one day.
 */
const page = async (table, cols, tweak) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols);
    if (tweak) q = tweak(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const [retailers, prices, ebay] = await Promise.all([
  page('retailers', 'id, name'),
  page('price_history', 'retailer_id, last_checked_at, in_stock'),
  page('ebay_links', 'last_checked_at').catch(() => []),
]);

const nameOf = new Map(retailers.map((r) => [r.id, r.name]));
const ageDays = (ts) => (ts ? (now - new Date(ts).getTime()) / DAY : Infinity);

function summarise(label, rows) {
  if (!rows.length) { console.log(`\n${label}: no rows\n`); return; }
  const ages = rows.map((r) => ageDays(r.last_checked_at)).sort((a, b) => a - b);
  const stale = ages.filter((a) => a > STALE_DAYS).length;
  const live = rows.length - stale;

  // When the rest expires, in buckets a person can act on.
  const within = (d) => ages.filter((a) => a <= STALE_DAYS && STALE_DAYS - a <= d).length;

  console.log(`\n${label}`);
  console.log(`  rows                  ${rows.length.toLocaleString()}`);
  console.log(`  QUOTED NOW            ${live.toLocaleString()} (${Math.round((live / rows.length) * 100)}%)`);
  console.log(`  already stale         ${stale.toLocaleString()} (${Math.round((stale / rows.length) * 100)}%)`);
  console.log(`  newest / oldest       ${ages[0].toFixed(1)} / ${ages[ages.length - 1].toFixed(1)} days old`);
  console.log(`  expires within  3d    ${within(3).toLocaleString()}`);
  console.log(`                  7d    ${within(7).toLocaleString()}`);
  console.log(`                 14d    ${within(14).toLocaleString()}`);
}

summarise('RETAILER PRICES (price_history)', prices);
summarise('EBAY LISTINGS (ebay_links)', ebay);

/** Per shop, worst first. A shop that has gone dark is the actionable unit. */
const byShop = new Map();
for (const p of prices) {
  const k = p.retailer_id;
  if (!byShop.has(k)) byShop.set(k, { live: 0, stale: 0, oldest: 0, newest: Infinity });
  const s = byShop.get(k);
  const a = ageDays(p.last_checked_at);
  if (a > STALE_DAYS) s.stale++; else s.live++;
  s.oldest = Math.max(s.oldest, a);
  s.newest = Math.min(s.newest, a);
}

const shops = [...byShop.entries()]
  .map(([id, s]) => ({ name: nameOf.get(id) || id, ...s, total: s.live + s.stale }))
  .sort((a, b) => b.stale - a.stale || b.total - a.total);

const hurting = shops.filter((s) => s.stale > 0);
console.log(`\nSHOPS WITH STALE ROWS  (${hurting.length} of ${shops.length})`);
if (!hurting.length) {
  console.log('  none');
} else {
  console.log(`  ${'shop'.padEnd(30)} ${'stale'.padStart(6)} ${'live'.padStart(6)} ${'oldest'.padStart(7)}`);
  for (const s of hurting.slice(0, 15)) {
    console.log(`  ${s.name.slice(0, 30).padEnd(30)} ${String(s.stale).padStart(6)} ${String(s.live).padStart(6)} ${s.oldest.toFixed(0).padStart(6)}d`);
  }
}

/**
 * The shops due to expire soonest, which is the actual scheduling question:
 * a sweep is hours long, so it has to start before the cliff, not on it.
 */
const soon = shops
  .filter((s) => s.live > 0)
  .map((s) => ({ ...s, daysLeft: STALE_DAYS - s.newest }))
  .sort((a, b) => a.daysLeft - b.daysLeft)
  .slice(0, 8);

console.log(`\nEXPIRING SOONEST  (days until a shop's FRESHEST row goes stale)`);
console.log(`  ${'shop'.padEnd(30)} ${'left'.padStart(6)} ${'rows'.padStart(6)}`);
for (const s of soon) {
  console.log(`  ${s.name.slice(0, 30).padEnd(30)} ${s.daysLeft.toFixed(0).padStart(5)}d ${String(s.total).padStart(6)}`);
}

console.log(`
  QUOTED NOW is the number that matters: it is what a visitor sees as a real
  price instead of "Check price on site".

  Retailer sweep is about three hours from localhost. Run scripts/fetch-fx.mjs
  first. SPR Models is NOT in the sweep and needs scripts/spr-fetch.mjs plus
  spr-import.mjs; see TODO-TOMORROW.md.
`);
