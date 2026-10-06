/**
 * Explain what a gaps-only sweep would actually link, before anything is written.
 *
 *   node scripts/sweep-explain.mjs --port 3115
 *
 * The summary table from sweep-gaps.mjs says how MANY links a sweep would add.
 * It does not say which models, and the reason for running one at all is a
 * specific claim: that shops stock the 2010-2012 models, which sit at 0
 * retailer links out of 78. A sweep that piles links onto 2021-2026, already at
 * 96% coverage, would be useful and would not answer that question.
 *
 * Also surfaces the two things that would make applying unsafe:
 *
 *   - new links at a shop whose currency is DISPUTED (declared vs established).
 *     A wrong currency is not a small error: HKD->AUD is ~0.19, so a price is
 *     out by 5x and feeds the "cheapest" claim. The 2026-08-12 audit corrected
 *     35 links and deleted 3 for exactly this.
 *   - why rows land in `review`, grouped by the guard that refused them.
 *
 * Per-shop counts are printed so one run can be diffed against another. Two dry
 * runs over an unchanged catalogue MUST agree; when they first did not, the
 * cause was a dev server whose Turbopack cache had corrupted mid-run, and the
 * numbers from the degrading half were nonsense. Reproducibility is the check
 * that catches that.
 *
 * Writes nothing. There is no apply path in this file.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i > -1 ? process.argv[i + 1] : '3000';
})();
const BASE = `http://localhost:${PORT}/api/admin/sweep-retailer`;

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const page = async (t, cols) => {
  const out = []; let from = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select(cols).range(from, from + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    out.push(...data); if (data.length < 1000) break; from += 1000;
  }
  return out;
};

const [models, cars, seasons] = await Promise.all([
  page('models', 'id, car_id, image_url'),
  page('cars', 'id, season_id'),
  page('seasons', 'id, year'),
]);
const Y = new Map(seasons.map(s => [s.id, s.year]));
const carYear = new Map(cars.map(c => [c.id, Y.get(c.season_id)]));
const modelYear = new Map(models.map(m => [m.id, carYear.get(m.car_id)]));

const era = y =>
  y == null ? 'unknown' :
  y >= 2021 ? '2021-2026' : y >= 2013 ? '2013-2020' : y >= 2010 ? '2010-2012' :
  y >= 1995 ? '1995-2009' : 'pre-1995';

const list = await (await fetch(BASE)).json();
if (!list.retailers) {
  console.error(`No retailer list from ${BASE}: ${JSON.stringify(list).slice(0, 200)}`);
  process.exit(1);
}
const targets = list.retailers.filter(r => r.sweepable);

const newByEra = {};
const reviewByReason = {};
const riskyShops = [];
const perShop = [];
const newModelIds = new Set();
const brokenShops = [];
let done = 0;

for (const t of targets) {
  let offset = 0, passes = 0, shopNew = 0, shopReview = 0;

  for (;;) {
    let d = null;
    try {
      const r = await fetch(BASE, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retailerId: t.id, dryRun: true, gapsOnly: true, offset }),
      });
      const text = await r.text();
      // A non-JSON body means the server itself failed, which is NOT the same
      // as a shop with nothing to offer. Recorded, so a degrading server can
      // never again look like a clean result.
      try { d = JSON.parse(text); }
      catch { brokenShops.push([t.name, `${r.status} non-JSON: ${text.slice(0, 60)}`]); break; }
    } catch (e) {
      brokenShops.push([t.name, e.message.slice(0, 60)]);
      break;
    }

    if (d.error) { brokenShops.push([t.name, String(d.details || d.error).slice(0, 60)]); break; }
    if (!d.feed) break;
    passes++;

    const fresh = (d.matches || []).filter(m => m.action === 'new');
    shopNew += fresh.length;
    for (const m of fresh) {
      newModelIds.add(m.modelId);
      const e = era(modelYear.get(m.modelId));
      newByEra[e] = (newByEra[e] || 0) + 1;
    }

    for (const m of (d.matches || []).filter(m => m.action === 'review')) {
      shopReview++;
      // Grouped by the guard rather than the full sentence, so hundreds of rows
      // collapse to a handful of causes.
      const key = String(m.reason || 'unstated').replace(/[0-9][0-9.,]*/g, 'N').slice(0, 64);
      reviewByReason[key] = (reviewByReason[key] || 0) + 1;
    }

    if (fresh.length && d.currencyDisputed) {
      riskyShops.push({
        shop: t.name, count: fresh.length, declared: d.declaredCurrency,
        established: d.establishedCurrency, using: d.currency,
      });
    }

    const next = d.feed.nextOffset;
    if (next == null || next === offset || passes >= 40) break;
    offset = next;
  }

  perShop.push([t.name, shopNew, shopReview, passes]);
  done++;
  process.stderr.write(`\r  ${done}/${targets.length} shops`);
}
process.stderr.write('\n\n');

console.log('PER SHOP (diff this against the previous run; they must agree)');
for (const [name, n, rev, passes] of perShop) {
  if (!n && !rev) continue;
  console.log(`  ${name.slice(0, 26).padEnd(26)} new ${String(n).padStart(4)} · review ${String(rev).padStart(4)} · ${passes} pass${passes === 1 ? '' : 'es'}`);
}
console.log(`  ${'TOTAL'.padEnd(26)} new ${String(perShop.reduce((a, r) => a + r[1], 0)).padStart(4)} · review ${String(perShop.reduce((a, r) => a + r[2], 0)).padStart(4)}`);

console.log('\nWHICH ERAS THOSE NEW LINKS COVER');
for (const k of ['pre-1995', '1995-2009', '2010-2012', '2013-2020', '2021-2026', 'unknown']) {
  if (newByEra[k]) console.log(`  ${k.padEnd(11)} ${String(newByEra[k]).padStart(4)}`);
}
console.log(`  distinct models: ${newModelIds.size}`);

// The question that prompted the sweep.
const m1012 = models.filter(m => { const y = modelYear.get(m.id); return y >= 2010 && y <= 2012; });
console.log(`\n2010-2012: ${m1012.filter(m => newModelIds.has(m.id)).length} of ${m1012.length} models would get their FIRST retailer link`);

console.log('\nNEW LINKS AT A SHOP WITH A DISPUTED CURRENCY');
if (!riskyShops.length) console.log('  none');
for (const r of riskyShops) {
  console.log(`  ${r.shop.padEnd(24)} ${String(r.count).padStart(4)} links · declared ${r.declared} · established ${r.established} · WOULD USE ${r.using}`);
}

console.log('\nWHY ROWS GO TO REVIEW');
for (const [k, v] of Object.entries(reviewByReason).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

if (brokenShops.length) {
  console.log('\nSHOPS THAT FAILED (not the same as finding nothing)');
  for (const [name, why] of brokenShops) console.log(`  ${name}: ${why}`);
} else {
  console.log('\nevery shop responded cleanly');
}
