/**
 * Write the SPR Models cache into price_history.
 *
 *   node scripts/spr-import.mjs            # dry run, writes nothing
 *   node scripts/spr-import.mjs --apply
 *
 * Matches on manufacturer_sku, which is the only identifier both sides share.
 * SPR states a part number on every product page ("Model: S8556"), so this is
 * an exact join rather than a title match -- no fuzzy step, and nothing to
 * review afterwards.
 *
 * THE RATE COMES FROM fx_rates, NOT A CONSTANT. price_aud decides which shop
 * the site calls cheapest, and a shop that undercuts the field by a third is
 * the worst possible one to convert with a guess. The FALLBACK_TO_AUD entry
 * added alongside this exists for when the table cannot be read, and this
 * refuses to run on it.
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

const page = async (t, c, q) => {
  const o = []; let f = 0;
  for (;;) {
    let b = sb.from(t).select(c); if (q) b = q(b);
    const { data, error } = await b.range(f, f + 999);
    if (error) throw new Error(`${t}: ${error.message}`);
    o.push(...data); if (data.length < 1000) break; f += 1000;
  }
  return o;
};

/** Newest AUD -> NZD, inverted. Refuses to guess. */
const { data: fx } = await sb
  .from('fx_rates').select('rate, as_of')
  .eq('base', 'AUD').eq('quote', 'NZD')
  .order('as_of', { ascending: false }).limit(1);
if (!fx?.length) {
  console.error('No AUD->NZD rate in fx_rates. Run scripts/fetch-fx.mjs first.');
  process.exit(1);
}
const NZD_TO_AUD = 1 / Number(fx[0].rate);
console.log(`rate: 1 NZD = ${NZD_TO_AUD.toFixed(4)} AUD  (fx_rates, as of ${fx[0].as_of})\n`);

const spr = JSON.parse(readFileSync('.feed-cache/spr-models_co_nz.json', 'utf8'));
const { data: retailer } = await sb
  .from('retailers').select('id, name').eq('name', 'SPR Models').maybeSingle();
if (!retailer) { console.error('No "SPR Models" retailer row.'); process.exit(1); }

const [models, existing] = await Promise.all([
  page('models', 'id, manufacturer_sku'),
  page('price_history', 'id, model_id, price', q => q.eq('retailer_id', retailer.id)),
]);
const bySku = new Map();
for (const m of models) if (m.manufacturer_sku) bySku.set(String(m.manufacturer_sku).toLowerCase().trim(), m.id);
const existingByModel = new Map(existing.map(r => [r.model_id, r]));

const now = new Date().toISOString();
const inserts = [], updates = [], unmatched = [];
let moved = 0;

for (const p of spr) {
  const key = String(p.sku || '').toLowerCase().trim();
  const modelId = key && bySku.get(key);
  if (!modelId) { unmatched.push(p.sku); continue; }
  if (!(p.price > 0)) continue;

  const row = {
    model_id: modelId,
    retailer_id: retailer.id,
    price: p.price,
    currency: 'NZD',
    price_aud: Number((p.price * NZD_TO_AUD).toFixed(2)),
    in_stock: p.available,
    is_preorder: false,
    product_url: p.url,
    last_checked_at: now,
    recorded_at: now,
  };

  /**
   * ONE ROW PER (model, retailer), UPDATED IN PLACE.
   *
   * price_history is current state for a shop, not an append-only log --
   * lib/retailerLink.ts does exactly this and the site reads the single row.
   * Inserting a second would give one model two prices from one shop and the
   * cheaper one would win at random.
   *
   * This is also the whole point of re-running: last_checked_at is what keeps
   * a price quotable. At 30 days the site stops showing it, and SPR holds the
   * cheapest price on 90 models, so it is the worst one to let expire.
   */
  const prior = existingByModel.get(modelId);
  if (prior) {
    if (Number(prior.price) !== p.price) moved++;
    updates.push({ id: prior.id, ...row });
  } else {
    inserts.push(row);
  }
}

console.log(`SPR products            : ${spr.length}`);
console.log(`  matched to a model    : ${spr.length - unmatched.length}`);
console.log(`  no matching SKU here  : ${unmatched.length}`);
console.log(`  new rows to insert    : ${inserts.length}`);
console.log(`  existing to refresh   : ${updates.length}  (${moved} with a changed price)`);

if (!APPLY) {
  console.log('\nDRY RUN, nothing written. Re-run with --apply.');
  process.exit(0);
}

let written = 0;
for (let i = 0; i < inserts.length; i += 200) {
  const chunk = inserts.slice(i, i + 200);
  const { error } = await sb.from('price_history').insert(chunk);
  if (error) { console.error(`insert failed at ${i}: ${error.message}`); process.exit(1); }
  written += chunk.length;
}

// Updated one at a time: these are keyed by primary id and there is no shared
// patch, so a bulk upsert would need every column restated per row anyway.
let refreshed = 0;
for (const u of updates) {
  const { id, ...patch } = u;
  const { error } = await sb.from('price_history').update(patch).eq('id', id);
  if (error) { console.error(`update ${id} failed: ${error.message}`); process.exit(1); }
  refreshed++;
}

console.log(`\ninserted ${written}, refreshed ${refreshed}`);
