/**
 * Read miniatures-minichamps.com's sitemap as a CATALOGUE, not a price source.
 *
 *   node scripts/minichamps-catalogue.mjs                 # what is extractable
 *   node scripts/minichamps-catalogue.mjs --driver senna  # inspect one driver
 *
 * WHY THIS SHOP, AND WHY THE SITEMAP
 *
 * Three researched CSVs — 1988, 2019, 2018 — knew which historic cars existed
 * and had to DERIVE their part numbers. Every derivation was wrong, because the
 * Minichamps scheme encodes year, round and car number but not the prefix, and
 * Looksmart does not use the scheme at all.
 *
 * This shop states them. 23,895 part numbers sit in its sitemap URLs, and the
 * slug carries chassis, year, event, driver and maker alongside:
 *
 *   540851812-lotus-renault-97t-1985-ayrton-senna-minichamps-540851812
 *   TSM124331-mclaren-honda-mp4-5-f1-monaco-1989-ayrton-senna-truescale-tsm124331
 *
 * Read, not derived. 264 Senna entries against the 3 rows the 1988 bootstrap
 * managed from every feed combined.
 *
 * NOT A PRICE SOURCE. 23,750 of its 36,000 URLs sit under /gb/sold-out/, which
 * gives a part number and no buyable price. That is the right shape: once a SKU
 * is held, eBay search and the other shops' feeds can find a price for it.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 *
 * It does not write. It reports what is extractable and what is missing, so the
 * decision to import is made against numbers rather than hope — the same order
 * every season import has followed.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.feed-cache', 'miniatures-minichamps');
const HOST = 'https://www.miniatures-minichamps.com';
/** Both English sitemaps. The French pair duplicates them under /fr/. */
const SITEMAPS = ['/1_gb_0_sitemap.xml', '/1_gb_1_sitemap.xml'];

const args = process.argv.slice(2);
const only = args.includes('--driver') ? args[args.indexOf('--driver') + 1] : null;

async function sitemapText(pathname) {
  mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, pathname.replace(/[^a-z0-9]/gi, '_') + '.xml');
  if (existsSync(file)) return readFileSync(file, 'utf8');
  const res = await fetch(HOST + pathname, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status}`);
  const text = await res.text();
  writeFileSync(file, text);
  return text;
}

/**
 * The URLs are CDATA-wrapped: <loc><![CDATA[https://...]]></loc>.
 *
 * A plain /<loc>([^<]+)<\/loc>/ reads ZERO here and looks like an empty
 * sitemap rather than a parse failure — which is exactly what it did the first
 * time. lib/sitemapFeed.ts has the same bare pattern and would hit this too.
 */
const locs = xml =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^\]<]+?)(?:\]\]>)?\s*<\/loc>/g)].map(m => m[1].trim());

/**
 * Looks like a part number rather than a word or a barcode.
 *
 * 13 all-digit tokens are EAN-13 barcodes — 9580006946010 and friends, 730 of
 * them — not part numbers. They would match no shop and no other feed, so
 * storing one is worse than storing nothing: it looks like a SKU and joins to
 * nothing forever.
 */
const looksLikeSku = t =>
  /^[0-9a-z]{4,20}$/i.test(t) && /\d/.test(t) && !/^\d{4}$/.test(t) && !/^\d{13}$/.test(t);

/** 0000000000000 appears on at least one Senna entry. A SKU of zeroes is not one. */
const JUNK_SKU = /^0+$/;

/**
 * French is the shop's first language and it leaks into the English slugs:
 * espagne, japon, allemagne, autriche. Untranslated, the event never matches
 * and the row is unusable — the same failure Yuui's Dutch titles cause.
 */
const EVENT_WORDS = {
  espagne: 'Spanish GP', espagnol: 'Spanish GP', spain: 'Spanish GP', spanish: 'Spanish GP',
  japon: 'Japanese GP', japan: 'Japanese GP', japanese: 'Japanese GP',
  allemagne: 'German GP', german: 'German GP', germany: 'German GP',
  autriche: 'Austrian GP', austria: 'Austrian GP', austrian: 'Austrian GP',
  belgique: 'Belgian GP', belgium: 'Belgian GP', belgian: 'Belgian GP',
  'grande-bretagne': 'British GP', britain: 'British GP', british: 'British GP', angleterre: 'British GP',
  italie: 'Italian GP', italy: 'Italian GP', italian: 'Italian GP', monza: 'Italian GP (Monza)',
  monaco: 'Monaco GP',
  france: 'French GP', french: 'French GP',
  hongrie: 'Hungarian GP', hungary: 'Hungarian GP',
  bresil: 'Brazilian GP', brazil: 'Brazilian GP', bresilien: 'Brazilian GP',
  canada: 'Canadian GP', canadien: 'Canadian GP',
  mexique: 'Mexican GP', mexico: 'Mexican GP',
  australie: 'Australian GP', australia: 'Australian GP',
  'pays-bas': 'Dutch GP', hollande: 'Dutch GP', netherlands: 'Dutch GP',
  portugal: 'Portuguese GP', afrique: 'South African GP',
  usa: 'United States GP', detroit: 'United States GP', dallas: 'United States GP',
  imola: 'Emilia Romagna GP (Imola)', 'saint-marin': 'Emilia Romagna GP (Imola)',
  suede: 'Swedish GP', argentine: 'Argentine GP',
  // Added from the data rather than guessed: these are the commonest tokens
  // left in rows that matched no event. `angleterre` alone accounts for 296.
  angleterre: 'British GP', silverstone: 'British GP', brands: 'British GP',
  bahrain: 'Bahrain GP', bahrein: 'Bahrain GP', sakhir: 'Bahrain GP',
  dhabi: 'Abu Dhabi GP', 'abu-dhabi': 'Abu Dhabi GP',
  malaisie: 'Malaysian GP', malaysia: 'Malaysian GP', sepang: 'Malaysian GP',
  'san-marino': 'Emilia Romagna GP (Imola)',
  chine: 'Chinese GP', china: 'Chinese GP', shanghai: 'Chinese GP',
  russie: 'Russian GP (Sochi)', sochi: 'Russian GP (Sochi)',
  turquie: 'Turkish GP', turkey: 'Turkish GP',
  singapour: 'Singapore GP', singapore: 'Singapore GP',
  coree: 'Korean GP', inde: 'Indian GP',
  hockenheim: 'German GP', nurburgring: 'German GP',
  spa: 'Belgian GP', francorchamps: 'Belgian GP',
  interlagos: 'Brazilian GP', suzuka: 'Japanese GP',
  zandvoort: 'Dutch GP', hungaroring: 'Hungarian GP',
  montreal: 'Canadian GP', estoril: 'Portuguese GP',
  jerez: 'Spanish GP', jarama: 'Spanish GP', catalunya: 'Spanish GP',
  'magny-cours': 'French GP', 'paul-ricard': 'French GP',
  kyalami: 'South African GP', adelaide: 'Australian GP', melbourne: 'Australian GP',
  monza: 'Italian GP (Monza)',
  'las-vegas': 'Las Vegas GP', miami: 'Miami GP', qatar: 'Qatar GP',
  azerbaijan: 'Azerbaijan GP', bakou: 'Azerbaijan GP', baku: 'Azerbaijan GP',
  arabie: 'Saudi Arabian GP', jeddah: 'Saudi Arabian GP',
  styrie: 'Styrian GP', toscane: 'Tuscan GP (Mugello)', mugello: 'Tuscan GP (Mugello)',
  eifel: 'Eifel GP (Nurburgring)', emilie: 'Emilia Romagna GP (Imola)',
};

const MAKERS = [
  'minichamps','spark','looksmart','bbr','ixo','brumm','tecnomodel','gp-replicas','amalgam',
  'solido','bburago','onyx','quartzo','truescale','tsm','exoto','hotwheels','altaya','edicola',
  'sunstar','norev','schuco','autoart','cmr','matrix','premium-x','vitesse',
];

const main = async () => {
  let urls = [];
  for (const s of SITEMAPS) urls.push(...locs(await sitemapText(s)));
  console.log(`sitemap URLs: ${urls.length}`);

  const products = urls.filter(u => /\.html$/.test(u)).map(u => {
    const category = (u.match(/\/gb\/([^/]+)\//) || [])[1] || '(none)';
    const slug = u.split('/').pop().replace(/\.html$/, '');
    const tokens = slug.split('-');
    const last = tokens[tokens.length - 1];
    return { u, category, slug, tokens, sku: looksLikeSku(last) ? last : null };
  });

  const withSku = products.filter(p => p.sku && !JUNK_SKU.test(p.sku));
  console.log(`product pages: ${products.length}, with a usable part number: ${withSku.length}`);
  console.log(`  rejected as junk SKU: ${products.filter(p => p.sku && JUNK_SKU.test(p.sku)).length}`);
  console.log(`  no part number in the URL: ${products.filter(p => !p.sku).length}`);

  /**
   * "F1" in the slug is not enough. It also matches things that are not cars —
   * driver figurines, 1:6 helmets (casque), a Fiat transporter (camion) — and
   * junior formulae that merely mention F1 in passing.
   */
  const NOT_A_CAR = /\bfigurine|figurines|casque|helmet|camion|transporter|pneus|tyres|diorama|vitrine|showcase|garage-set|plaque|poster\b/;
  const WRONG_SERIES = /formule-[23]|formula-[23]|\bf[23]\b|indycar|nascar|motogp|le-mans|rallye|dtm/;
  const isF1 = p =>
    (/\bf1\b|formula-1|formule-1/.test(p.slug) || /^f1-/.test(p.category)) &&
    !NOT_A_CAR.test(p.slug) && !WRONG_SERIES.test(p.slug);
  const f1 = withSku.filter(isF1);
  console.log(`\nF1 cars (figurines, helmets, transporters and junior formulae excluded): ${f1.length}`);

  /**
   * Scale, from the part number, because the URL never states it — only 6 of
   * 7,672 sit in a scale-named category.
   *
   * Each maker numbers its own way and these are the documented prefixes, the
   * same ones the season generator relies on. Anything unrecognised stays
   * null rather than guessing: a model filed at the wrong scale is worse than
   * one not filed at all, and the browse filter is built on this field.
   */
  const scaleFromSku = sku => {
    const s = sku.toUpperCase();
    if (/^(110|112|113|117|147|155|186)\d{6}$/.test(s)) return '1:18';   // Minichamps 1:18
    if (/^(410|412|417|430|437|447)\d{6}$/.test(s)) return '1:43';       // Minichamps 1:43
    if (/^18S\d{3,4}/.test(s) || /^18SP\d{2,4}/.test(s)) return '1:18';  // Spark 1:18
    if (/^S\d{4,5}/.test(s) || /^SP\d{3,4}$/.test(s)) return '1:43';     // Spark 1:43
    if (/^LS18/.test(s)) return '1:18';                                  // Looksmart 1:18
    if (/^LS[A-Z]/.test(s) || /^LSF1/.test(s)) return '1:43';
    if (/^TSM1[24]\d{4}/.test(s)) return '1:43';                         // TrueScale
    if (/^BBR1[89]\d{4}/.test(s)) return '1:18';                         // BBR 1:18
    if (/^BBRC/.test(s)) return '1:43';
    if (/^12S\d{3}/.test(s)) return '1:12';                              // Spark 1:12
    /**
     * Deliberately NOT guessed: GP Replicas (GP1204A, 181 of them) and the
     * bare letter-suffixed Brumm-style codes (165B, 170A). GP Replicas makes
     * both 1:18 and 1:12 and nothing in the number distinguishes them, and the
     * Brumm family is 1:43 by convention but not reliably. A model filed at
     * the wrong scale is worse than one not filed at all — the browse filter
     * and every price comparison are built on this field.
     */
    return null;
  };

  const field = p => {
    const year = (p.tokens.find(t => /^(19[5-9]\d|20[0-2]\d)$/.test(t)) || null);
    const maker = MAKERS.find(m => p.slug.includes(m)) || null;
    const eventKey = Object.keys(EVENT_WORDS).find(k => p.tokens.includes(k) || p.slug.includes(k));
    return { year, maker, event: eventKey ? EVENT_WORDS[eventKey] : null, scale: scaleFromSku(p.sku) };
  };

  let haveYear = 0, haveMaker = 0, haveEvent = 0, haveScale = 0, haveAll = 0;
  const missing = { year: [], maker: [], event: [], scale: [] };
  for (const p of f1) {
    const f = field(p);
    if (f.year) haveYear++; else if (missing.year.length < 3) missing.year.push(p.slug);
    if (f.maker) haveMaker++; else if (missing.maker.length < 3) missing.maker.push(p.slug);
    if (f.event) haveEvent++; else if (missing.event.length < 3) missing.event.push(p.slug);
    if (f.scale) haveScale++; else if (missing.scale.length < 3) missing.scale.push(`${p.sku}  ${p.slug.slice(0, 60)}`);
    if (f.year && f.maker && f.event && f.scale) haveAll++;
  }
  const pct = n => `${((n / f1.length) * 100).toFixed(0)}%`;
  console.log(`  year  : ${haveYear} (${pct(haveYear)})`);
  console.log(`  maker : ${haveMaker} (${pct(haveMaker)})`);
  console.log(`  event : ${haveEvent} (${pct(haveEvent)})`);
  console.log(`  scale : ${haveScale} (${pct(haveScale)})   from the part number`);
  console.log(`  ALL FOUR (importable): ${haveAll} (${pct(haveAll)})`);

  const era = {};
  for (const p of f1) {
    const f = field(p);
    if (!(f.year && f.maker && f.event && f.scale)) continue;
    const d = `${String(f.year).slice(0, 3)}0s`;
    era[d] = (era[d] || 0) + 1;
  }
  console.log('\nimportable rows by decade:');
  for (const [k, v] of Object.entries(era).sort()) console.log(`   ${k}  ${v}`);
  const byCat = {};
  for (const p of f1) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log('F1 products by category:');
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`   ${String(v).padStart(5)}  ${k}`);

  for (const [k, list] of Object.entries(missing)) {
    if (!list.length) continue;
    console.log(`\nno ${k} found in these, for example:`);
    for (const s of list) console.log(`   ${s.slice(0, 84)}`);
  }

  if (only) {
    const hits = f1.filter(p => p.slug.includes(only.toLowerCase()));
    console.log(`\n"${only}" — ${hits.length} F1 products`);
    for (const p of hits.slice(0, 25)) {
      const f = field(p);
      console.log(`   ${String(p.sku).padEnd(14)} ${String(f.year || '????').padEnd(5)} ${String(f.maker || '?').padEnd(12)} ${String(f.event || '—').padEnd(22)} ${p.slug.slice(0, 50)}`);
    }
  }
};

main().catch(e => { console.error(e.message); process.exit(1); });
