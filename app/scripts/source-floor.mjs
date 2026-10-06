/**
 * How far back does miniatures-minichamps actually go?
 *
 *   node scripts/source-floor.mjs
 *
 * Offline. Reads the cached sitemap, makes no requests.
 *
 * WHY THIS EXISTS. The handoff doc asserted "THE SOURCE IS EXHAUSTED" at 2013
 * for a week and was wrong by three seasons -- the floor was 2010. The cause
 * was not bad data but thin yield read at a glance: 2010 produces 22 importable
 * rows against 417 for 2023, and twenty looks like zero if you do not count.
 *
 * Asserting the floor is now 2010 without counting would repeat exactly that
 * mistake, so this counts.
 */

import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const DIR = path.join(path.resolve(import.meta.dirname, '..'), '.feed-cache', 'miniatures-minichamps');

const urls = [];
for (const f of readdirSync(DIR).filter(f => f.endsWith('.xml'))) {
  const xml = readFileSync(path.join(DIR, f), 'utf8');
  // <loc> is CDATA-wrapped in this sitemap, which a plain [^<]+ never matches.
  for (const m of xml.matchAll(/<loc>\s*<!\[CDATA\[([^\]]+)\]\]>\s*<\/loc>/g)) urls.push(m[1]);
}
console.log(`sitemap URLs: ${urls.length}`);

/** Same rule as build-modern-csv: a year as a delimited token, part number stripped. */
const yearsIn = slug => {
  const body = slug.replace(/^\d+-/, '').replace(/-[a-z0-9]+$/i, '');
  return [...body.matchAll(/(?:^|-)((?:19|20)\d{2})(?=-|$)/g)].map(m => +m[1]);
};

/** The F1 test build-modern-csv applies, loosely -- enough to separate F1 from Le Mans. */
const NOT_F1 = /le-mans|24-heures|formule-[23]|formula-[23]|indycar|nascar|motogp|rallye|dtm|formula-e|formule-e|moto-/;

const all = new Map(), f1 = new Map();
for (const u of urls) {
  const slug = u.replace(/^.*\//, '').replace(/\.html$/, '').toLowerCase();
  const isF1 = !NOT_F1.test(slug) && /f1|formule-1|formula-1|grand-prix|(?:^|-)gp(?:-|$)/.test(slug);
  for (const y of yearsIn(slug)) {
    if (!all.has(y)) all.set(y, []);
    all.get(y).push(slug);
    if (isF1) {
      if (!f1.has(y)) f1.set(y, []);
      f1.get(y).push(slug);
    }
  }
}

console.log('\nyear   all products   looks like F1');
for (let y = 1995; y <= 2015; y++) {
  const a = all.get(y)?.length || 0, b = f1.get(y)?.length || 0;
  if (a || b) console.log(`${y}   ${String(a).padStart(6)}        ${String(b).padStart(6)}`);
}

console.log('\nby decade (all products / F1):');
for (const [lo, hi] of [[1950, 1959], [1960, 1969], [1970, 1979], [1980, 1989], [1990, 1999], [2000, 2009], [2010, 2019], [2020, 2029]]) {
  let a = 0, b = 0;
  for (let y = lo; y <= hi; y++) { a += all.get(y)?.length || 0; b += f1.get(y)?.length || 0; }
  if (a) console.log(`  ${lo}-${hi}  ${String(a).padStart(5)} / ${String(b).padStart(5)}`);
}

const target = Number(process.argv[2]) || 2009;
console.log(`\n${target}: ${all.get(target)?.length || 0} products, ${f1.get(target)?.length || 0} look like F1`);
for (const s of (f1.get(target) || []).slice(0, 15)) console.log(`   ${s}`);
