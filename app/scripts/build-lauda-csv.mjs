/**
 * Turn the cached Niki Lauda product pages into a sync-csv CSV.
 *
 *   node scripts/build-lauda-csv.mjs > ../f1_lauda_NEW.csv
 *   node scripts/build-lauda-csv.mjs --review     (what it could not parse)
 *
 * Same shape as build-villeneuve-csv.mjs, and most of the event vocabulary is
 * lifted from it. Three things are different enough to be worth stating.
 *
 * 1. THE PART NUMBER COMES FROM THE PAGE, NOT THE URL.
 *
 *    26 of the 96 URLs end in a truncated tail -- `029a` where the page says
 *    `GP43-029A`, `219a` where it says `TM18-219A`. Villeneuve could use the
 *    URL because his products are mostly Minichamps and Brumm, which publish
 *    the full code. Lauda is 39 GP Replicas and 24 Tecnomodel out of 91, and
 *    both truncate. A stored `029a` would match nothing on eBay and nothing in
 *    a shop feed; it is a fragment, not an identifier.
 *
 * 2. THE TEAM IS NOT THE ENGINE.
 *
 *    His slugs read `brabham-alfa-romeo-bt46b`, `mclaren-tag-porsche-mp4-2`,
 *    `mclaren-ford-cosworth-mp4-1b`. Matching a maker name anywhere in the
 *    slug would file Brabhams under Alfa Romeo, which is exactly the bug that
 *    put 11 Williams under Mercedes in the 2017 import. Only the five teams he
 *    actually drove for are listed, and no engine supplier is among them.
 *
 * 3. FIVE PRODUCTS CARRY HIS NAME AND ARE NOT HIS CARS.
 *
 *    Mercedes W10s from Monaco 2019, driven by Hamilton and Bottas weeks after
 *    he died, sold as "hommage à Niki Lauda". Filed as Lauda cars they would
 *    put a 2019 Mercedes on a driver who retired in 1985. Excluded on the
 *    `hommage` token, which all five carry.
 *
 * Nothing here is guessed. A row whose chassis, team or maker cannot be read
 * is printed to --review and left out of the CSV.
 */
import { readFileSync } from 'fs';

const src = '.feed-cache/miniatures-minichamps/lauda-pages.json';
const all = JSON.parse(readFileSync(src, 'utf8'));
const REVIEW = process.argv.includes('--review');

const dropped = [];
const kept = all.filter(o => {
  // Not his car. See note 3 above.
  if (/hommage/.test(o.slug)) { dropped.push([o.urlSku, 'a 2019 Mercedes tribute, not his car']); return false; }
  // 1:12 is a display class the catalogue has no column for — sku_1_18 and
  // sku_1_43 are the only two. Same call as the Villeneuve import.
  if (o.scale === '1:12') { dropped.push([o.urlSku, '1:12 display piece']); return false; }
  if (/(^|-)set-/.test(o.slug)) { dropped.push([o.urlSku, 'multi-item set']); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  return true;
});

/**
 * Race names as this shop writes them: French first, then English.
 *
 * ORDER MATTERS TWICE HERE.
 *
 * `essais-canada` is a Canada test session, not the Canadian GP, so it has to
 * be read before the bare `canada` rule or a test car becomes a race car.
 * Same for `usa-ouest` and `long-beach` ahead of anything generic.
 */
const EVENTS = [
  // Tests first, each named for where it ran — the Villeneuve import set that
  // precedent with "Imola Test" rather than flattening them all to "Test".
  [/essais-canada/, 'Canada Test'],
  [/test-paul-ricard|paul-ricard/, 'Paul Ricard Test'],
  [/test-zandvoort/, 'Zandvoort Test'],
  [/usa-ouest|long-beach/, 'United States GP West'],
  [/usa-est|watkins/, 'United States GP East'],
  [/grand-prix-des-usa|(^|-)usa(-|$)|las-vegas/, 'United States GP'],
  [/afrique-du-sud|kyalami/, 'South African GP'],
  [/(^|-)angleterre(-|$)|grande-bretagne|silverstone|brands-hatch/, 'British GP'],
  [/(^|-)espagne(-|$)|jarama|montjuich/, 'Spanish GP'],
  [/(^|-)belgique(-|$)|zolder|francorchamps/, 'Belgian GP'],
  [/(^|-)italie(-|$)|monza/, 'Italian GP'],
  [/(^|-)autriche(-|$)|osterreich|zeltweg/, 'Austrian GP'],
  [/(^|-)allemagne(-|$)|hockenheim|nurburgring/, 'German GP'],
  [/(^|-)pays-bas(-|$)|zandvoort/, 'Dutch GP'],
  [/montecarlo|monte-carlo|(^|-)monaco(-|$)/, 'Monaco GP'],
  [/(^|-)canada(-|$)|montreal/, 'Canadian GP'],
  [/(^|-)bresil(-|$)|interlagos|jacarepagua/, 'Brazilian GP'],
  [/(^|-)argentine(-|$)/, 'Argentine GP'],
  [/(^|-)japon(-|$)|fuji|suzuka/, 'Japanese GP'],
  [/(^|-)suede(-|$)|anderstorp/, 'Swedish GP'],
  [/(^|-)portugal(-|$)|estoril/, 'Portuguese GP'],
  [/(^|-)france(-|$)|dijon|castellet/, 'French GP'],
  /**
   * Last, so every named race and every named test wins first.
   *
   * This catches the three 1977 BT46 "prototype-test-version" cars. The BT46
   * did not race until 1978 and these record its testing, so "Season" would
   * have filed a car that never started a Grand Prix as a season model.
   */
  [/(^|-)test(-|$)|prototype/, 'Test'],
];

/**
 * Chassis, normalised to one spelling per car, longest first.
 *
 * THE CAR NUMBER IS NOT PART OF THE CHASSIS. `ferrari-312-t-12` is a 312T
 * carrying number 12, not a "312T12"; `ferrari312-b3-12` likewise. This is the
 * same trap that put five 126C2s into 1980 on the Villeneuve import, where the
 * 2 was Villeneuve's race number. The 312T rule therefore requires that no
 * alphanumeric follows the t, so "312-t2" cannot match it and falls through to
 * the 312T2 rule above.
 *
 * Naming follows what the catalogue already holds: MP4/1C with a slash (it is
 * in there), BT52B-style for Brabham, bare codes for the rest.
 */
const CHASSIS = [
  // McLaren: the B and C variants are distinct cars, so they precede the base.
  [/mp4\s*-?\s*1\s*-?\s*b/, 'MP4/1B'],
  [/mp4\s*-?\s*1\s*-?\s*c/, 'MP4/1C'],
  [/mp4\s*-?\s*2\s*-?\s*b/, 'MP4/2B'],
  [/mp4\s*-?\s*2(?![a-z0-9])/, 'MP4/2'],
  // Ferrari. 312T2B before 312T2 before 312T, and 312T refuses a trailing
  // alphanumeric so the car number cannot be absorbed.
  [/312\s*-?\s*t\s*-?\s*2\s*-?\s*b/, '312T2B'],
  [/312\s*-?\s*t\s*-?\s*2(?![a-z0-9])/, '312T2'],
  [/312\s*-?\s*b\s*-?\s*3/, '312B3'],
  [/312\s*-?\s*t(?![a-z0-9])/, '312T'],
  // Brabham. BT46B before BT46.
  [/bt\s*-?\s*46\s*-?\s*b/, 'BT46B'],
  [/bt\s*-?\s*46(?![a-z0-9])/, 'BT46'],
  [/bt\s*-?\s*45\s*-?\s*c/, 'BT45C'],
  [/bt\s*-?\s*48(?![a-z0-9])/, 'BT48'],
  [/bt\s*-?\s*49(?![a-z0-9])/, 'BT49'],
  // March. 721X before 721.
  [/(^|-)?march\s*-?\s*721\s*-?\s*x/, '721X'],
  [/(^|-)?march\s*-?\s*721(?![a-z0-9])/, '721'],
  [/(^|-)?march\s*-?\s*711(?![a-z0-9])/, '711'],
  // BRM.
  [/p\s*-?\s*160\s*-?\s*e/, 'P160E'],
];

/**
 * The five teams he actually drove for, and nothing else.
 *
 * No engine suppliers. "alfa-romeo", "tag", "porsche", "ford", "cosworth" all
 * appear in these slugs as the engine and none of them is the entrant.
 *
 * Ligier is deliberately absent. One product reads
 * "ligier-js7-26-niki-lauda-f1-test-zandvoort-1977", and in 1977 Lauda was
 * contracted to Ferrari while JS7 number 26 was Laffite's car. Either the shop
 * has mislabelled it or it records a test this script has no way to confirm.
 * Leaving Ligier out sends the row to --review, which is the honest outcome:
 * a person can check it, and nothing invented reaches the catalogue.
 */
const TEAMS = [
  [/(^|-)march(-|\d)/, 'March'],
  [/(^|-)brm(-|\d)/, 'BRM'],
  [/(^|-)ferrari/, 'Ferrari'],
  [/(^|-)brabham/, 'Brabham'],
  [/(^|-)mclaren/, 'McLaren'],
];

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
 * The part number the PAGE states, falling back to the URL tail.
 *
 * See note 1 at the top. Lower-cased to match how every other SKU in the
 * catalogue is stored, and how the shop writes them in its own URLs.
 */
const partNumber = o => String(o.pageRef || o.urlSku || '').trim().toLowerCase();

const rows = [], review = [];
for (const o of kept) {
  const s = o.slug;
  const chassis = (CHASSIS.find(([re]) => re.test(s)) || [])[1] || null;
  const team = (TEAMS.find(([re]) => re.test(s)) || [])[1] || null;
  const event = (EVENTS.find(([re]) => re.test(s)) || [])[1] || 'Season';
  const maker = Object.entries(MAKERS).find(([k]) => s.includes(k))?.[1] || null;
  const year = o.year ? Number(o.year) : null;
  const sku = partNumber(o);

  const missing = [];
  if (!chassis) missing.push('chassis');
  if (!team) missing.push('team');
  if (!maker) missing.push('manufacturer');
  if (!year) missing.push('year');
  // A part number under five characters is a fragment, not an identifier, and
  // would match the wrong product or nothing at all.
  if (sku.length < 5) missing.push('part number');
  if (missing.length) { review.push({ o, missing, chassis, team, event, maker, year, sku }); continue; }

  rows.push({
    team, driver: 'Niki Lauda', event, chassis, year, maker,
    sku18: o.scale === '1:18' ? sku : '',
    sku43: o.scale === '1:43' ? sku : '',
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
  const tm = {}; for (const r of rows) tm[r.team] = (tm[r.team] || 0) + 1;
  console.log(`teams: ${Object.entries(tm).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const yr = {}; for (const r of rows) yr[r.year] = (yr[r.year] || 0) + 1;
  console.log(`years: ${Object.keys(yr).sort().map(y => `${y} ${yr[y]}`).join(' · ')}`);
  /**
   * A grid is one team per driver per season. A chassis appearing against a
   * year its car never raced is a parse bug, not history — this is the check
   * that caught the 1980 126C2s, so it runs here too.
   */
  console.log('\nchassis against year (every pair should be a real car):');
  const pairs = new Map();
  for (const r of rows) {
    const k = `${r.chassis} ${r.year}`;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  console.log('   ' + [...pairs].sort().map(([k, v]) => `${k}×${v}`).join('  '));
  process.exit(0);
}

/**
 * One row per (part number, scale).
 *
 * The shop lists some products twice under different URLs: the same 1984
 * MP4/2 appears as both `winner-angleterre-1984` and
 * `winner-grande-bretagne-1984`, and one BT46 prototype appears twice
 * outright. Both spellings resolve to the same race and the same part number,
 * so they are one model.
 *
 * sync-csv would skip the second anyway — it matches on SKU and scale — but a
 * CSV that lists a model twice misreports what is being imported, and the
 * count is the thing a person checks before saying yes.
 */
const unique = [], byKey = new Set();
for (const r of rows) {
  const key = `${r.sku18 || r.sku43}|${r.sku18 ? '1:18' : '1:43'}`;
  if (byKey.has(key)) continue;
  byKey.add(key);
  unique.push(r);
}

const NOTE = 'SINGLE SOURCE — miniatures-minichamps.com; scale read from the product page';
console.log('team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status');
for (const r of unique)
  console.log([r.team, r.driver, r.event, r.chassis, r.year, r.maker, r.sku18, r.sku43, '', NOTE].join(','));
