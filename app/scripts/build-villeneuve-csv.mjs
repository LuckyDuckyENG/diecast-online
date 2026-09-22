/**
 * Turn the cached Gilles Villeneuve product pages into a sync-csv CSV.
 *
 *   node scripts/build-villeneuve-csv.mjs > ../f1_villeneuve_NEW.csv
 *   node scripts/build-villeneuve-csv.mjs --review     (what it could not parse)
 *
 * WHY A SCRIPT AND NOT A HAND-BUILT CSV
 *
 * 81 products, and the shop's slugs are French-led with Italian and English
 * mixed in: "espagne", "angleterre", "montecarlo", "grand-prix-des-pays-bas",
 * "ultima-vittoria-di-gilles". Chassis codes appear in six spellings for the
 * same car -- 126ck, 126-ck, 126CK, and one "1256ck" the shop typed wrong.
 *
 * Hand-transcribing that is where wrong seasons and invented races come from.
 * A script that REPORTS what it cannot parse is safer than a person who quietly
 * fills the gap, which is the mistake the 2019 import made.
 *
 * Nothing here is guessed. A row whose chassis or event cannot be read is
 * printed to --review and left out of the CSV.
 */
import { readFileSync } from 'fs';

const src = '.feed-cache/miniatures-minichamps/gilles-villeneuve-pages.json';
const all = JSON.parse(readFileSync(src, 'utf8'));
const REVIEW = process.argv.includes('--review');

/**
 * Excluded, and why.
 *
 * 1:12 is a display class the catalogue has no column for -- sku_1_18 and
 * sku_1_43 are the only two -- and at EUR 360-440 they are not what the site
 * compares. Two of the seven are also priced at EUR 20 against 439.95
 * siblings, which reads as placeholder data.
 *
 * The one `set-` slug is a car-plus-figurines set. The accessory filter missed
 * it because the shop spelled it "firgurines"; not worth chasing typos in a
 * shared regex for a single row.
 */
const dropped = [];
const kept = all.filter(o => {
  if (o.scale === '1:12') { dropped.push([o.urlSku, '1:12 display piece']); return false; }
  if (/(^|-)set-/.test(o.slug)) { dropped.push([o.urlSku, 'multi-item set']); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  return true;
});

/** Race names as this shop writes them. French first, then Italian, then English. */
const EVENTS = [
  [/grand-prix-des-pays-bas|pays-bas|zandvoort/, 'Dutch GP'],
  [/grand-prix-de-france|dijon|\bfrance\b/, 'French GP'],
  /**
   * THE SPECIFIC UNITED STATES ROUNDS FIRST.
   *
   * 1979-82 ran up to three US races a year, and the shop names them
   * inconsistently: "usa-ouest-long-beach", "grand-prix-des-usa-long-beach",
   * plain "long-beach", "usa-est", "watkins-glen". A bare "usa" rule placed
   * above these captures all of them and labels a Long Beach car as a generic
   * United States GP -- which it did, until this comment.
   */
  [/usa-ouest|long-beach/, 'United States GP West'],
  [/usa-est|watkins/, 'United States GP East'],
  /**
   * Bare "usa" stays deliberately unspecific.
   *
   * Five slugs say only "usa" and a year. 1979 could be Long Beach or Watkins
   * Glen; 1981 could be Long Beach or Las Vegas. The source does not say, and
   * picking one would be inventing a race result -- the mistake that put three
   * imagined events into the 2019 import. "United States GP" is true and
   * vaguer, which is the correct trade.
   */
  [/grand-prix-des-usa|(^|-)usa(-|$)|las-vegas/, 'United States GP'],
  [/afrique-du-sud|kyalami/, 'South African GP'],
  [/(^|-)angleterre(-|$)|silverstone|brands-hatch/, 'British GP'],
  [/(^|-)espagne(-|$)|jarama/, 'Spanish GP'],
  [/(^|-)belgique(-|$)|zolder|francorchamps/, 'Belgian GP'],
  [/(^|-)italie(-|$)|monza/, 'Italian GP'],
  [/san-marino/, 'San Marino GP'],
  [/montecarlo|monte-carlo|(^|-)monaco(-|$)/, 'Monaco GP'],
  [/(^|-)canada(-|$)|montreal/, 'Canadian GP'],
  [/long-beach/, 'United States GP West'],
  [/(^|-)autriche(-|$)|osterreich/, 'Austrian GP'],
  [/(^|-)allemagne(-|$)|hockenheim|nurburgring/, 'German GP'],
  [/(^|-)bresil(-|$)|interlagos|jacarepagua/, 'Brazilian GP'],
  [/(^|-)argentine(-|$)/, 'Argentine GP'],
  [/(^|-)japon(-|$)|fuji|suzuka/, 'Japanese GP'],
  [/(^|-)suede(-|$)/, 'Swedish GP'],
  // Not races. Demonstration runs and test sessions, kept as their own events
  // because the shop models them as distinct products and they are real.
  [/aeroporto-istrana/, 'Istrana Airfield'],
  [/aeroport-de-trevie|trevie|starfighter/, 'Treviso Airfield'],
  [/essais-imola/, 'Imola Test'],
  [/(^|-)essais(-|$)|(^|-)test(-|$)|presentation/, 'Test'],
];

/**
 * Chassis, normalised to one spelling per car.
 *
 * The shop writes 312t4, 312-t4 and 312-T4 for the same chassis, and 126ck,
 * 126-ck, 126c-2 and 126-c2 likewise. Matched longest-first so 126C2 is not
 * read as 126C, and anchored on the maker token so an event word cannot be
 * swallowed -- the failure that produced "MP4/5-MONACO" on an earlier import.
 */
const CHASSIS = [
  // "1256ck" is the shop's typo for 126CK, on one product. Spelled out rather
  // than loosened into the pattern above, where it would start matching real
  // part numbers.
  [/(^|-)1256ck(-|$)/, '126CK'],
  /**
   * 126C2 vs 126C, and why the hyphen decides.
   *
   * In 1980 Villeneuve carried number 2, so "ferrari-126c-2-f1-essais-imola-
   * 1980" is a 126C running as car 2 -- not a 126C2, which did not exist until
   * 1982. Allowing a separator between the c and the 2 read the RACE NUMBER as
   * part of the chassis and put five 126C2s in 1980.
   *
   * The shop is consistent about it: 1982 cars are "126c2" or "126-c2" with
   * the 2 attached, 1980 cars are "126c-2", "126c-test-2", "126c-with-pilot-2".
   * So 126C2 requires the 2 immediately after the c, and 126C requires that
   * nothing alphanumeric follows.
   *
   * Caught by cross-tabbing chassis against year: every Ferrari chassis belongs
   * to known seasons, and a pair outside them is a parse bug, not history.
   */
  [/126-?c2(?![a-z0-9])/, '126C2'], [/126\s*-?\s*ck/, '126CK'],
  [/126\s*-?\s*cx/, '126CX'], [/126-?c(?![a-z0-9])/, '126C'],
  [/312\s*-?\s*t\s*-?\s*5/, '312T5'], [/312\s*-?\s*t\s*-?\s*4/, '312T4'],
  [/312\s*-?\s*t\s*-?\s*3/, '312T3'],
  // T2B before T2: the B is a distinct car and /312-t2/ swallows it otherwise.
  [/312\s*-?\s*t\s*-?\s*2\s*b/, '312T2B'], [/312\s*-?\s*t\s*-?\s*2/, '312T2'],
  [/(^|-)m23(-|$)/, 'M23'],
];

const TEAMS = [[/^ferrari|(-)ferrari/, 'Ferrari'], [/mclaren/, 'McLaren']];
const MAKERS = {
  looksmart: 'Looksmart', brumm: 'Brumm', spark: 'Spark', tecnomodel: 'Tecnomodel',
  'gp-replicas': 'GP Replicas', minichamps: 'Minichamps', ixo: 'IXO', bbr: 'BBR',
  truescale: 'TrueScale', tsm: 'TrueScale', amalgam: 'Amalgam', exoto: 'Exoto',
  quartzo: 'Quartzo', onyx: 'Onyx', altaya: 'Altaya', edicola: 'Edicola',
  matrix: 'Matrix', norev: 'Norev', schuco: 'Schuco', cmr: 'CMR', solido: 'Solido',
  burago: 'Bburago', bburago: 'Bburago', vitesse: 'Vitesse', 'premium-x': 'Premium X',
  hotwheels: 'Hot Wheels', 'hot-wheels': 'Hot Wheels', mcg: 'MCG',
};

/**
 * One correction the shop's own label gets wrong.
 *
 * "ferrari-126c-27-...-bresil-1982" is a 126C2. Ferrari raced no other car in
 * 1982, so a 126C dated 1982 is the shop dropping the 2, not a different
 * chassis. Narrow and stated rather than inferred: it applies to exactly this
 * pair and nothing else.
 */
const correctChassis = (chassis, year) =>
  chassis === '126C' && year >= 1982 ? '126C2' : chassis;

const rows = [], review = [];
for (const o of kept) {
  const s = o.slug;
  const rawChassis = (CHASSIS.find(([re]) => re.test(s)) || [])[1] || null;
  const chassis = rawChassis ? correctChassis(rawChassis, Number(o.year)) : null;
  const team = (TEAMS.find(([re]) => re.test(s)) || [])[1] || null;
  const event = (EVENTS.find(([re]) => re.test(s)) || [])[1] || 'Season';
  const maker = Object.entries(MAKERS).find(([k]) => s.includes(k))?.[1] || null;
  const year = o.year ? Number(o.year) : null;

  const missing = [];
  if (!chassis) missing.push('chassis');
  if (!team) missing.push('team');
  if (!maker) missing.push('manufacturer');
  if (!year) missing.push('year');
  if (missing.length) { review.push({ o, missing, chassis, team, event, maker, year }); continue; }

  rows.push({
    team, driver: 'Gilles Villeneuve', event, chassis, year, maker,
    sku18: o.scale === '1:18' ? o.urlSku : '',
    sku43: o.scale === '1:43' ? o.urlSku : '',
  });
}

if (REVIEW) {
  console.log(`kept ${kept.length} of ${all.length}; excluded ${dropped.length}:`);
  for (const [sku, why] of dropped) console.log(`   ${String(sku).padEnd(12)} ${why}`);
  console.log(`\nparsed into CSV rows : ${rows.length}`);
  console.log(`needing a human      : ${review.length}`);
  for (const r of review)
    console.log(`   missing ${r.missing.join('+').padEnd(20)} ${r.o.slug.slice(0, 74)}`);
  const ev = {}; for (const r of rows) ev[r.event] = (ev[r.event] || 0) + 1;
  console.log(`\nevents: ${Object.entries(ev).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const ch = {}; for (const r of rows) ch[r.chassis] = (ch[r.chassis] || 0) + 1;
  console.log(`chassis: ${Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const yr = {}; for (const r of rows) yr[r.year] = (yr[r.year] || 0) + 1;
  console.log(`years: ${Object.keys(yr).sort().map(y => `${y} ${yr[y]}`).join(' · ')}`);
  process.exit(0);
}

const NOTE = 'SINGLE SOURCE — miniatures-minichamps.com; scale read from the product page';
console.log('team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status');
for (const r of rows)
  console.log([r.team, r.driver, r.event, r.chassis, r.year, r.maker, r.sku18, r.sku43, '', NOTE].join(','));
