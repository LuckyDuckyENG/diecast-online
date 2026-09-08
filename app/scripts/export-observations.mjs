/**
 * Copy price_observations out of the database, to a file you keep.
 *
 *   node scripts/export-observations.mjs [--out DIR]
 *
 * WHY ONLY THIS TABLE
 *
 * Almost everything else is rebuildable. Cars and models can be reimported from
 * the season CSVs in the repo; retailer links come back by re-running the
 * sweeps; eBay links by re-running the matcher. Slow and irritating, but
 * possible.
 *
 * Price history cannot. There is no shop you can ask what something cost three
 * weeks ago, no API, no second copy. It is the only thing here that took TIME
 * rather than compute to acquire, which makes it the only thing worth insuring.
 *
 * READ-ONLY. This writes a file and touches nothing in the database.
 *
 * WHAT IS SAVED
 *
 * Every column, including the raw `price` and `currency` — NOT just price_aud.
 * A restore from a file holding only converted values would bake in whatever
 * rate was current when the export ran, which is the same trap documented on
 * the Observation interface: on 2026-09-08 that would have made 485 of 688
 * apparent price movements pure exchange-rate artefact.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !l.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/**
 * Default is OUTSIDE the repo.
 *
 * A backup committed alongside the thing it protects is not a backup — one bad
 * `git checkout` or a deleted clone takes both. It also has no business in
 * version control at 8,000 rows and growing.
 */
const OUT = arg('--out', path.join('..', '..', 'diecasts-backups'));

const PAGE = 1000;
const rows = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from('price_observations')
    .select('*')
    // Ordered so two exports of the same data produce the same file, which is
    // what makes them diffable and makes a truncated one obvious.
    .order('id', { ascending: true })
    .range(from, from + PAGE - 1);

  if (error) {
    console.error(`failed reading price_observations: ${error.message}`);
    process.exit(1);
  }
  rows.push(...data);
  process.stdout.write(`\r  read ${rows.length}`);
  if (data.length < PAGE) break;
}
console.log('');

if (!rows.length) {
  // Never overwrite a good backup with an empty one.
  console.error('no rows returned — refusing to write an empty backup');
  process.exit(1);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Named by the newest observation it contains, not by "now": that is the fact
// the file is a record of, and it makes two exports on the same day collapse
// to one name rather than piling up.
const newest = rows.reduce((a, r) => (r.observed_at > a ? r.observed_at : a), '');
const stamp = String(newest).slice(0, 10);
const file = path.join(OUT, `price_observations_${stamp}.json`);

writeFileSync(file, JSON.stringify(rows));

const days = new Set(rows.map(r => String(r.observed_at).slice(0, 10)));
const withBatch = rows.filter(r => r.batch_id).length;
const kb = Math.round(Buffer.byteLength(JSON.stringify(rows)) / 1024);

console.log(`\nwrote ${file}`);
console.log(`  ${rows.length} observations across ${days.size} recording days, ${kb} KB`);
console.log(`  ${withBatch} carry batch_id (rows written before migration 018 do not)`);
console.log(`  newest observation: ${newest}`);

const kept = readdirSync(OUT).filter(f => f.startsWith('price_observations_')).sort();
console.log(`\n${kept.length} backup(s) in ${OUT}:`);
for (const f of kept.slice(-5)) console.log(`  ${f}`);
if (kept.length > 5) console.log(`  … and ${kept.length - 5} older`);
