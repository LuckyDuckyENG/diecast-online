/**
 * Merge cars and models that are the same thing recorded twice.
 *
 *   node scripts/merge-duplicate-cars.mjs            (dry run)
 *   node scripts/merge-duplicate-cars.mjs --apply
 *
 * TWO KINDS OF DUPLICATE, both created by sync-csv before 2026-09-23.
 *
 * CARS: the event name was matched exactly, so "Italian GP (Monza)" and
 * "Italian GP" were treated as different races and a second car was created
 * for one that already existed. The models and prices then split across two
 * pages -- one showing prices, its twin looking empty. That is the
 * "some correct cars are not visible" symptom.
 *
 * MODELS: the part number was matched case-sensitively, so a shop writing
 * "lsf1031" in its URL produced a second model beside a stored "LSF1031".
 *
 * Both causes are fixed in sync-csv. This clears what they already made.
 *
 * WHICH ROW SURVIVES. The one with more PRICED models, then more models, then
 * the older. Priced rows carry price_history and ebay_links, and moving those
 * is riskier than moving a bare model row -- so the survivor is chosen to
 * minimise what has to move, not by which name reads better.
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !l.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const page = async (t, c) => {
  let o = [], f = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select(c).range(f, f + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    o.push(...data); if (data.length < 1000) break; f += 1000;
  }
  return o;
};

const [cars, models, seasons, teams, drivers, ph, eb] = await Promise.all([
  page('cars', 'id, slug, season_id, team_id, driver_id, chassis_name, event_name, created_at'),
  page('models', 'id, car_id, manufacturer_sku, scale, manufacturer_id, image_url'),
  page('seasons', 'id, year'), page('teams', 'id, name'), page('drivers', 'id, name'),
  page('price_history', 'model_id'), page('ebay_links', 'model_id'),
]);
const Y = new Map(seasons.map(s => [s.id, s.year]));
const T = new Map(teams.map(t => [t.id, t.name]));
const D = new Map(drivers.map(d => [d.id, d.name]));
const priced = new Set([...ph.map(p => p.model_id), ...eb.map(e => e.model_id)]);
const byCar = new Map();
for (const m of models) { if (!byCar.has(m.car_id)) byCar.set(m.car_id, []); byCar.get(m.car_id).push(m); }
const modelsOf = id => byCar.get(id) || [];
const pricedCount = id => modelsOf(id).filter(m => priced.has(m.id)).length;

/** The circuit in brackets is decoration, not identity. */
const baseEvent = e => String(e || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

const groups = new Map();
for (const c of cars) {
  const k = [c.season_id, c.team_id, c.driver_id, String(c.chassis_name).toUpperCase(), baseEvent(c.event_name)].join('|');
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}
const dupes = [...groups.values()].filter(v => v.length > 1);

const better = (a, b) =>
  pricedCount(b.id) - pricedCount(a.id) ||
  modelsOf(b.id).length - modelsOf(a.id).length ||
  String(a.created_at).localeCompare(String(b.created_at));

console.log(`DUPLICATE CARS: ${dupes.length} groups, ${dupes.reduce((a, v) => a + v.length, 0)} rows`);
const plan = [];
for (const g of dupes) {
  const [keep, ...drop] = [...g].sort(better);
  plan.push({ keep, drop });
  console.log(`  ${Y.get(keep.season_id)} ${T.get(keep.team_id)} ${keep.chassis_name} ${D.get(keep.driver_id)}`);
  console.log(`     KEEP "${keep.event_name}" ${modelsOf(keep.id).length}m ${pricedCount(keep.id)} priced  /cars/${keep.slug}`);
  for (const d of drop)
    console.log(`     move "${d.event_name}" ${modelsOf(d.id).length}m ${pricedCount(d.id)} priced  /cars/${d.slug}`);
}

/** Models on one car sharing a part number that differs only by case. */
const modelDupes = [];
for (const [carId, ms] of byCar) {
  const by = new Map();
  for (const m of ms) {
    const k = `${m.manufacturer_id}|${m.scale}|${String(m.manufacturer_sku).toUpperCase()}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(m);
  }
  for (const v of by.values()) if (v.length > 1) modelDupes.push({ carId, models: v });
}
/**
 * A duplicate where BOTH rows carry prices is not safe to resolve here.
 *
 * Deleting either loses real price_history and price_observations, and
 * price_observations is append-only history the site charts. Merging them
 * would mean reparenting rows that have their own uniqueness rules per
 * retailer. Both are decisions worth making deliberately, so these are
 * reported and left alone; only a duplicate whose twin has no prices at all
 * is removed automatically.
 */
const safeModelDupes = modelDupes.filter(d => d.models.filter(m => priced.has(m.id)).length <= 1);
const bothPriced = modelDupes.filter(d => d.models.filter(m => priced.has(m.id)).length > 1);

console.log(`\nDUPLICATE MODELS on one car: ${modelDupes.length}`);
console.log(`  safe to remove (at most one priced): ${safeModelDupes.length}`);
console.log(`  BOTH priced, left alone            : ${bothPriced.length}`);
for (const d of safeModelDupes.slice(0, 6)) {
  const c = cars.find(x => x.id === d.carId);
  console.log(`     ${d.models.map(m => `${m.manufacturer_sku}${priced.has(m.id) ? '(priced)' : ''}`).join('  ')}  /cars/${c?.slug}`);
}
if (bothPriced.length) {
  console.log(`  the both-priced ones, for a human:`);
  for (const d of bothPriced) {
    const c = cars.find(x => x.id === d.carId);
    console.log(`     ${d.models.map(m => m.manufacturer_sku).join('  vs  ')}  /cars/${c?.slug}`);
  }
}

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply'); process.exit(0); }

console.log('\napplying:');
let movedModels = 0, deletedCars = 0, deletedModels = 0;

for (const { keep, drop } of plan) {
  const have = new Map(modelsOf(keep.id).map(m => [`${m.manufacturer_id}|${m.scale}|${String(m.manufacturer_sku).toUpperCase()}`, m]));
  for (const d of drop) {
    for (const m of modelsOf(d.id)) {
      const k = `${m.manufacturer_id}|${m.scale}|${String(m.manufacturer_sku).toUpperCase()}`;
      const twin = have.get(k);
      if (twin) {
        // The keeper already has this model. Keep whichever is priced.
        if (priced.has(m.id) && !priced.has(twin.id)) {
          await sb.from('models').update({ car_id: keep.id }).eq('id', m.id);
          for (const t of ['ebay_links', 'price_history', 'price_observations', 'ebay_search_log'])
            await sb.from(t).delete().eq('model_id', twin.id);
          await sb.from('models').delete().eq('id', twin.id);
          have.set(k, m); movedModels++; deletedModels++;
        } else {
          for (const t of ['ebay_links', 'price_history', 'price_observations', 'ebay_search_log'])
            await sb.from(t).delete().eq('model_id', m.id);
          await sb.from('models').delete().eq('id', m.id);
          deletedModels++;
        }
      } else {
        await sb.from('models').update({ car_id: keep.id }).eq('id', m.id);
        have.set(k, m); movedModels++;
      }
    }
    const { error } = await sb.from('cars').delete().eq('id', d.id);
    if (error) console.log(`  ERROR deleting /cars/${d.slug}: ${error.message}`);
    else deletedCars++;
  }
}

// Case-duplicate models left on a single car. Only the safe ones.
for (const { models: ms } of safeModelDupes) {
  const keepM = [...ms].sort((a, b) => Number(priced.has(b.id)) - Number(priced.has(a.id)))[0];
  for (const m of ms) {
    if (m.id === keepM.id) continue;
    for (const t of ['ebay_links', 'price_history', 'price_observations', 'ebay_search_log'])
      await sb.from(t).delete().eq('model_id', m.id);
    const { error } = await sb.from('models').delete().eq('id', m.id);
    if (!error) deletedModels++;
  }
}

console.log(`  models moved   : ${movedModels}`);
console.log(`  models deleted : ${deletedModels}`);
console.log(`  cars deleted   : ${deletedCars}`);
