/**
 * Link the models a retailer stocks that we have no link for. Start it, walk away.
 *
 *   node scripts/sweep-gaps.mjs                    # list retailers
 *   node scripts/sweep-gaps.mjs livecarmodel       # dry run, match on name
 *   node scripts/sweep-gaps.mjs livecarmodel --apply
 *
 * WHY THIS EXISTS
 *
 * The admin sweep is built to refresh prices, so its candidate list is every
 * model holding a SKU. For a sitemap shop that means one product fetch each:
 * 1,123 at LIVECARMODEL to reach the ~20 actually missing a link. The route
 * stops at a 240s budget and reports where it got to, so covering the shop
 * takes four passes — and the cursor lives in React state, so it resets if the
 * tab reloads, the retailer dropdown moves, or the mode switches between dry
 * run and apply. It never once finished: after a week, 807 of LIVECARMODEL's
 * links had not been re-read since the 8th.
 *
 * Two fixes, both here. `gapsOnly` narrows the candidates to the gaps, which
 * is one short pass instead of four long ones. And this loops the route itself,
 * feeding `nextOffset` back in, so there is no cursor in a browser to lose.
 *
 * The 240s budget is deliberately NOT raised. The route writes only after its
 * fetch loop, so a longer pass risks losing more when one dies. Short passes
 * that write as they go are the safe shape; this just removes the human from
 * between them.
 */

import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !line.startsWith('#')) process.env[m[1]] = m[2].trim();
}

const BASE = process.env.SWEEP_BASE_URL || 'http://localhost:3000';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const needle = args.find(a => !a.startsWith('--'));

/** One pass can legitimately return nothing new; two in a row means done. */
const MAX_PASSES = 12;

async function listRetailers() {
  const res = await fetch(`${BASE}/api/admin/sweep-retailer`);
  if (!res.ok) throw new Error(`${res.status} listing retailers — is the dev server up?`);
  const body = await res.json();
  return body.retailers || body || [];
}

async function main() {
  const retailers = await listRetailers();

  if (!needle) {
    console.log('Retailers:\n');
    for (const r of retailers) console.log(`  ${r.name}`);
    console.log('\nnode scripts/sweep-gaps.mjs <name> [--apply]');
    return;
  }

  const matches = retailers.filter(r => r.name.toLowerCase().includes(needle.toLowerCase()));
  if (matches.length !== 1) {
    console.error(matches.length ? `"${needle}" matches ${matches.length}: ${matches.map(m => m.name).join(', ')}` : `No retailer matching "${needle}"`);
    process.exit(1);
  }
  const retailer = matches[0];

  console.log(`${apply ? 'Linking gaps at' : 'DRY RUN —'} ${retailer.name}`);
  console.log(`${BASE}  ·  gapsOnly  ·  ${apply ? 'WRITES' : 'writes nothing'}\n`);

  let offset = 0, pass = 0;
  const totals = { new: 0, review: 0, hold: 0, refresh: 0, unchanged: 0, written: 0 };

  for (;;) {
    pass++;
    if (pass > MAX_PASSES) { console.log(`\nStopped at ${MAX_PASSES} passes — run again to continue.`); break; }

    const started = Date.now();
    const res = await fetch(`${BASE}/api/admin/sweep-retailer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retailerId: retailer.id, dryRun: !apply, gapsOnly: true, offset }),
    });

    if (!res.ok) {
      console.error(`pass ${pass}: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }

    const d = await res.json();
    const t = d.totals || {};
    for (const k of Object.keys(totals)) if (typeof t[k] === 'number') totals[k] += t[k];
    if (typeof d.written === 'number') totals.written += d.written;

    const secs = ((Date.now() - started) / 1000).toFixed(0);
    console.log(
      `pass ${String(pass).padStart(2)}  ${secs}s  ` +
      `matched ${String(t.matched ?? 0).padStart(4)}  new ${String(t.new ?? 0).padStart(3)}  ` +
      `review ${String(t.review ?? 0).padStart(3)}  hold ${String(t.hold ?? 0).padStart(3)}` +
      (d.feed?.truncated ? '   ⚠️ FEED TRUNCATED' : '')
    );

    if (d.message) console.log(`        ${d.message}`);

    const next = d.feed?.nextOffset;
    if (next == null) { console.log('\nShop covered.'); break; }
    if (next === offset) { console.log('\nOffset stopped advancing — stopping rather than looping.'); break; }
    offset = next;
  }

  console.log(
    `\ntotals — new ${totals.new}  review ${totals.review}  hold ${totals.hold}` +
    (apply ? `  written ${totals.written}` : '  (dry run, nothing written)')
  );
  if (!apply) console.log('Re-run with --apply to write them.');
}

main().catch(err => { console.error(err.message); process.exit(1); });
