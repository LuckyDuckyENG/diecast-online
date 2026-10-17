/**
 * Correct chassis names that repeat the team, and redirect the old URLs.
 *
 *   node scripts/rename-slugs.mjs             # dry run, writes nothing
 *   node scripts/rename-slugs.mjs --map-only  # redirect file only, no DB
 *   node scripts/rename-slugs.mjs --apply     # DB + redirect file
 *
 * RUN IT IN TWO STEPS, AND THE ORDER IS NOT ARBITRARY.
 *
 *   1. --map-only, commit, deploy.  The map is consulted ONLY when a slug
 *      fails to resolve, so while the old slugs still work it sits unused and
 *      changes nothing.
 *   2. --apply.  The moment the database renames, the old URLs stop
 *      resolving and the already-deployed map catches them.
 *
 * Done the other way round, those 22 URLs return 404 for however long the
 * deploy takes. Low traffic makes that unlikely to be noticed, which is a
 * reason to get it right rather than a reason not to bother.
 *
 * WHAT IS WRONG
 *
 * `chassis_name` is supposed to hold the chassis alone: "49", "MP4-13", "W15".
 * On some cars it holds the marque too, "Lotus 79" rather than "79", and
 * because the slug is built from team AND chassis the URL says it twice:
 *
 *   /cars/1979-lotus-lotus-79-hector-rebaque-season
 *
 * The displayed TITLE was already correct -- lib/carTitle.ts drops the marque
 * when the chassis already starts with it -- so this has only ever been
 * visible in the URL, which is why it survived this long.
 *
 * WHY IT NEEDS A SCRIPT AND NOT AN UPDATE STATEMENT
 *
 * Changing `chassis_name` changes the slug, and every one of these URLs is
 * live and indexed. A rename without a redirect converts a working page into
 * a 404 for anyone arriving from Google or a bookmark. So the rename and the
 * redirect have to happen together, which is what this does: it writes the
 * new values AND regenerates lib/slugRedirects.ts from the same pass.
 *
 * Slug rules come from slug-util.js, the CommonJS mirror of lib/carSlug.ts,
 * so the script cannot drift from what the app generates.
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

const require = createRequire(import.meta.url);
const { buildSlug } = require('../slug-util.js');

config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const MAP_ONLY = process.argv.includes('--map-only');
const REDIRECTS_FILE = 'lib/slugRedirects.ts';

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

const cars = await page(
  'cars',
  'id, slug, chassis_name, event_name, season:seasons(year), team:teams(name), driver:drivers(name)'
);
console.log(`cars: ${cars.length}`);

/**
 * The marque words a chassis might redundantly start with.
 *
 * Taken from the TEAM name rather than a hardcoded list, so a team added
 * later is covered without editing this. Only the first word, and only when
 * it is long enough to be a real marque: "RB" as a team would otherwise strip
 * the "RB" that legitimately starts every Red Bull chassis name.
 */
const redundantPrefix = (car) => {
  const team = String(car.team?.name || '').trim();
  const first = team.split(/\s+/)[0] || '';
  if (first.length < 4) return null;
  const chassis = String(car.chassis_name || '').trim();
  const re = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+`, 'i');
  if (!re.test(chassis)) return null;
  const stripped = chassis.replace(re, '').trim();
  // "Ferrari" alone as a chassis name would strip to nothing. Leave it.
  return stripped.length ? stripped : null;
};

const planned = [];
for (const car of cars) {
  const chassis = redundantPrefix(car);
  if (!chassis) continue;
  const next = buildSlug({ ...car, chassis_name: chassis });
  if (!next || next === car.slug) continue;
  planned.push({ car, chassis, from: car.slug, to: next });
}

console.log(`\nchassis names that repeat the team: ${planned.length}\n`);

/**
 * A rename that collides with an existing slug would break the unique index,
 * and worse, could point two cars at one page. Checked against every slug in
 * the table AND against the other renames in this run.
 */
const existing = new Set(cars.map(c => c.slug).filter(Boolean));
const taken = new Map();
const safe = [];
for (const p of planned) {
  const clashesLive = existing.has(p.to) && p.to !== p.from;
  const clashesBatch = taken.has(p.to);
  if (clashesLive || clashesBatch) {
    console.log(`  SKIP  ${p.from}`);
    console.log(`        -> ${p.to}  COLLIDES with ${clashesBatch ? 'another rename in this run' : 'an existing slug'}`);
    continue;
  }
  taken.set(p.to, p);
  safe.push(p);
}

for (const p of safe) {
  console.log(`  ${p.car.season?.year} ${p.car.team?.name}`);
  console.log(`    chassis  "${p.car.chassis_name}" -> "${p.chassis}"`);
  console.log(`    slug     ${p.from}`);
  console.log(`          -> ${p.to}`);
}

if (!safe.length) {
  console.log('Nothing to do.');
  process.exit(0);
}

/**
 * Rewrites the redirect map, preserving what is already there.
 *
 * ONE HOP: any entry already pointing at a slug being renamed now is
 * repointed at the new name, so a visitor never follows two redirects and
 * Google never sees a chain.
 */
function writeRedirects(pairs) {
  const src = readFileSync(REDIRECTS_FILE, 'utf8');
  const start = src.indexOf('export const CAR_SLUG_REDIRECTS');
  const open = src.indexOf('{', start);
  const close = src.indexOf('};', open);
  if (start < 0 || open < 0 || close < 0) {
    throw new Error(`Could not find the map in ${REDIRECTS_FILE}`);
  }

  const map = {};
  for (const line of src.slice(open + 1, close).split('\n')) {
    const m = line.match(/^\s*'([^']+)':\s*'([^']+)'/);
    if (m) map[m[1]] = m[2];
  }

  const moved = new Map(pairs.map(p => [p.from, p.to]));
  for (const key of Object.keys(map)) {
    const hop = moved.get(map[key]);
    if (hop) map[key] = hop;
  }
  for (const p of pairs) map[p.from] = p.to;

  const body = Object.keys(map)
    .sort()
    .map(k => `  '${k}': '${map[k]}',`)
    .join('\n');

  writeFileSync(
    REDIRECTS_FILE,
    src.slice(0, open + 1) + '\n' + body + '\n' + src.slice(close),
    'utf8'
  );
  return Object.keys(map).length;
}

if (MAP_ONLY) {
  const total = writeRedirects(safe);
  console.log(`\n${REDIRECTS_FILE} now holds ${total} redirects. DATABASE UNTOUCHED.`);
  console.log('Commit and deploy this, THEN run --apply.');
  process.exit(0);
}

if (!APPLY) {
  console.log(`\nDRY RUN. ${safe.length} cars would be renamed and redirected.`);
  console.log('Re-run with --map-only first, then --apply. See the header for why.');
  process.exit(0);
}

let done = 0;
for (const p of safe) {
  const { error } = await sb
    .from('cars')
    .update({ chassis_name: p.chassis, slug: p.to })
    .eq('id', p.car.id);
  if (error) {
    console.error(`FAILED ${p.from}: ${error.message}`);
    process.exit(1);
  }
  done++;
}

const total = writeRedirects(safe);
console.log(`\nrenamed ${done} cars`);
console.log(`${REDIRECTS_FILE} now holds ${total} redirects`);
console.log('\nCommit the redirect file WITH this change, or the old URLs 404.');
