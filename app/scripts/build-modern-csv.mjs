/**
 * Turn cached miniatures-minichamps product pages into a sync-csv CSV, for a
 * modern season.
 *
 *   node scripts/minichamps-fetch.mjs 2017          # read the pages first
 *   node scripts/build-modern-csv.mjs 2017 --review # what it cannot parse
 *   node scripts/build-modern-csv.mjs 2017 > ../f1_2017_GAP2.csv
 *
 * The historic sibling is build-villeneuve-csv.mjs. Same method -- parse the
 * slug, cross-check against what the season actually was, refuse to guess --
 * but the modern grid needs a far wider vocabulary: ten teams, twenty drivers
 * and twenty-odd rounds per year instead of one driver at one team.
 *
 * THREE KINDS OF CONTAMINATION, all seen in the 2017 fetch:
 *
 *   Formula E    12 products. Not F1, and the shared WRONG filter has no term
 *                for it because "formula-e" is not "formula-2".
 *   demo runs     3 products. Mick Schumacher driving a 1994 Benetton at Spa
 *                in 2017: a real product whose CAR is 23 years older than its
 *                slug's year.
 *   fake years   10 products. minichamps-fetch matches its term as a plain
 *                substring, so part number 110201750 -- a 2020 Haas --
 *                contains "2017". Every one would have imported as a 2017 car
 *                with a 2020 chassis.
 *
 * The year is therefore read as a DELIMITED token from the slug with the part
 * number stripped off the end, never as a substring.
 */
import { readFileSync } from 'fs';

const year = Number(process.argv.find(a => /^\d{4}$/.test(a)));
const REVIEW = process.argv.includes('--review');
if (!year) {
  console.error('usage: node scripts/build-modern-csv.mjs <year> [--review]');
  process.exit(1);
}

const src = `.feed-cache/miniatures-minichamps/${year}-pages.json`;
const all = JSON.parse(readFileSync(src, 'utf8'));

/** The year as a delimited token, with the trailing part number removed. */
const yearsIn = slug => {
  const body = slug.replace(/^\d+-/, '').replace(/-[a-z0-9]+$/i, '');
  return [...body.matchAll(/(?:^|-)((?:19|20)\d{2})(?=-|$)/g)].map(m => +m[1]);
};

const EXCLUDE = [
  [/formula-e|formule-e/, 'Formula E'],
  [/demonstration-run|demo-run/, 'demonstration run'],
  [/formule-[23]|formula-[23]|indycar|nascar|motogp|rallye|dtm|24-heures/, 'not F1'],
  [/2-car-set|two-car-set|teamset|team-set|coffret|(?:^|-)set-/, 'multi-car set'],
  /**
   * Road cars in team livery. "renault-megane-rs-f1-team-2017-yellow-metallic"
   * is a hot hatch, not a race car, and it carries "f1-team" so the F1 filter
   * waves it through.
   */
  [/megane|clio|(?:^|-)road-car(?:-|$)|safety-car|medical-car/, 'road car'],
];

const dropped = [];
const kept = all.filter(o => {
  const hit = EXCLUDE.find(([re]) => re.test(o.slug));
  if (hit) { dropped.push([o.urlSku, hit[1]]); return false; }
  if (!yearsIn(o.slug).includes(year)) { dropped.push([o.urlSku, `not a ${year} car`]); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  return true;
});

/** Rounds as this shop names them. French-led, a few English. */
const EVENTS = [
  [/abou?-dhabi/, 'Abu Dhabi GP'], [/australie/, 'Australian GP'],
  [/bahrain|bahrein/, 'Bahrain GP'], [/(?:^|-)chine(?:-|$)/, 'Chinese GP'],
  [/russie/, 'Russian GP'], [/espagne/, 'Spanish GP'],
  [/(?:^|-)monaco(?:-|$)|montecarlo/, 'Monaco GP'], [/(?:^|-)canada(?:-|$)/, 'Canadian GP'],
  [/azerbaidjan|azerbaijan|bakou|baku/, 'Azerbaijan GP'], [/autriche/, 'Austrian GP'],
  [/angleterre|silverstone|grande-bretagne/, 'British GP'], [/hongrie/, 'Hungarian GP'],
  [/belgique|spa-francorchamps/, 'Belgian GP'], [/(?:^|-)italie(?:-|$)|monza/, 'Italian GP'],
  [/singapour/, 'Singapore GP'], [/malaisie/, 'Malaysian GP'],
  [/(?:^|-)japon(?:-|$)|suzuka/, 'Japanese GP'], [/mexique/, 'Mexican GP'],
  [/(?:^|-)bresil(?:-|$)|interlagos/, 'Brazilian GP'], [/(?:^|-)usa(?:-|$)|austin|etats-unis/, 'United States GP'],
  [/allemagne|hockenheim/, 'German GP'], [/(?:^|-)france(?:-|$)|castellet/, 'French GP'],
  [/pays-bas|zandvoort/, 'Dutch GP'], [/portugal|portimao/, 'Portuguese GP'],
  [/toscane|mugello/, 'Tuscan GP'], [/eifel/, 'Eifel GP'], [/sakhir/, 'Sakhir GP'],
  [/styrie/, 'Styrian GP'], [/emilie-romagne|imola/, 'Emilia Romagna GP'],
  [/turquie/, 'Turkish GP'], [/qatar/, 'Qatar GP'], [/arabie-saoudite/, 'Saudi Arabian GP'],
];

/**
 * Chassis by season. Keyed by year so a code cannot leak across seasons -- the
 * mistake that put a 2020 Haas in 2017 before the year filter was tightened.
 */
const CHASSIS = {
  2017: [[/w08/, 'W08'], [/sf70/, 'SF70H'], [/rb13/, 'RB13'], [/vjm10/, 'VJM10'],
         [/fw40/, 'FW40'], [/rs17/, 'RS17'], [/str12/, 'STR12'], [/vf-?17/, 'VF-17'],
         [/mcl32/, 'MCL32'], [/(?:^|-)c36(?:-|$)/, 'C36']],
  2018: [[/w09/, 'W09'], [/sf71/, 'SF71H'], [/rb14/, 'RB14'], [/vjm11/, 'VJM11'],
         [/fw41/, 'FW41'], [/rs18/, 'RS18'], [/str13/, 'STR13'], [/vf-?18/, 'VF-18'],
         [/mcl33/, 'MCL33'], [/(?:^|-)c37(?:-|$)/, 'C37']],
  2019: [[/w10/, 'W10'], [/sf90/, 'SF90'], [/rb15/, 'RB15'], [/rp19/, 'RP19'],
         [/fw42/, 'FW42'], [/rs19/, 'RS19'], [/str14/, 'STR14'], [/vf-?19/, 'VF-19'],
         [/mcl34/, 'MCL34'], [/(?:^|-)c38(?:-|$)/, 'C38']],
  2020: [[/w11/, 'W11'], [/sf1000/, 'SF1000'], [/rb16(?!b)/, 'RB16'], [/rp20/, 'RP20'],
         [/fw43(?!b)/, 'FW43'], [/rs20/, 'RS20'], [/at01/, 'AT01'], [/vf-?20/, 'VF-20'],
         [/mcl35(?!m)/, 'MCL35'], [/(?:^|-)c39(?:-|$)/, 'C39']],
};

/**
 * THE CONSTRUCTOR IS THE ONE THAT COMES FIRST IN THE SLUG.
 *
 * "williams-mercedes-fw40" is a Williams with a Mercedes engine;
 * "haas-ferrari-vf17" is a Haas; "sauber-ferrari-c36" is a Sauber. Picking by
 * list order instead of position gave every one of those to the ENGINE
 * SUPPLIER -- 11 Williams became Mercedes, and Haas and Sauber vanished from
 * the team tally entirely while their chassis sat plainly in the data.
 *
 * So the winner is the match with the smallest index, not the first rule that
 * happens to fire. The chassis/team cross-check below exists to catch this
 * class of error, since a 2017 chassis belongs to exactly one constructor.
 */
const TEAMS = [
  [/red-bull/, 'Red Bull'], [/toro-rosso/, 'Toro Rosso'], [/force-india|racing-point/, 'Force India'],
  [/alpha-?tauri/, 'AlphaTauri'], [/mercedes/, 'Mercedes'], [/ferrari/, 'Ferrari'],
  [/mclaren/, 'McLaren'], [/williams/, 'Williams'], [/renault/, 'Renault'],
  [/haas/, 'Haas'], [/sauber|alfa-romeo/, 'Sauber'],
];
const teamIn = slug => {
  let best = null, at = Infinity;
  for (const [re, name] of TEAMS) {
    const m = slug.match(re);
    if (m && m.index < at) { at = m.index; best = name; }
  }
  return best;
};

/** Which constructor each 2017-2020 chassis belongs to. A disagreement is a bug. */
const CHASSIS_TEAM = {
  W08: 'Mercedes', SF70H: 'Ferrari', RB13: 'Red Bull', VJM10: 'Force India',
  FW40: 'Williams', RS17: 'Renault', STR12: 'Toro Rosso', 'VF-17': 'Haas',
  MCL32: 'McLaren', C36: 'Sauber',
  W09: 'Mercedes', SF71H: 'Ferrari', RB14: 'Red Bull', VJM11: 'Force India',
  FW41: 'Williams', RS18: 'Renault', STR13: 'Toro Rosso', 'VF-18': 'Haas',
  MCL33: 'McLaren', C37: 'Sauber',
  W10: 'Mercedes', SF90: 'Ferrari', RB15: 'Red Bull', RP19: 'Force India',
  FW42: 'Williams', RS19: 'Renault', STR14: 'Toro Rosso', 'VF-19': 'Haas',
  MCL34: 'McLaren', C38: 'Sauber',
  W11: 'Mercedes', SF1000: 'Ferrari', RB16: 'Red Bull', RP20: 'Force India',
  FW43: 'Williams', RS20: 'Renault', AT01: 'AlphaTauri', 'VF-20': 'Haas',
  MCL35: 'McLaren', C39: 'Sauber',
};

/**
 * Surname -> the name as the DATABASE spells it.
 *
 * Keyed on surname because the shop drops first names as often as it includes
 * them: "...-mexique-2017-hamilton-minichamps-..." and
 * "...-malaisie-2017-verstappen-spark-s5050" are ordinary forms. Matching only
 * full names left seven rows unparsed, all of them surname-only.
 *
 * The value is what `drivers.name` holds, NOT a prettified version of the
 * slug. "carlos-sainz-jr" and "carlos-sainz" are the same person and the
 * database calls him Carlos Sainz; deriving the name from the slug produced
 * both spellings and would have created a second driver row for him.
 */
const DRIVERS = {
  hamilton: 'Lewis Hamilton', bottas: 'Valtteri Bottas', vettel: 'Sebastian Vettel',
  raikkonen: 'Kimi Raikkonen', verstappen: 'Max Verstappen', ricciardo: 'Daniel Ricciardo',
  perez: 'Sergio Perez', ocon: 'Esteban Ocon', massa: 'Felipe Massa',
  stroll: 'Lance Stroll', hulkenberg: 'Nico Hulkenberg', palmer: 'Jolyon Palmer',
  sainz: 'Carlos Sainz', kvyat: 'Daniil Kvyat', gasly: 'Pierre Gasly',
  grosjean: 'Romain Grosjean', magnussen: 'Kevin Magnussen', alonso: 'Fernando Alonso',
  vandoorne: 'Stoffel Vandoorne', ericsson: 'Marcus Ericsson', wehrlein: 'Pascal Wehrlein',
  giovinazzi: 'Antonio Giovinazzi', leclerc: 'Charles Leclerc', norris: 'Lando Norris',
  albon: 'Alexander Albon', russell: 'George Russell', kubica: 'Robert Kubica',
  latifi: 'Nicholas Latifi', fittipaldi: 'Pietro Fittipaldi', aitken: 'Jack Aitken',
  mazepin: 'Nikita Mazepin', tsunoda: 'Yuki Tsunoda', sirotkin: 'Sergey Sirotkin',
  hartley: 'Brendon Hartley', button: 'Jenson Button', schumacher: 'Mick Schumacher',
};
/** Longest surname first, so "sainz" cannot win inside another token. */
const SURNAMES = Object.keys(DRIVERS).sort((a, b) => b.length - a.length);
const driverIn = slug => {
  const k = SURNAMES.find(s => new RegExp(`(?:^|-)${s}(?:-|$)`).test(slug));
  return k ? DRIVERS[k] : null;
};

const MAKERS = {
  minichamps: 'Minichamps', spark: 'Spark', looksmart: 'Looksmart', bbr: 'BBR',
  ixo: 'IXO', tecnomodel: 'Tecnomodel', 'gp-replicas': 'GP Replicas',
  'premium-x': 'Premium X', bburago: 'Bburago', burago: 'Bburago', solido: 'Solido',
  norev: 'Norev', truescale: 'TrueScale', tsm: 'TrueScale', edicola: 'Edicola',
  altaya: 'Altaya', onyx: 'Onyx', schuco: 'Schuco', opo: 'OPO', mcg: 'MCG',
  'hot-wheels': 'Hot Wheels', hotwheels: 'Hot Wheels',
};

const chassisFor = CHASSIS[year];
if (!chassisFor) {
  console.error(`no chassis map for ${year} — add one to CHASSIS`);
  process.exit(1);
}

const rows = [], review = [];
for (const o of kept) {
  const s = o.slug;
  const chassis = (chassisFor.find(([re]) => re.test(s)) || [])[1] || null;
  const team = teamIn(s);
  const event = (EVENTS.find(([re]) => re.test(s)) || [])[1] || 'Season';
  const driver = driverIn(s);
  const maker = Object.entries(MAKERS).find(([k]) => s.includes(k))?.[1] || null;

  const missing = [];
  if (!chassis) missing.push('chassis');
  if (!team) missing.push('team');
  if (!driver) missing.push('driver');
  if (!maker) missing.push('manufacturer');
  if (missing.length) { review.push({ o, missing }); continue; }

  // A 2017 chassis belongs to exactly one constructor. A disagreement means
  // the slug was read wrong, not that history is surprising.
  const expect = CHASSIS_TEAM[chassis];
  if (expect && expect !== team) {
    review.push({ o, missing: [`chassis ${chassis} is ${expect}, read team as ${team}`] });
    continue;
  }

  rows.push({
    team, driver, event, chassis, year, maker,
    sku18: o.scale === '1:18' ? o.urlSku : '',
    sku43: o.scale === '1:43' ? o.urlSku : '',
  });
}

if (REVIEW) {
  console.log(`fetched ${all.length}, kept ${kept.length}, excluded ${dropped.length}`);
  const why = {}; for (const [, w] of dropped) why[w] = (why[w] || 0) + 1;
  for (const [w, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${w}`);
  console.log(`\nparsed into CSV rows : ${rows.length}`);
  console.log(`needing a human      : ${review.length}`);
  for (const r of review.slice(0, 20))
    console.log(`   missing ${r.missing.join('+').padEnd(22)} ${r.o.slug.replace(/^\d+-/, '').slice(0, 70)}`);
  const f = (k) => { const t = {}; for (const r of rows) t[r[k]] = (t[r[k]] || 0) + 1; return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${b}`).join(' · '); };
  console.log(`\nteams  : ${f('team')}`);
  console.log(`chassis: ${f('chassis')}`);
  console.log(`scales : 1:18 ${rows.filter(r => r.sku18).length} · 1:43 ${rows.filter(r => r.sku43).length}`);
  console.log(`drivers: ${f('driver')}`);
  process.exit(0);
}

const NOTE = `SINGLE SOURCE — miniatures-minichamps.com; scale read from the product page`;
console.log('team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status');
for (const r of rows)
  console.log([r.team, r.driver, r.event, r.chassis, r.year, r.maker, r.sku18, r.sku43, '', NOTE].join(','));
