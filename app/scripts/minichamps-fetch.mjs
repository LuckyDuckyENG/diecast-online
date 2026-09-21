/**
 * Fetch product pages from miniatures-minichamps.com to read the one field the
 * URL never carries: SCALE.
 *
 *   node scripts/minichamps-fetch.mjs senna
 *   node scripts/minichamps-fetch.mjs senna --limit 20
 *
 * WHY A FETCH AT ALL
 *
 * The sitemap gives 23,895 part numbers with year, maker, event and driver in
 * the slug. It never gives scale, and sync-csv needs it to choose between
 * sku_1_18 and sku_1_43.
 *
 * Scale can be inferred from a part number for MODERN codes — Minichamps
 * 110/410 prefixes, Spark 18S/S, Looksmart LS18/LS. It cannot for historic
 * ones, because Minichamps filed those under the 5xx series and 5xx runs
 * across scales. That is precisely backwards from what is wanted: inference
 * works where the catalogue already has coverage and fails where it does not.
 * Senna is 194 products and 16 inferable scales.
 *
 * The product page states it in plain text — "Miniature diecast F1 1/43 de la
 * ..." — so one read per product settles it permanently. That is why this
 * exists and why it caches: the answer for a given product never changes.
 *
 * POLITE BY CONSTRUCTION. One request at a time with a delay between, a cache
 * so a re-run costs nothing, and a hard limit flag. This reads a shop's public
 * pages at a slower rate than a person clicking through them.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SITEMAP_CACHE = path.join(ROOT, '.feed-cache', 'miniatures-minichamps');
const PAGE_CACHE = path.join(SITEMAP_CACHE, 'pages');
const DELAY_MS = 900;

const args = process.argv.slice(2);
const term = args.find(a => !a.startsWith('--'));
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

if (!term) {
  console.error('usage: node scripts/minichamps-fetch.mjs <slug-substring> [--limit N]');
  process.exit(1);
}

const MAKERS = ['minichamps','spark','looksmart','bbr','ixo','brumm','tecnomodel','gp-replicas','amalgam','solido','bburago','onyx','quartzo','truescale','tsm','exoto','altaya','edicola','sunstar','norev','schuco','autoart','cmr','matrix','premium-x','vitesse'];
const NOT_A_CAR = /\bfigurine|figurines|casque|helmet|camion|transporter|pneus|tyres|diorama|vitrine|showcase|garage-set|plaque|poster\b/;
const WRONG = /formule-[23]|formula-[23]|\bf[23]\b|indycar|nascar|motogp|le-mans|rallye|dtm/;
const SET = /2-car-set|two-car-set|teamset|team-set|coffret/;
const okSku = t => /^[0-9a-z]{4,20}$/i.test(t) && /\d/.test(t) && !/^\d{4}$/.test(t) && !/^\d{13}$/.test(t);

const locs = xml =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^\]<]+?)(?:\]\]>)?\s*<\/loc>/g)].map(m => m[1].trim());

const urls = [];
for (const f of readdirSync(SITEMAP_CACHE).filter(f => f.endsWith('.xml')))
  urls.push(...locs(readFileSync(path.join(SITEMAP_CACHE, f), 'utf8')));

const targets = urls.filter(u => {
  if (!/\.html$/.test(u)) return false;
  const cat = (u.match(/\/gb\/([^/]+)\//) || [])[1] || '';
  const slug = u.split('/').pop().replace(/\.html$/, '');
  if (!slug.includes(term.toLowerCase())) return false;
  if (!(/\bf1\b|formula-1|formule-1/.test(slug) || /^f1-/.test(cat))) return false;
  if (NOT_A_CAR.test(slug) || WRONG.test(slug) || SET.test(slug)) return false;
  const t = slug.split('-');
  return okSku(t[t.length - 1]);
}).slice(0, limit);

console.log(`"${term}": ${targets.length} product pages to read (delay ${DELAY_MS}ms)\n`);

mkdirSync(PAGE_CACHE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Scale as the page states it. The description is French-led — "Miniature
 * diecast F1 1/43 de la ..." — and the same page also carries 1/43 in the
 * title, so several patterns are tried and the first agreement wins.
 */
const readScale = html => {
  const m = html.match(/\b1[\/:](12|18|24|43|64)\b/);
  return m ? `1:${m[1]}` : null;
};
const readRef = html => (html.match(/Reference:\s*<[^>]*>([^<]+)</i) || html.match(/itemprop="sku"[^>]*>([^<]+)</i) || [])[1]?.trim() || null;
const readStock = html => !/no longer in stock|plus en stock/i.test(html);
const readPrice = html => {
  const m = html.match(/([0-9]+[.,][0-9]{2})\s*&euro;|&euro;\s*([0-9]+[.,][0-9]{2})|([0-9]+[.,][0-9]{2})\s*€/);
  const v = m && (m[1] || m[2] || m[3]);
  return v ? Number(v.replace(',', '.')) : null;
};

const out = [];
let fetched = 0, cached = 0, failed = 0;

for (const [i, u] of targets.entries()) {
  const slug = u.split('/').pop().replace(/\.html$/, '');
  const file = path.join(PAGE_CACHE, slug.slice(0, 120).replace(/[^a-z0-9]/gi, '_') + '.html');
  let html;
  if (existsSync(file)) { html = readFileSync(file, 'utf8'); cached++; }
  else {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) { failed++; await sleep(DELAY_MS); continue; }
      html = await res.text();
      writeFileSync(file, html);
      fetched++;
      await sleep(DELAY_MS);
    } catch { failed++; await sleep(DELAY_MS); continue; }
  }

  const t = slug.split('-');
  out.push({
    slug,
    urlSku: t[t.length - 1],
    pageRef: readRef(html),
    scale: readScale(html),
    inStock: readStock(html),
    price: readPrice(html),
    year: t.find(x => /^(19[5-9]\d|20[0-2]\d)$/.test(x)) || null,
    maker: MAKERS.find(m => slug.includes(m)) || null,
  });

  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${targets.length} …`);
}

console.log(`\nfetched ${fetched}, from cache ${cached}, failed ${failed}\n`);

const withScale = out.filter(o => o.scale);
console.log(`scale read from the page : ${withScale.length} of ${out.length}`);
const byScale = {};
for (const o of withScale) byScale[o.scale] = (byScale[o.scale] || 0) + 1;
console.log(`  ${Object.entries(byScale).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  ')}`);

const refMatch = out.filter(o => o.pageRef && o.pageRef.toUpperCase() === o.urlSku.toUpperCase()).length;
console.log(`\npart number in the URL matches the page's Reference: ${refMatch} of ${out.filter(o => o.pageRef).length} that state one`);
console.log(`in stock: ${out.filter(o => o.inStock).length}   sold out: ${out.filter(o => !o.inStock).length}`);
console.log(`price read: ${out.filter(o => o.price).length}`);

console.log('\nsample:');
for (const o of out.slice(0, 10))
  console.log(`  ${String(o.urlSku).padEnd(13)} ${String(o.scale || '?').padEnd(5)} ${String(o.year || '????')} ${o.inStock ? 'in stock ' : 'sold out'} ${o.price ? String(o.price).padStart(7) : '      -'}  ${o.slug.slice(0, 48)}`);

writeFileSync(path.join(SITEMAP_CACHE, `${term}-pages.json`), JSON.stringify(out, null, 2));
console.log(`\nwrote ${out.length} records to .feed-cache/miniatures-minichamps/${term}-pages.json`);
