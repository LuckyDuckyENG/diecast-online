/**
 * Is each shop's price believable? Compare it to everyone else selling the same model.
 *
 *   node scripts/price-quality.mjs
 *   node scripts/price-quality.mjs --shop "car model"     # rows for one shop
 *
 * WHY THIS EXISTS
 *
 * Planning a "biggest savings" page surfaced the problem it would have shipped
 * with: such a page ranks by the size of a gap, so ANY shop whose prices are
 * too high owns the top of it, whether or not the price is real. Car Model
 * Store sits at 1.73x every other shop on the same models. We store GBP 177 for
 * a Spark 1:43 the shop actually sells at GBP 79.99.
 *
 * The same distortion is already live in quieter places: it inflates the top of
 * every price range on a car page, and it decides which shop looks dearest.
 *
 * HOW IT JUDGES
 *
 * Per model, per shop: that shop's price divided by the MEDIAN of the other
 * shops selling the same model. Then the median of those ratios per shop. A
 * shop pricing normally lands near 1.0. The comparison is against a median
 * rather than a mean so one broken shop cannot drag the baseline it is being
 * judged against.
 *
 * This is a detector, not a fix. It says a shop's prices disagree with the
 * market; it cannot say whether the cause is currency, a stale sweep, a
 * mismatched SKU or genuinely premium retail. Those need a human and the shop's
 * own page - which is why flagged shops print sample URLs to check.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not write. An automatic "correction" here would be a rule applied to
 * data it cannot see the cause of, and this codebase has been bitten every time
 * a derived value overruled an observed one.
 */

import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !line.startsWith('#')) process.env[m[1]] = m[2].trim();
}

const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Fewer comparisons than this and the ratio is noise, not a signal. */
const MIN_OVERLAP = 15;
/** Outside this band a shop is out of step with everyone selling the same thing. */
const LOW = 0.6;
const HIGH = 1.5;

const args = process.argv.slice(2);
const only = args.includes('--shop') ? args[args.indexOf('--shop') + 1] : null;

async function page(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const median = xs => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const [rows, retailers, models, cars, seasons, drivers] = await Promise.all([
  page('price_history', 'model_id, retailer_id, price, price_aud, currency, in_stock, is_preorder, last_checked_at, product_url'),
  page('retailers', 'id, name, url, currency'),
  page('models', 'id, car_id, manufacturer_sku, scale, manufacturers(name)'),
  page('cars', 'id, slug, season_id, driver_id'),
  page('seasons', 'id, year'),
  page('drivers', 'id, name'),
]);

const R = new Map(retailers.map(r => [r.id, r]));
const M = new Map(models.map(m => [m.id, m]));
const C = new Map(cars.map(c => [c.id, c]));
const Y = new Map(seasons.map(s => [s.id, s.year]));
const D = new Map(drivers.map(d => [d.id, d.name]));

// Only prices the site would actually quote. Judging on prices we hide anyway
// would flag shops for rows no visitor ever sees.
const live = rows.filter(r => Number(r.price_aud) > 0 && r.in_stock !== false && r.is_preorder !== true);

const byModel = new Map();
for (const r of live) {
  if (!byModel.has(r.model_id)) byModel.set(r.model_id, []);
  byModel.get(r.model_id).push(r);
}

const ratios = new Map();
const samples = new Map();
for (const [, rs] of byModel) {
  if (rs.length < 2) continue;
  for (const r of rs) {
    const others = rs.filter(x => x.retailer_id !== r.retailer_id).map(x => Number(x.price_aud));
    if (!others.length) continue;
    const base = median(others);
    if (!(base > 0)) continue;
    const ratio = Number(r.price_aud) / base;
    if (!ratios.has(r.retailer_id)) { ratios.set(r.retailer_id, []); samples.set(r.retailer_id, []); }
    ratios.get(r.retailer_id).push(ratio);
    samples.get(r.retailer_id).push({ r, base, ratio });
  }
}

console.log('Each shop priced against the median of every other shop selling the SAME model.');
console.log('1.00 = in step. Judged on prices the site would quote.\n');
console.log('  shop                       n    ratio   declared  currency rows disagreeing');

const report = [];
for (const [id, rs] of ratios) {
  if (rs.length < MIN_OVERLAP) continue;
  const shop = R.get(id);
  const mine = live.filter(r => r.retailer_id === id);
  const disagree = mine.filter(r => r.currency && shop?.currency && r.currency !== shop.currency).length;
  report.push({ id, name: shop?.name, n: rs.length, ratio: median(rs), declared: shop?.currency, disagree, total: mine.length });
}

for (const x of report.sort((a, b) => b.ratio - a.ratio)) {
  const flag = x.ratio > HIGH ? '  <-- TOO HIGH' : x.ratio < LOW ? '  <-- TOO LOW' : '';
  console.log(
    `  ${String(x.name).padEnd(24)} ${String(x.n).padStart(4)}   ${x.ratio.toFixed(2)}     ` +
    `${String(x.declared || '-').padEnd(8)}  ${x.disagree}/${x.total}${flag}`
  );
}

const flagged = report.filter(x => x.ratio > HIGH || x.ratio < LOW);
console.log(`\n${flagged.length} shop(s) out of step.`);
console.log(`(shops with fewer than ${MIN_OVERLAP} shared models are not judged — too little overlap)`);

for (const f of flagged) {
  console.log(`\n${f.name} — median ${f.ratio.toFixed(2)}x. Open these and compare:`);
  const worst = samples.get(f.id).sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1)).slice(0, 5);
  for (const s of worst) {
    const m = M.get(s.r.model_id), c = C.get(m?.car_id);
    console.log(`   we hold ${String(s.r.currency || '?').padEnd(4)} ${String(Number(s.r.price).toFixed(2)).padStart(9)}` +
      ` -> AUD ${String(Number(s.r.price_aud).toFixed(2)).padStart(8)}   others ~AUD ${s.base.toFixed(2)}   ${(s.ratio).toFixed(2)}x`);
    console.log(`      ${m?.scale} ${m?.manufacturers?.name} ${m?.manufacturer_sku} — ${Y.get(c?.season_id)} ${D.get(c?.driver_id)}`);
    console.log(`      ${s.r.product_url || '(no url)'}`);
  }
}

if (only) {
  const shop = retailers.find(r => r.name.toLowerCase().includes(only.toLowerCase()));
  if (shop) {
    const mine = live.filter(r => r.retailer_id === shop.id);
    console.log(`\nAll ${mine.length} live prices at ${shop.name}:`);
    const counts = {};
    for (const r of mine) counts[Number(r.price).toFixed(2)] = (counts[Number(r.price).toFixed(2)] || 0) + 1;
    const repeated = Object.entries(counts).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
    console.log(`  distinct prices: ${Object.keys(counts).length}`);
    if (repeated.length) {
      console.log('  prices repeated across products (a sign the feed gave one number for many):');
      for (const [p, n] of repeated.slice(0, 8)) console.log(`     ${p} x${n}`);
    }
  }
}
