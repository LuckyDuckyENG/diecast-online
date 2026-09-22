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
/**
 * Accessories, and the difference between BEING one and INCLUDING one.
 *
 * The old rule was a flat word list matched anywhere, and it was wrong in both
 * directions at once.
 *
 * Too narrow: it had no term for a steering wheel, so four 1:2 Senna steering
 * wheels imported as 1:43 CARS -- 254850012, 254880012, 254910001, 254940002.
 * The last one reached the live site, matched a real eBay listing by its own
 * part number, and quoted AUD 301 for a "Williams FW16" that is wall art.
 *
 * Too broad: `helmet` and `tyres` matched unqualified, rejecting 133 real F1
 * cars that merely come WITH something --
 *   ...-with-pitboard-and-schumacher-helmet-minichamps-110201144
 *   ...-with-used-tyres-and-dirty-effect-minichamps-110201444
 *   ...-red-bull-rb18-with-rain-tyres-1-f1-monaco-2022-...
 * which are desirable variants, and the ones collectors hunt.
 *
 * THE TEST IS "with". Once a slug says with- or avec-, everything after it is
 * a list of what the car comes with; an accessory word before that point is
 * the product itself. Position alone is not enough -- the accessory does not
 * have to lead ("lotus-jps-square-transporter", "f1-pit-crew-figurines").
 *
 * Checked against all 35,767 sitemap slugs and a 12-case probe: rejects every
 * steering wheel, helmet, figurine, transporter and garage set; keeps all 133
 * accessory-bearing F1 cars.
 */
const ACCESSORY =
  'steering-wheel|volant|casque|helmet|figurines?|camion|transporter|diorama|vitrine|' +
  'showcase|garage-set|display-case|plaque|poster|porte-cle|keyring|keychain|malette|' +
  'pneus|tyres|jantes|wheel-set|pit-crew|nose-cone';
const ACC_RE = new RegExp(`(?:^|-)(?:${ACCESSORY})(?:-|$)`, 'g');
/**
 * 1:2, 1:4 and 1:5 are display pieces -- all 440 in the sitemap are helmets.
 * The lookahead spares "1-4-heures-de-monza", which is a race distance.
 */
const DISPLAY_SCALE = /-1-(2|4|5)-(?!heures|hours|h-)/;
const NOT_A_CAR = slug => {
  if (DISPLAY_SCALE.test(slug)) return true;
  const w = slug.search(/(?:^|-)(?:with|avec)-/);
  const cut = w === -1 ? slug.length : w;
  ACC_RE.lastIndex = 0;
  let m;
  while ((m = ACC_RE.exec(slug))) if (m.index < cut) return true;
  return false;
};
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
  if (NOT_A_CAR(slug) || WRONG.test(slug) || SET.test(slug)) return false;
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
/**
 * Stock, price and part number from the page's own JSON-LD.
 *
 * NOT from the page text, which is a trap this script fell into. PrestaShop
 * renders "This product is no longer in stock" as a HIDDEN element on EVERY
 * product page, in stock or not, so a text match reports the entire shop as
 * sold out -- 191 of 191 on the Senna run, and it is simply false. The JSON-LD
 * `availability` is the shop's actual statement and said 10 were in stock.
 *
 * Price has the same shape of bug: the only bare euro amounts in the markup
 * are the cart widget's zeros and a loyalty voucher, so a naive currency regex
 * returns 0.00 or nothing while `our_price_display` and the JSON-LD offer both
 * carry the real figure.
 *
 * lib/sitemapFeed.ts reads the same block for the sweep. Same source, same
 * answer -- which is the point.
 */
const readJsonLd = html => {
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        if (node?.['@type'] !== 'Product') continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = offer?.price != null ? parseFloat(String(offer.price)) : null;
        return {
          sku: node.sku || node.mpn || null,
          price: Number.isFinite(price) ? price : null,
          currency: offer?.priceCurrency || null,
          inStock: !/OutOfStock|SoldOut|Discontinued/i.test(String(offer?.availability || '')),
        };
      }
    } catch {
      /* a malformed block is not a reason to abandon the page */
    }
  }
  return null;
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
  const ld = readJsonLd(html);
  out.push({
    slug,
    urlSku: t[t.length - 1],
    pageRef: ld?.sku || null,
    scale: readScale(html),
    inStock: ld?.inStock ?? null,
    price: ld?.price ?? null,
    currency: ld?.currency || null,
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

const stated = out.filter(o => o.pageRef);
const refMatch = stated.filter(o => o.pageRef.toUpperCase() === o.urlSku.toUpperCase()).length;
const refTail = stated.filter(o => o.pageRef.toUpperCase() !== o.urlSku.toUpperCase()
  && o.pageRef.toUpperCase().endsWith(o.urlSku.toUpperCase())).length;
console.log(`\npart number in the URL vs the page's own SKU (${stated.length} state one):`);
console.log(`  identical ${refMatch}   URL is a shortened tail ${refTail}   unrelated ${stated.length - refMatch - refTail}`);
console.log(`in stock: ${out.filter(o => o.inStock === true).length}   sold out: ${out.filter(o => o.inStock === false).length}   unknown: ${out.filter(o => o.inStock === null).length}`);
const priced = out.filter(o => o.price != null);
console.log(`price read: ${priced.length}${priced.length ? `  (${priced[0].currency} ${Math.min(...priced.map(o => o.price))} – ${Math.max(...priced.map(o => o.price))})` : ''}`);

console.log('\nsample:');
for (const o of out.slice(0, 10))
  console.log(`  ${String(o.urlSku).padEnd(13)} ${String(o.scale || '?').padEnd(5)} ${String(o.year || '????')} ${o.inStock ? 'in stock ' : 'sold out'} ${o.price ? String(o.price).padStart(7) : '      -'}  ${o.slug.slice(0, 48)}`);

writeFileSync(path.join(SITEMAP_CACHE, `${term}-pages.json`), JSON.stringify(out, null, 2));
console.log(`\nwrote ${out.length} records to .feed-cache/miniatures-minichamps/${term}-pages.json`);
