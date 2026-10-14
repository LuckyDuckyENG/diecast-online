/**
 * Read spr-models.co.nz into the same cache shape as the Shopify shops.
 *
 *   node scripts/spr-fetch.mjs --limit 30     # sample, for checking prices
 *   node scripts/spr-fetch.mjs                # all of them
 *
 * WHY A BESPOKE READER
 *
 * Recommended by a collector on r/Diecast 2026-10-14, in the thread about
 * which shop is actually cheapest. It is OpenCart, so there is no
 * products.json and no JSON-LD, which is why it is not in the SHOPS list in
 * build-season-csv.mjs. What it does have is a published sitemap with 494
 * product URLs, and a spec block on each page that states the facts plainly:
 *
 *     Brand: Spark   Model: US286   Availability: 2
 *     NZ$49.95   +GST NZ sales only   NZ$102.50
 *
 * Brand, part number, a real stock COUNT rather than a boolean, the current
 * price and the RRP.
 *
 * WHY IT IS WORTH THE EXTRA WORK
 *
 * The first model checked by hand, Spark S8556, was AUD 55.51 there against
 * AUD 109.36 for the cheapest shop already in the catalogue. One model is not
 * a pattern, which is what --limit is for.
 *
 * And "+GST NZ sales only" is the rarer thing. Both shops carrying 88% of the
 * site's VAT-bearing rows charge tax inclusive with NO removal for export, so
 * the tax a buyer sees is the tax they pay. This shop takes it off, which is
 * exactly the New Zealand route the same commenter described using. It is the
 * counter-example that makes retailers.vat_rate worth having.
 *
 * POLITENESS
 *
 * robots.txt allows product pages and publishes the sitemap. One request at a
 * time with a delay, and an identifying user agent. Disallowed paths -- limit,
 * sort, page, search, checkout, account, affiliate -- are never touched,
 * because every URL comes from their own sitemap.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';

const HOST = 'https://spr-models.co.nz';
const UA = { 'User-Agent': 'diecasts.app catalogue matcher (+https://diecasts.app)' };
const DELAY_MS = 500;
const OUT = path.join('.feed-cache', 'spr-models_co_nz.json');

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : null;
};
const LIMIT = Number(arg('--limit')) || 0;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const text = async (url) => {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
};

/** The spec block, which OpenCart renders as a plain list. */
function parseProduct(html, url) {
  const blocks = [...html.matchAll(/<ul class="list-unstyled">(.*?)<\/ul>/gs)]
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());

  const spec = blocks.find(b => /Brand:/.test(b) && /Model:/.test(b)) || '';
  const brand = (spec.match(/Brand:\s*(.+?)\s+Model:/) || [])[1] || null;
  const sku = (spec.match(/Model:\s*(\S+)/) || [])[1] || null;
  const availRaw = (spec.match(/Availability:\s*([^\s]+)/) || [])[1] || null;

  const priceBlock = blocks.find(b => /NZ\$/.test(b) && !/Brand:/.test(b)) || '';
  const prices = [...priceBlock.matchAll(/NZ\$([\d,]+\.\d{2})/g)].map(m => Number(m[1].replace(/,/g, '')));

  const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '')
    .replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();

  /**
   * Availability is a NUMBER when they hold stock and a phrase otherwise
   * ("Pre-Order", "Out Of Stock"). A number is the only thing that means
   * in stock, so anything non-numeric is treated as not available rather
   * than guessed at.
   */
  const stock = availRaw !== null && /^\d+$/.test(availRaw) ? Number(availRaw) : null;

  return {
    sku,
    title,
    brand,
    // The listed price, which for this shop EXCLUDES GST for non-NZ buyers.
    price: prices[0] ?? null,
    // The struck-through RRP, kept because it says how big the discount is.
    rrp: prices[1] ?? null,
    currency: 'NZD',
    available: stock !== null && stock > 0,
    stock,
    exGstForExport: /\+\s*GST NZ sales only/i.test(html),
    url,
  };
}

/**
 * DEDUPED ON product_id, NOT ON THE URL.
 *
 * The sitemap lists each product once per category it belongs to, so the same
 * car appears as
 *
 *   ...product_id=7073
 *   ...path=350_1&product_id=7073
 *   ...path=100_140_141&product_id=7073
 *
 * 3,022 URLs for 494 products. Deduping on the URL would have fetched every
 * product about six times, which is both slow and rude to a small shop that
 * has been good enough to publish a sitemap.
 */
const sitemap = await text(`${HOST}/sitemap.xml`);
const seen = new Set();
const urls = [];
for (const m of sitemap.matchAll(/<loc>([^<]*product_id=(\d+))<\/loc>/g)) {
  if (seen.has(m[2])) continue;
  seen.add(m[2]);
  // The canonical form, without the category path.
  urls.push(`${HOST}/index.php?route=product/product&product_id=${m[2]}`);
}
console.log(`sitemap lists ${urls.length} products (from ${sitemap.match(/product_id=/g).length} URLs)`);

const todo = LIMIT ? urls.slice(0, LIMIT) : urls;
console.log(`fetching ${todo.length}${LIMIT ? ` (--limit ${LIMIT})` : ''}, one at a time\n`);

const out = [];
let failed = 0;
for (let i = 0; i < todo.length; i++) {
  try {
    const p = parseProduct(await text(todo[i]), todo[i]);
    if (p.sku) out.push(p);
    if ((i + 1) % 25 === 0 || i === todo.length - 1) {
      process.stdout.write(`  ${i + 1}/${todo.length} fetched, ${out.length} parsed, ${failed} failed\r`);
    }
  } catch {
    failed++;
  }
  await sleep(DELAY_MS);
}
console.log('\n');

if (!existsSync('.feed-cache')) mkdirSync('.feed-cache', { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 0));
console.log(`wrote ${out.length} records to ${OUT}`);
console.log(`  with a part number : ${out.filter(p => p.sku).length}`);
console.log(`  in stock           : ${out.filter(p => p.available).length}`);
console.log(`  GST-free for export: ${out.filter(p => p.exGstForExport).length}`);
