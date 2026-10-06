/**
 * Does the page cache for a season actually hold what the sitemap has?
 *
 *   node scripts/season-coverage.mjs 2002
 *
 * Offline. Compares `<year>-pages.json` against every sitemap slug carrying
 * that year as a token, and prints what the cache is MISSING.
 *
 * WHY. minichamps-fetch takes a plain slug substring, so `2002` also matches
 * part numbers containing those digits -- the 2002 cache came back holding a
 * 1972 Lotus, a 1992 Benetton and ten 2020 cars. The generator drops that
 * noise by year token, which is fine. The dangerous direction is the other
 * one: products that ARE from the season and never got fetched, because those
 * are invisible at every later step. A season would simply look thin.
 *
 * 2010 was fetched the same way and produced 22 importable rows, so nobody
 * had reason to check. This exists so "the season is thin" and "the fetch
 * missed it" can be told apart.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, '.feed-cache', 'miniatures-minichamps');
const year = Number(process.argv[2]);
if (!year) { console.error('usage: node scripts/season-coverage.mjs <year>'); process.exit(1); }

const urls = [];
for (const f of readdirSync(DIR).filter(f => f.endsWith('.xml')))
  for (const m of readFileSync(path.join(DIR, f), 'utf8').matchAll(/<loc>\s*<!\[CDATA\[([^\]]+)\]\]>\s*<\/loc>/g))
    urls.push(m[1]);

const yearsIn = slug => {
  const body = slug.replace(/^\d+-/, '').replace(/-[a-z0-9]+$/i, '');
  return [...body.matchAll(/(?:^|-)((?:19|20)\d{2})(?=-|$)/g)].map(m => +m[1]);
};

/** Same spirit as the generator's EXCLUDE: other series, accessories, sets. */
const NOT_A_CAR = /casque|helmet|volant|steering|figurine|pit-crew|transporter|diorama|vitrine|showcase|(?:^|-)set-|teamset|coffret|2-car-set/;
const NOT_F1 = /le-mans|24-heures|formule-[23]|formula-[23]|indycar|nascar|motogp|rallye|rally|dtm|formula-e|formule-e|dakar|wrc|moto-|gt3|gte|lmp|supercars/;
const IS_F1 = /f1|formule-1|formula-1|grand-prix|(?:^|-)gp(?:-|$)/;

const sitemap = urls
  .map(u => u.replace(/^.*\//, '').replace(/\.html$/, '').toLowerCase())
  .filter(s => yearsIn(s).includes(year) && IS_F1.test(s) && !NOT_F1.test(s) && !NOT_A_CAR.test(s));

const cacheFile = path.join(DIR, `${year}-pages.json`);
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : [];
const cachedSlugs = new Set(cache.map(o => String(o.slug || '').toLowerCase()));
const cachedForYear = cache.filter(o => yearsIn(String(o.slug || '')).includes(year));

console.log(`${year}`);
console.log(`  sitemap F1 cars for this season : ${sitemap.length}`);
console.log(`  cache records (all years)       : ${cache.length}`);
console.log(`  cache records for this season   : ${cachedForYear.length}`);

const missing = sitemap.filter(s => !cachedSlugs.has(s));
console.log(`  IN SITEMAP BUT NOT FETCHED      : ${missing.length}`);
for (const s of missing.slice(0, 30)) console.log(`     ${s.slice(0, 100)}`);
if (missing.length > 30) console.log(`     ... and ${missing.length - 30} more`);

if (!missing.length && cachedForYear.length) {
  console.log('\n  cache is complete for this season — a thin result here is the market, not the fetch');
}
