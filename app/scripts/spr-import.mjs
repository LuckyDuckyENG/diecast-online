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
  page('price_history', 'id, model_id, retailer_id', q => q.eq('retailer_id', retailer.id)),
]);
const bySku = new Map();
for (const m of models) if (m.manufacturer_sku) bySku.set(String(m.manufacturer_sku).toLowerCase().trim(), m.id);
const already = new Set(existing.map(r => r.model_id));

const now = new Date().toISOString();
const rows = [], unmatched = [];
for (const p of spr) {
  const key = String(p.sku || '').toLowerCase().trim();
  const modelId = key && bySku.get(key);
  if (!modelId) { unmatched.push(p.sku); continue; }
  if (already.has(modelId)) continue;        // idempotent: never a second row
  if (!(p.price > 0)) continue;
  rows.push({
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
  });
}

console.log(`SPR products            : ${spr.length}`);
console.log(`  matched to a model    : ${spr.length - unmatched.length}`);
console.log(`  no matching SKU here  : ${unmatched.length}`);
console.log(`  already have a row    : ${spr.length - unmatched.length - rows.length}`);
console.log(`  TO WRITE              : ${rows.length}`);

if (!APPLY) {
  console.log('\nDRY RUN, nothing written. Re-run with --apply.');
  process.exit(0);
}

let written = 0;
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200);
  const { error } = await sb.from('price_history').insert(chunk);
  if (error) { console.error(`insert failed at ${i}: ${error.message}`); process.exit(1); }
  written += chunk.length;
}
console.log(`\nwrote ${written} price rows`);
