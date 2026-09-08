/**
 * Copy the whole database out to a file you keep.
 *
 *   node scripts/export-observations.mjs [--out DIR]
 *
 * WHY EVERYTHING, NOT JUST THE HISTORY
 *
 * The first version of this saved only price_observations, on the reasoning
 * that everything else could be rebuilt: cars and models from the season CSVs,
 * retailer links by re-running the sweeps, eBay links by re-running the
 * matcher.
 *
 * That was too optimistic, and the Supabase plan settled it — the free tier
 * includes NO project backups at all. Not short retention: none. So this file
 * is the only copy that exists.
 *
 * And a rebuild would lose every hand-made decision layered on top of the
 * imports: the Zhou Guanyu / Guanyu Zhou merge, "Bahrain" renamed to "Bahrain
 * GP", the 537 scale corrections, the Season-mislabelling repairs, hand-picked
 * retailer URLs that the sweep deliberately preserves, and every manual
 * accept/reject in the eBay review queue. Weeks of judgement that no script
 * reproduces.
 *
 * 19,432 rows across thirteen tables is a few megabytes. There is no reason to
 * be selective.
 *
 * READ-ONLY. Writes a file and touches nothing in the database.
 *
 * The raw `price` and `currency` are saved everywhere they exist, never just
 * the converted price_aud — a restore from converted values alone would bake in
 * whatever rate was current when the export ran. See the note on the
 * Observation interface: on 2026-09-08 that would have turned 485 of 688
 * apparent price movements into pure exchange-rate artefact.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs';
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
 * Default is OUTSIDE the repo. A backup committed alongside the thing it
 * protects is not a backup — one bad checkout or a deleted clone takes both.
 */
const OUT = arg('--out', path.join('..', '..', 'diecasts-backups'));

/**
 * Reference tables first, then the rows that point at them. Not required to
 * read, but it means a restore can walk the file top to bottom without
 * tripping a foreign key.
 */
const TABLES = [
  'seasons', 'teams', 'drivers', 'manufacturers', 'retailers',
  'cars', 'models',
  'price_history', 'ebay_links', 'price_observations',
  'fx_rates', 'ebay_search_log', 'ebay_inventory',
];

const PAGE = 1000;
const dump = {};
const counts = {};
let grand = 0;

/**
 * Read one table, paged.
 *
 * `ordered` exists because not every table has an `id`. fx_rates is keyed on
 * (as_of, base, quote) and ebay_search_log on the model, so ordering by id
 * fails there with "column ... does not exist" — which the first version of
 * this matched against its "table missing" check and quietly skipped BOTH
 * tables, 1,791 rows, while reporting success.
 *
 * That is the same failure as every truncation this month: a plausible-looking
 * result that is silently short. In a backup it is the worst version of it,
 * because you only find out when you need the file.
 */
async function readTable(table, ordered = true) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*');
    if (ordered) q = q.order('id', { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);

    if (error) {
      // A missing COLUMN means this table has no `id` — read it unordered
      // rather than pretending it does not exist.
      if (ordered && /column/i.test(error.message)) return readTable(table, false);
      // A missing TABLE is not a failure: migrations differ between
      // environments. Anything else is, and must stop the run.
      if (/relation|find the table|schema cache/i.test(error.message)) return null;
      console.error(`\nfailed reading ${table}: ${error.message}`);
      process.exit(1);
    }
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

for (const table of TABLES) {
  const rows = await readTable(table);
  if (rows === null) { console.log(`  ${table.padEnd(20)} (not present, skipped)`); continue; }
  dump[table] = rows;
  counts[table] = rows.length;
  grand += rows.length;
  console.log(`  ${table.padEnd(20)} ${String(rows.length).padStart(6)} rows`);
}

/**
 * Never overwrite a good backup with an empty one. An export that read nothing
 * is a failure wearing a success's clothes, and it is the one moment when
 * writing the file is worse than crashing.
 */
if (!grand) {
  console.error('no rows returned from any table — refusing to write an empty backup');
  process.exit(1);
}

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const payload = {
  exportedAt: new Date().toISOString(),
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  counts,
  tables: dump,
};
const json = JSON.stringify(payload);

// Dated by the day it was taken. Re-running on the same day replaces rather
// than accumulates, which keeps the folder readable.
const stamp = new Date().toISOString().slice(0, 10);
const file = path.join(OUT, `diecasts_${stamp}.json`);
writeFileSync(file, json);

console.log(`\nwrote ${file}`);
console.log(`  ${grand} rows across ${Object.keys(dump).length} tables, ${Math.round(Buffer.byteLength(json) / 1024)} KB`);

const kept = readdirSync(OUT).filter(f => f.startsWith('diecasts_')).sort();
console.log(`\n${kept.length} backup(s) in ${OUT}:`);
for (const f of kept.slice(-6)) {
  const kb = Math.round(statSync(path.join(OUT, f)).size / 1024);
  console.log(`  ${f}  ${kb} KB`);
}
if (kept.length > 6) console.log(`  … and ${kept.length - 6} older`);
console.log(
  `\nSupabase's free plan takes no backups, so this file is the only copy.\n` +
  `Keep at least one somewhere off this machine.`
);
