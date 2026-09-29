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

/**
 * Currencies the SITE can display a price in, which is a different list and a
 * different direction.
 *
 * Ranking needs X -> AUD, because price_aud is what decides which shop is
 * cheapest. Display needs AUD -> X, because 73% of visitors are not Australian
 * and a price they have to convert in their head is a price they have to stop
 * and think about.
 *
 * Both directions are stored from ECB rather than one being inverted from the
 * other. 1/1.4237 is 1.42369..., and a display that disagrees with the ranking
 * in the fourth decimal place is a bug report waiting to be filed. The schema
 * is (as_of, base, quote), so holding both costs nothing but rows.
 *
 * Chosen from who actually visits, not from a list of world currencies: US,
 * Netherlands, Singapore and Italy were 73% of last week between them, plus
 * the obvious neighbours.
 */
const DISPLAY = ['USD', 'EUR', 'GBP', 'CAD', 'NZD', 'SGD', 'JPY'];

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

// The display direction, in ONE request — Frankfurter takes a list.
try {
  const url = `https://api.frankfurter.app/latest?from=${TARGET}&to=${DISPLAY.join(',')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  for (const to of DISPLAY) {
    const rate = json?.rates?.[to];
    if (!(rate > 0)) {
      console.warn(`  ⚠️ ${TARGET}->${to}: no usable rate — skipped`);
      continue;
    }
    rows.push({ as_of: json.date, base: TARGET, quote: to, rate, source: SOURCE });
    console.log(`  ${TARGET} -> ${to}  ${rate}   (ECB ${json.date})`);
  }
} catch (err) {
  // Display rates failing is survivable: the site falls back to showing AUD,
  // which is what it did before any of this existed. Ranking is unaffected
  // because that uses the rows above.
  console.warn(`  ⚠️ display rates: ${err.message} — skipped`);
}

if (!rows.length) {
  console.error('nothing fetched; fx_rates unchanged');
  process.exit(1);
}

// What the site is using right now, so the run says what it changed rather than
// just what it stored.
const { data: current } = await supabase
  .from('fx_rates')
  .select('base, quote, rate, as_of')
  .order('as_of', { ascending: false });

// Keyed by the PAIR. Keying on base alone was fine while everything quoted
// into AUD; now that AUD->X rows exist too, it would compare USD->AUD against
// AUD->USD and report nonsense drift.
const newest = new Map();
for (const r of current || []) {
  const k = `${r.base}/${r.quote}`;
  if (!newest.has(k)) newest.set(k, r);
}

console.log('');
for (const r of rows) {
  const was = newest.get(`${r.base}/${r.quote}`);
  if (!was) { console.log(`  ${r.base}->${r.quote}: new`); continue; }
  const drift = ((r.rate - Number(was.rate)) / Number(was.rate)) * 100;
  console.log(
    `  ${r.base}->${r.quote}: ${Number(was.rate).toFixed(4)} (${was.as_of}) -> ${r.rate.toFixed(4)} ` +
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
