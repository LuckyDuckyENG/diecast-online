/**
 * Re-read ONLY the prices the site has stopped quoting.
 *
 *   node scripts/refresh-stale.mjs                 # dry run, writes nothing
 *   node scripts/refresh-stale.mjs --apply
 *   node scripts/refresh-stale.mjs --days 25       # get ahead of the cliff
 *   node scripts/refresh-stale.mjs --shop "Anthony"
 *
 * Needs the dev server running, same as the sweep: it drives
 * /api/admin/refresh-prices, which is where the per-shop scraping lives.
 *
 * WHY THIS AND NOT THE SWEEP
 *
 * The sweep rediscovers links by matching model words against a shop's feed
 * URLs. That is the right tool for FINDING links, and the wrong one for
 * keeping them alive: on 2026-10-17 a full `--all` sweep refreshed 8 of
 * Anthony's Diecasts' 625 links and left 114 stale, because it only refreshes
 * what it re-matches.
 *
 * Those 114 were sampled by hand and every one was a live, in-stock product
 * page. So the site was saying "Check price on site" for models you could buy
 * that minute, and no amount of sweeping would have fixed it, because the
 * sweep was never reading those URLs.
 *
 * WHY NOT THE ADMIN BUTTON
 *
 * "Refresh retailer links" plans EVERY link: 8,330 of them, about three
 * seconds each, which is seven hours. The stale set is 128. Six minutes.
 * Same endpoint, same work per link, 65x less of it.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes('--apply');
const DAYS = Number(arg('days', 30));
const SHOP = arg('shop', null);
const PORT = arg('port', '3000');
const URL = `http://localhost:${PORT}/api/admin/refresh-prices`;

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

const [retailers, prices] = await Promise.all([
  page('retailers', 'id, name'),
  page('price_history', 'id, retailer_id, last_checked_at, product_url'),
]);
const nameOf = new Map(retailers.map(r => [r.id, r.name]));

const now = Date.now();
const ageDays = (ts) => (ts ? (now - new Date(ts).getTime()) / 86_400_000 : Infinity);

let targets = prices.filter(p => p.product_url && ageDays(p.last_checked_at) > DAYS);
if (SHOP) {
  targets = targets.filter(p => (nameOf.get(p.retailer_id) || '').toLowerCase().includes(SHOP.toLowerCase()));
}

if (!targets.length) {
  console.log(`Nothing older than ${DAYS} days${SHOP ? ` at shops matching "${SHOP}"` : ''}.`);
  process.exit(0);
}

/**
 * Interleaved by shop, so one retailer does not take 114 consecutive
 * requests. The API's own plan mode does this; doing it here keeps the same
 * courtesy when picking the rows ourselves.
 */
const byShop = new Map();
for (const t of targets) {
  if (!byShop.has(t.retailer_id)) byShop.set(t.retailer_id, []);
  byShop.get(t.retailer_id).push(t);
}
const ordered = [];
for (let i = 0; ordered.length < targets.length; i++) {
  for (const [, rows] of byShop) if (rows[i]) ordered.push(rows[i]);
}

console.log(`\n${targets.length} link(s) older than ${DAYS} days, across ${byShop.size} shop(s)\n`);
for (const [id, rows] of [...byShop.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const oldest = Math.max(...rows.map(r => ageDays(r.last_checked_at)));
  console.log(`  ${(nameOf.get(id) || id).slice(0, 28).padEnd(28)} ${String(rows.length).padStart(4)}   oldest ${oldest.toFixed(0)}d`);
}

if (!APPLY) {
  console.log(`\nDRY RUN. Roughly ${Math.ceil((targets.length * 3) / 60)} minutes to refresh.`);
  console.log('Re-run with --apply. The dev server must be running.');
  process.exit(0);
}

// Fail loudly and immediately rather than reporting every link as broken.
try {
  const probe = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: true, retailerId: targets[0].retailer_id }),
  });
  if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
} catch (e) {
  console.error(`\nCannot reach ${URL}\nStart the dev server first:  cd app && npm run dev`);
  process.exit(1);
}

let ok = 0, failed = 0;
for (let i = 0; i < ordered.length; i++) {
  const row = ordered[i];
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceHistoryId: row.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success !== false) ok++; else failed++;
  } catch {
    failed++;
  }
  if ((i + 1) % 10 === 0 || i === ordered.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${ordered.length}   ok ${ok}   failed ${failed}   `);
  }
}

console.log(`\n\nrefreshed ${ok}, failed ${failed}`);
console.log('Re-run scripts/stale-check.mjs to confirm.');
