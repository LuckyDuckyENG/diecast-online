/**
 * Repair image_url values that miniatures-minichamps published without an id.
 *
 *   node scripts/repair-minichamps-images.mjs            (dry run)
 *   node scripts/repair-minichamps-images.mjs --apply
 *
 * The shop's JSON-LD states "/-large_default/<file>.jpg", which 404s and
 * renders as the grey "?" placeholder on car cards. The working URL carries an
 * image id -- "/1276-large_default/<file>.jpg" -- and appears in the page
 * markup right beside the broken one.
 *
 * Repairs from the page cache first, because the answer is already on disk and
 * costs nothing. Anything not cached is fetched, slowly, and only if --apply.
 * lib/sitemapFeed.ts now fixes this at read time, so this is for rows written
 * before that.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !l.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');
const PAGES = path.join('.feed-cache', 'miniatures-minichamps', 'pages');
const DELAY_MS = 900;

const page = async (t, c) => {
  let o = [], f = 0;
  for (;;) {
    const { data, error } = await sb.from(t).select(c).range(f, f + 999);
    if (error) throw new Error(error.message);
    o.push(...data); if (data.length < 1000) break; f += 1000;
  }
  return o;
};

const models = await page('models', 'id, manufacturer_sku, image_url');
const broken = models.filter(m => m.image_url && /\/-[a-z_]+_default\//.test(m.image_url));
console.log(`models with a broken image URL: ${broken.length}`);
if (!broken.length) process.exit(0);

// One big string of every cached page: the id we need is in there somewhere,
// and which page it came from does not matter -- the filename is unique.
let blob = '';
if (existsSync(PAGES)) {
  const files = readdirSync(PAGES).filter(f => f.endsWith('.html'));
  console.log(`reading ${files.length} cached pages…`);
  for (const f of files) blob += readFileSync(path.join(PAGES, f), 'utf8');
}

const fix = url => {
  const file = url.split('/').pop();
  const size = url.match(/\/-([a-z_]+_default)\//)?.[1] || 'large_default';
  const rx = new RegExp(`https?://[^"'\\s]+?/(\\d+)-${size}/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  return (blob.match(rx) || [])[0] || null;
};

const repairs = [], stillBroken = [];
for (const m of broken) {
  const good = fix(m.image_url);
  if (good) repairs.push({ id: m.id, sku: m.manufacturer_sku, from: m.image_url, to: good });
  else stillBroken.push(m);
}
console.log(`  repairable from the cache : ${repairs.length}`);
console.log(`  not in the cache          : ${stillBroken.length}`);
for (const r of repairs.slice(0, 4)) console.log(`     ${String(r.sku).padEnd(12)} ${r.to.slice(0, 96)}`);

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply'); process.exit(0); }

let done = 0;
for (const r of repairs) {
  const { error } = await sb.from('models').update({ image_url: r.to }).eq('id', r.id);
  if (error) { console.log(`  ERROR ${r.sku}: ${error.message}`); continue; }
  done++;
  if (done % 50 === 0) console.log(`  ${done}/${repairs.length}…`);
}
console.log(`\nrepaired ${done} of ${repairs.length}`);

// Anything the cache could not answer: fetch the product page, politely.
if (stillBroken.length) {
  console.log(`\nfetching ${stillBroken.length} uncached pages (${DELAY_MS}ms apart)…`);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let extra = 0;
  /**
   * The PRODUCT page, from price_history.product_url.
   *
   * An earlier version derived it from the broken image URL by stripping the
   * path, which yields the domain root -- the homepage, which contains no
   * product image and repaired exactly 0 of 103. The sweep already recorded
   * where each price was read; that is the page to re-read.
   */
  const prices = await page('price_history', 'model_id, product_url');
  const urlFor = new Map();
  for (const p of prices)
    if (p.product_url && /miniatures-minichamps/.test(p.product_url)) urlFor.set(p.model_id, p.product_url);

  for (const m of stillBroken) {
    const guess = urlFor.get(m.id);
    if (!guess) continue;
    try {
      const res = await fetch(guess, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
      if (res.ok) {
        const html = await res.text();
        const file = m.image_url.split('/').pop();
        const rx = new RegExp(`https?://[^"'\\s]+?/(\\d+)-large_default/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
        const good = (html.match(rx) || [])[0];
        if (good) {
          const { error } = await sb.from('models').update({ image_url: good }).eq('id', m.id);
          if (!error) extra++;
        }
      }
    } catch { /* skip */ }
    await sleep(DELAY_MS);
  }
  console.log(`  repaired a further ${extra}`);
}
