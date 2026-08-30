/**
 * Fix event names that are not races, only typos of one.
 *
 * These matter beyond tidiness: the eBay matcher builds its list of known races
 * from `cars.event_name` and flags a listing whose title names a DIFFERENT race
 * from the model's. One car filed as "Bahrain" rather than "Bahrain GP" makes
 * "Bahrain" a race in its own right, so every Bahrain listing conflicts with
 * every Bahrain GP model and lands in the review queue.
 *
 * Deliberately NOT touching the genuinely distinct sessions the same detector
 * flags — "Abu Dhabi GP (FP1)", "Chinese GP Sprint", "Spanish GP Tire Test",
 * "Pre-season Testing (Fiorano)" and "Sakhir GP" are all real and separate.
 *
 *   node _events.mjs [--apply]
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { buildSlugFromParts } from './slug-util.js';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !l.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const RENAME = {
  // A Bahrain GP car missing two characters. The costly one.
  'Bahrain': 'Bahrain GP',
  // The year is already on the car through season_id; repeating it in the event
  // splits one category into four and reads as four different things.
  '2020 Season': 'Season',
  '2021 Season': 'Season',
  '2025 Season': 'Season',
  // Two events in one string. The model is a season car; the race is noise.
  '2025 Season / Australian GP': 'Season',
};

const all = async (t, s) => {
  const P = 1000, o = [];
  for (let f = 0; ; f += P) {
    const { data, error } = await sb.from(t).select(s).range(f, f + P - 1);
    if (error) throw error;
    o.push(...data);
    if (data.length < P) return o;
  }
};

const cars = await all('cars',
  'id, slug, event_name, chassis_name, season_id, team_id, driver_id, team:teams(name), driver:drivers(name), season:seasons(year)');

const sig = c => [c.season_id, c.team_id, c.driver_id, c.chassis_name, c.event_name].join('|');
const byTarget = new Map();
for (const c of cars) byTarget.set(sig(c), c);

let renamed = 0, merged = 0;
for (const c of cars) {
  const to = RENAME[c.event_name];
  if (!to) continue;

  const twin = byTarget.get([c.season_id, c.team_id, c.driver_id, c.chassis_name, to].join('|'));
  const label = `${c.season?.year} ${c.chassis_name} ${c.driver?.name}: "${c.event_name}" -> "${to}"`;

  if (twin && twin.id !== c.id) {
    // A car already exists at the corrected name. Move the models across and
    // drop the duplicate rather than creating two identical cars.
    const { count } = await sb.from('models').select('*', { count: 'exact', head: true }).eq('car_id', c.id);
    console.log(`  ${label}   MERGE into ${twin.slug} (${count} model(s) move)`);
    if (APPLY) {
      const { error: e1 } = await sb.from('models').update({ car_id: twin.id }).eq('car_id', c.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from('cars').delete().eq('id', c.id);
      if (e2) throw e2;
    }
    merged++;
    continue;
  }

  const slug = buildSlugFromParts({
    year: c.season?.year, team: c.team?.name,
    chassis: c.chassis_name, driver: c.driver?.name, event: to,
  });
  console.log(`  ${label}`);
  console.log(`      slug ${c.slug} -> ${slug}`);
  if (APPLY) {
    const { error } = await sb.from('cars').update({ event_name: to, slug }).eq('id', c.id);
    if (error) throw error;
  }
  renamed++;
}

console.log(`\n${renamed} renamed, ${merged} merged into an existing car`);
if (!APPLY) console.log('\nDRY RUN — pass --apply to write');
