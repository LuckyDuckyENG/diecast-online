/**
 * Offline end-to-end check of the miniatures-minichamps sitemap wiring.
 *
 * Reads the CACHED sitemap XML and CACHED product pages. No network, so it can
 * be re-run freely and proves the parsing rather than the shop's uptime.
 *
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-sitemap-mm.ts
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { SITEMAP_SHOPS, prefilter, type CandidateModel } from '../lib/sitemapFeed';

const DIR = path.join(__dirname, '..', '.feed-cache', 'miniatures-minichamps');
const PAGES = path.join(DIR, 'pages');
const shop = SITEMAP_SHOPS['miniatures-minichamps.com'];

// Same expression the library uses, applied to the cached files.
const locsIn = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^\]<]+?)(?:\]\]>)?\s*<\/loc>/g)].map(m => m[1].trim());
const isProduct = (u: string) =>
  typeof shop.product === 'string' ? u.includes(shop.product) : shop.product.test(u);

let raw: string[] = [];
for (const f of readdirSync(DIR).filter(f => f.endsWith('.xml')))
  raw.push(...locsIn(readFileSync(path.join(DIR, f), 'utf8')));
const urls = raw.filter(isProduct);
console.log(`cached sitemap URLs : ${raw.length}`);
console.log(`pass the product test: ${urls.length}`);

// The real catalogue's SKUs would come from Supabase; the cached pages are the
// subset we can verify against without a network call, so use those.
const cachedSkus = readdirSync(PAGES)
  .map(f => f.replace(/\.html$/, '').split('_').pop() || '')
  .filter(s => s.length >= 4);
const models: CandidateModel[] = cachedSkus.map(sku => ({
  sku, scale: null, manufacturer: null, driver: null, event: null, year: null,
}));
console.log(`\npretending we hold ${models.length} SKUs (the ones with a cached page)`);

const candidates = prefilter(urls, models, shop);
console.log(`prefilter keeps     : ${candidates.length}`);
console.log(`  (exact SKU intersection — no scale token needed)`);

// Now read those cached pages the way fetchSitemapFeed would.
const fileOf = (slug: string) => slug.slice(0, 120).replace(/[^a-z0-9]/gi, '_') + '.html';
const readJsonLd = (html: string) => {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      for (const node of (Array.isArray(parsed) ? parsed : [parsed]) as any[]) {
        if (node?.['@type'] !== 'Product') continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = offer?.price != null ? parseFloat(String(offer.price)) : null;
        return {
          sku: node.sku || node.mpn || null,
          price: Number.isFinite(price) ? price : null,
          currency: offer?.priceCurrency || null,
          available: !/OutOfStock|SoldOut|Discontinued/i.test(String(offer?.availability || '')),
          name: node.name || null,
        };
      }
    } catch { /* ignore */ }
  }
  return null;
};

let read = 0, withSku = 0, withPrice = 0, inStock = 0, skuMatchesUrl = 0, skuIsTail = 0, shortTail = 0, missing = 0;
const unrelated: string[] = [];
const sample: string[] = [];
for (const u of candidates) {
  const slug = (u.split('/').pop() || '').replace(/\.html$/, '');
  const f = path.join(PAGES, fileOf(slug));
  if (!existsSync(f)) { missing++; continue; }
  read++;
  const p = readJsonLd(readFileSync(f, 'utf8'));
  if (!p?.sku) continue;
  withSku++;
  if (p.price != null) withPrice++;
  if (p.available) inStock++;
  const urlSku = (slug.split('-').pop() || '').toUpperCase();
  const pageSku = p.sku.toUpperCase();
  if (pageSku === urlSku) skuMatchesUrl++;
  else if (urlSku.length >= 5 && pageSku.endsWith(urlSku)) skuIsTail++;
  // Known and deliberate: 4-char tails collide on 12% of URLs, so they are
  // not aliased. Counted, not tolerated silently.
  else if (pageSku.endsWith(urlSku)) shortTail++;
  else unrelated.push(`   UNRELATED  url ${urlSku} vs page ${pageSku}`);
  if (sample.length < 8)
    sample.push(`   ${String(p.sku).padEnd(12)} ${String(p.price ?? '-').padStart(7)} ${p.currency || ''}  ${p.available ? 'in stock' : 'sold out'}  ${String(p.name).slice(0, 46)}`);
}

console.log(`\ncached pages read   : ${read}${missing ? ` (${missing} candidates had no cached page)` : ''}`);
console.log(`JSON-LD gave a SKU  : ${withSku}`);
console.log(`  with a price      : ${withPrice}`);
console.log(`  in stock          : ${inStock}`);
/*
 * The URL's part number and the page's own SKU are NOT required to agree.
 * Some makers publish a shortened form -- the page says `F1BRACOL001-51589`
 * and the URL ends `-51589` -- which is why fetchSitemapFeed files a variant
 * under both. What must hold is that the URL form is a tail of the page form,
 * because that is the assumption the alias rests on.
 */
console.log(`URL part number equals the page's SKU  : ${skuMatchesUrl}/${withSku}`);
console.log(`  ...or is a tail of it (aliased)      : ${skuIsTail}`);
console.log(`  ...a tail under 5 chars (NOT aliased) : ${shortTail}  <- known limitation`);
console.log(`  ...unrelated (a real silent miss)     : ${unrelated.length}`);
for (const u of unrelated.slice(0, 10)) console.log(u);
console.log('\nsample:');
for (const s of sample) console.log(s);

const ok =
  urls.length > 10000 &&
  candidates.length > 100 &&
  withSku === read &&
  unrelated.length === 0;
console.log(
  `\n${ok ? 'PASS' : 'FAIL'} — sitemap parses, prefilter matches by part number, ` +
    `every page yields a SKU that is the URL's or extends it`
);
process.exit(ok ? 0 : 1);
