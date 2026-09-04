/**
 * Pull today's reference rates into fx_rates.
 *
 *   node scripts/fetch-fx.mjs [--dry-run]
 *
 * Source is Frankfurter, which republishes the European Central Bank's daily
 * reference rates. Chosen for one reason above accuracy: it needs NO API KEY.
 * This repository has already had a service_role key committed to a public
 * GitHub repo, and a currency display is not worth another secret to leak.
 *
 * Run it before a refresh or a sweep. Those jobs write price_aud for thousands
 * of rows, and whatever rate is current when they run is the one baked into the
 * links people click.
 *
 * ECB publishes on working days only, so a weekend run stores Friday's rate
 * under Friday's date rather than inventing a Saturday one.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !l.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DRY = process.argv.includes('--dry-run');

/** Every currency a retailer quotes in. AUD is the target and needs no rate. */
const CURRENCIES = ['USD', 'EUR', 'GBP'];
const TARGET = 'AUD';
const SOURCE = 'ecb-frankfurter';

const rows = [];
for (const from of CURRENCIES) {
  const url = `https://api.frankfurter.app/latest?from=${from}&to=${TARGET}`;
  let json;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    // One currency failing must not lose the others. A partial update is fine:
    // rows are keyed by (day, base, quote), so the next run fills the gap.
    console.warn(`  ⚠️ ${from}: ${err.message} — skipped`);
    continue;
  }
  const rate = json?.rates?.[TARGET];
  if (!(rate > 0)) {
    console.warn(`  ⚠️ ${from}: no usable rate in the response — skipped`);
    continue;
  }
  rows.push({ as_of: json.date, base: from, quote: TARGET, rate, source: SOURCE });
  console.log(`  ${from} -> ${TARGET}  ${rate}   (ECB ${json.date})`);
}

if (!rows.length) {
  console.error('nothing fetched; fx_rates unchanged');
  process.exit(1);
}

// What the site is using right now, so the run says what it changed rather than
// just what it stored.
const { data: current } = await supabase
  .from('fx_rates')
  .select('base, rate, as_of')
  .eq('quote', TARGET)
  .order('as_of', { ascending: false });

const newest = new Map();
for (const r of current || []) if (!newest.has(r.base)) newest.set(r.base, r);

console.log('');
for (const r of rows) {
  const was = newest.get(r.base);
  if (!was) { console.log(`  ${r.base}: new`); continue; }
  const drift = ((r.rate - Number(was.rate)) / Number(was.rate)) * 100;
  console.log(
    `  ${r.base}: ${Number(was.rate).toFixed(4)} (${was.as_of}) -> ${r.rate.toFixed(4)} ` +
    `(${r.as_of})   ${drift >= 0 ? '+' : ''}${drift.toFixed(2)}%`
  );
}

if (DRY) {
  console.log('\nDRY RUN — pass no flag to write');
  process.exit(0);
}

// Same day, same pair, same fact: re-running must not create a second row.
const { error } = await supabase
  .from('fx_rates')
  .upsert(rows, { onConflict: 'as_of,base,quote' });

if (error) {
  console.error(`failed to write fx_rates: ${error.message}`);
  process.exit(1);
}
console.log(`\nstored ${rows.length} rate(s)`);
