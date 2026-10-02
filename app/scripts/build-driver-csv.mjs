/**
 * Turn cached miniatures-minichamps product pages into a sync-csv CSV, for any
 * historic driver.
 *
 *   node scripts/minichamps-fetch.mjs prost            # cache his pages first
 *   node scripts/build-driver-csv.mjs --driver prost --review
 *   node scripts/build-driver-csv.mjs --driver prost > ../f1_prost_NEW.csv
 *
 * WHY THIS REPLACED THREE NEAR-IDENTICAL SCRIPTS
 *
 * build-villeneuve-csv.mjs and build-lauda-csv.mjs were 90% the same file. The
 * event vocabulary, the maker map, the exclusions and the output format never
 * change; only the chassis table, the team list and the name do. By the third
 * driver a fix to the shared half would have had to be made in three places,
 * and the one most likely to be forgotten is the one nobody is looking at.
 *
 * WHAT IS SHARED, AND WHY EACH PART EXISTS
 *
 * - EVENTS. The shop writes races in French, with Italian and English mixed
 *   in. This is the union of every spelling seen across four drivers and four
 *   decades. Order matters: specific rounds and named tests are read before
 *   anything generic, or a Long Beach car becomes a plain United States GP and
 *   a test session becomes a race.
 *
 * - The PART NUMBER comes from the page, not the URL. 26 of Lauda's 96 URLs
 *   end in a truncated tail -- `029a` where the page says `GP43-029A`. GP
 *   Replicas and Tecnomodel both truncate, and they dominate the historic
 *   catalogue. A stored fragment matches nothing anywhere.
 *
 * - A row whose chassis, team, maker, year or part number cannot be read is
 *   printed to --review and LEFT OUT. Nothing is guessed. This is the rule
 *   that the 2019 researched CSV broke, inventing three races that never
 *   happened.
 *
 * - The CHASSIS-AGAINST-YEAR table printed by --review is the check that has
 *   caught every real bug so far: five 126C2s dated 1980 where the "2" was
 *   Villeneuve's race number, and it confirmed Lauda's 312B3 in 1975 and his
 *   BT46 in 1977 were right rather than wrong. Every pair should be a car that
 *   actually existed that year. Read it before importing.
 *
 * WHAT IS PER-DRIVER
 *
 * Chassis spellings, the teams he drove for, his career years, and the
 * products that carry his name without being his cars. That last one is not an
 * edge case: every driver so far has had some.
 */
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const KEY = args.includes('--driver') ? args[args.indexOf('--driver') + 1] : null;
const REVIEW = args.includes('--review');

/* ------------------------------------------------------------------ shared */

/**
 * Race names as this shop writes them, specific before generic.
 *
 * Named tests keep their location, which the Villeneuve import set as the
 * precedent with "Imola Test" rather than flattening everything to "Test".
 */
const EVENTS = [
  [/essais-canada/, 'Canada Test'],
  [/test-paul-ricard|essais-paul-ricard|paul-ricard/, 'Paul Ricard Test'],
  [/test-zandvoort/, 'Zandvoort Test'],
  [/essais-imola/, 'Imola Test'],
  [/aeroporto-istrana/, 'Istrana Airfield'],
  [/aeroport-de-trevie|trevie|starfighter/, 'Treviso Airfield'],
  // Specific United States rounds first. Up to three ran in a year and the
  // shop names them inconsistently; a bare "usa" rule above these captures all
  // of them and mislabels Long Beach as a generic United States GP.
  [/usa-ouest|long-beach/, 'United States GP West'],
  [/usa-est|watkins/, 'United States GP East'],
  [/(^|-)detroit(-|$)/, 'Detroit GP'],
  [/(^|-)dallas(-|$)/, 'Dallas GP'],
  [/(^|-)phoenix(-|$)/, 'Phoenix GP'],
  [/grand-prix-des-usa|(^|-)usa(-|$)|las-vegas/, 'United States GP'],
  [/afrique-du-sud|kyalami/, 'South African GP'],
  [/(^|-)angleterre(-|$)|grande-bretagne|silverstone|brands-hatch/, 'British GP'],
  [/(^|-)espagne(-|$)|jarama|montjuich|(^|-)jerez(-|$)/, 'Spanish GP'],
  [/(^|-)belgique(-|$)|zolder|francorchamps|(^|-)spa(-|$)/, 'Belgian GP'],
  [/saint-marin|san-marino|(^|-)imola(-|$)/, 'San Marino GP'],
  [/(^|-)italie(-|$)|monza/, 'Italian GP'],
  [/(^|-)autriche(-|$)|osterreich|zeltweg/, 'Austrian GP'],
  [/(^|-)allemagne(-|$)|hockenheim|nurburgring/, 'German GP'],
  [/(^|-)hongrie(-|$)|hungaroring/, 'Hungarian GP'],
  [/(^|-)pays-bas(-|$)|zandvoort/, 'Dutch GP'],
  [/montecarlo|monte-carlo|(^|-)monaco(-|$)/, 'Monaco GP'],
  [/(^|-)canada(-|$)|montreal/, 'Canadian GP'],
  [/(^|-)mexique(-|$)|mexico/, 'Mexican GP'],
  [/(^|-)bresil(-|$)|interlagos|jacarepagua/, 'Brazilian GP'],
  [/(^|-)argentine(-|$)/, 'Argentine GP'],
  [/(^|-)japon(-|$)|fuji|suzuka/, 'Japanese GP'],
  [/(^|-)australie(-|$)|adelaide/, 'Australian GP'],
  [/(^|-)suede(-|$)|anderstorp/, 'Swedish GP'],
  [/(^|-)portugal(-|$)|estoril/, 'Portuguese GP'],
  [/(^|-)europe(-|$)|donington/, 'European GP'],
  [/(^|-)pacifique(-|$)|aida/, 'Pacific GP'],
  [/(^|-)france(-|$)|dijon|castellet|magny/, 'French GP'],
  // Last, so every named race and named test wins first. Catches prototype and
  // test cars that never started a Grand Prix, which "Season" would misfile.
  [/(^|-)test(-|$)|essais|prototype|practice/, 'Test'],
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

/* ------------------------------------------------------------- per driver */

const DRIVERS = {
  villeneuve: {
    name: 'Gilles Villeneuve',
    cache: 'gilles-villeneuve-pages.json',
    /**
     * ALREADY IMPORTED. DO NOT RE-IMPORT THIS ONE WITHOUT READING THIS.
     *
     * His 76 models are in the catalogue keyed on the URL part number, from
     * before the page-ref rule existed. `skuFrom: 'url'` reproduces that, so
     * the SKUs still match what was stored.
     *
     * The EVENTS have moved on underneath him, though. The shared vocabulary
     * now reads a bare "imola" as the San Marino GP, which is correct and
     * which his original import filed as "Season". Two of his rows change,
     * and since the event is part of what identifies a car, re-importing
     * would create two NEW cars rather than matching the existing ones.
     *
     * This config exists so the script can be verified against a known import,
     * not so it can be run again.
     */
    skuFrom: 'url',
    teams: [[/^ferrari|(-)ferrari/, 'Ferrari'], [/mclaren/, 'McLaren']],
    chassis: [
      // The shop's own typo, on one product. Spelled out rather than loosened
      // into the pattern below, where it would start matching part numbers.
      [/(^|-)1256ck(-|$)/, '126CK'],
      /**
       * 126C2 requires the 2 attached to the c. In 1980 Villeneuve carried
       * number 2, so "126c-2" is a 126C running as car 2 -- the 126C2 did not
       * exist until 1982. Allowing a separator read the RACE NUMBER as part of
       * the chassis and put five 126C2s into 1980.
       */
      [/126-?c2(?![a-z0-9])/, '126C2'], [/126\s*-?\s*ck/, '126CK'],
      [/126\s*-?\s*cx/, '126CX'], [/126-?c(?![a-z0-9])/, '126C'],
      [/312\s*-?\s*t\s*-?\s*5/, '312T5'], [/312\s*-?\s*t\s*-?\s*4/, '312T4'],
      [/312\s*-?\s*t\s*-?\s*3/, '312T3'],
      [/312\s*-?\s*t\s*-?\s*2\s*b/, '312T2B'], [/312\s*-?\s*t\s*-?\s*2/, '312T2'],
      [/(^|-)m23(-|$)/, 'M23'],
    ],
    // Ferrari raced no other car in 1982, so a 126C dated 1982 is the shop
    // dropping the 2. Narrow and stated rather than inferred.
    correct: (c, y) => (c === '126C' && y >= 1982 ? '126C2' : c),
  },

  lauda: {
    name: 'Niki Lauda',
    cache: 'lauda-pages.json',
    /**
     * Mercedes W10s from Monaco 2019, driven by Hamilton and Bottas weeks
     * after he died, sold as "hommage à Niki Lauda". Five of them.
     */
    exclude: [[/hommage/, 'a 2019 Mercedes tribute, not his car']],
    /**
     * No engine suppliers. His slugs read brabham-alfa-romeo-bt46b and
     * mclaren-tag-porsche-mp4-2; matching a marque anywhere would file
     * Brabhams under Alfa Romeo, which is the bug that put 11 Williams under
     * Mercedes in 2017.
     *
     * Ligier is deliberately absent: one product reads "ligier-js7-26-niki-
     * lauda-f1-test-zandvoort-1977", when he was contracted to Ferrari and
     * JS7 #26 was Laffite's. The row goes to --review for a person.
     */
    teams: [
      [/(^|-)march(-|\d)/, 'March'], [/(^|-)brm(-|\d)/, 'BRM'],
      [/(^|-)ferrari/, 'Ferrari'], [/(^|-)brabham/, 'Brabham'],
      [/(^|-)mclaren/, 'McLaren'],
    ],
    chassis: [
      [/mp4\s*-?\s*1\s*-?\s*b/, 'MP4/1B'], [/mp4\s*-?\s*1\s*-?\s*c/, 'MP4/1C'],
      [/mp4\s*-?\s*2\s*-?\s*b/, 'MP4/2B'], [/mp4\s*-?\s*2(?![a-z0-9])/, 'MP4/2'],
      [/312\s*-?\s*t\s*-?\s*2\s*-?\s*b/, '312T2B'],
      [/312\s*-?\s*t\s*-?\s*2(?![a-z0-9])/, '312T2'],
      [/312\s*-?\s*b\s*-?\s*3/, '312B3'],
      // Refuses a trailing alphanumeric so "312-t-12" reads as a 312T carrying
      // number 12 rather than a chassis called 312T12.
      [/312\s*-?\s*t(?![a-z0-9])/, '312T'],
      [/bt\s*-?\s*46\s*-?\s*b/, 'BT46B'], [/bt\s*-?\s*46(?![a-z0-9])/, 'BT46'],
      [/bt\s*-?\s*45\s*-?\s*c/, 'BT45C'], [/bt\s*-?\s*48(?![a-z0-9])/, 'BT48'],
      [/bt\s*-?\s*49(?![a-z0-9])/, 'BT49'],
      [/march\s*-?\s*721\s*-?\s*x/, '721X'], [/march\s*-?\s*721(?![a-z0-9])/, '721'],
      [/march\s*-?\s*711(?![a-z0-9])/, '711'],
      [/p\s*-?\s*160\s*-?\s*e/, 'P160E'],
    ],
  },

  prost: {
    name: 'Alain Prost',
    cache: 'prost-pages.json',
    /**
     * The Prost AP01 is his TEAM's car, not his.
     *
     * "prost-ap01-f1-1998-olivier-panis" — he founded Prost Grand Prix after
     * retiring in 1993 and never drove for it. His surname is the entrant, and
     * a name match reads it as the driver. Exactly the Lauda-tribute shape:
     * a real car, a real product, and not his.
     */
    exclude: [
      [/ap01|prost-grand-prix/, "his team's car, which he never drove"],
      /**
       * The 1977 Renault RS01, demo-driven by him at Monaco in 2018.
       *
       * A real car and a real drive, and wrong on both axes the catalogue
       * cares about: the slug dates it 2018 and names Monaco, so it would
       * import as a 2018 Monaco GP entry for a car that last raced in 1979.
       * The modern season generator already excludes this same product.
       */
      [/rs01/, 'a 1977 car demo-driven at Monaco 2018, not a race entry'],
    ],
    teams: [
      [/(^|-)mclaren/, 'McLaren'], [/(^|-)renault/, 'Renault'],
      [/(^|-)ferrari/, 'Ferrari'], [/(^|-)williams/, 'Williams'],
    ],
    chassis: [
      // McLaren letters before the base number, longest first.
      [/mp4\s*-?\s*2\s*-?\s*c/, 'MP4/2C'], [/mp4\s*-?\s*2\s*-?\s*b/, 'MP4/2B'],
      [/mp4\s*-?\s*2(?![a-z0-9])/, 'MP4/2'], [/mp4\s*-?\s*3(?![a-z0-9])/, 'MP4/3'],
      [/mp4\s*-?\s*4\s*-?\s*b/, 'MP4/4B'], [/mp4\s*-?\s*4(?![a-z0-9])/, 'MP4/4'],
      [/mp4\s*-?\s*5(?![a-z0-9])/, 'MP4/5'],
      [/(^|-)m29(-|$)/, 'M29'], [/(^|-)m30(-|$)/, 'M30'],
      [/re\s*-?\s*30\s*-?\s*b/, 'RE30B'], [/re\s*-?\s*40(?![a-z0-9])/, 'RE40'],
      /**
       * 643 and 642 before 641, and 641/2 before 641.
       *
       * The 641/2 is a distinct car from the 641; the shop writes it
       * "641-2". It also writes "641-190" for the 641, whose other name is
       * F1-90 — that must not be read as a variant, which is why the 641/2
       * rule requires the 2 with nothing alphanumeric after it.
       */
      /**
       * The shop writes these four ways: "ferrari-643", "ferrari643",
       * "ferrari-f1-643" and a bare "-643-". The marque, the model name and
       * the series number all drift, so each rule accepts any of them.
       */
      [/(?:ferrari|f1)\s*-?\s*643|(^|-)643(?![a-z0-9])/, '643'],
      [/(?:ferrari|f1)\s*-?\s*642|(^|-)642(?![a-z0-9])/, '642'],
      [/641\s*-?\s*2(?![a-z0-9])/, '641/2'], [/641(?![a-z0-9])/, '641'],
      /**
       * FW15 means FW15C. Williams raced only the FW15C in 1993 — the FW15
       * and FW15B were design iterations that never started a race — and the
       * shop drops the letter on three products. Mapping it is reading the
       * shop's shorthand, not guessing a car.
       */
      [/(^|-)fw\s*-?\s*15(\s*-?\s*c)?(?![a-z0-9])/, 'FW15C'],
    ],
  },

  mansell: {
    name: 'Nigel Mansell',
    cache: 'mansell-pages.json',
    teams: [
      [/(^|-)lotus/, 'Lotus'], [/(^|-)williams/, 'Williams'],
      [/(^|-)ferrari/, 'Ferrari'], [/(^|-)mclaren/, 'McLaren'],
    ],
    /**
     * THE ENGINE SITS BETWEEN THE MARQUE AND THE CHASSIS.
     *
     * "lotus-ford-91", "lotus-renault-94t", "ferrari-f1-640",
     * "ferrari-f1-189-640" — the 640's other name is F1-89, so the shop
     * sometimes writes both. Anchoring these rules on the marque dropped nine
     * real models, so the Lotus and Ferrari numbers anchor on a hyphen
     * instead: distinctive enough to stand alone, and the trailing lookahead
     * keeps a car number from being absorbed.
     *
     * The leading (^|-) is load-bearing against the sitemap id that every slug
     * starts with: "915136009-lotus-f1-87" begins with the digits 91, and only
     * the lookahead stops that reading as a Lotus 91.
     */
    chassis: [
      // 88A and 88B are the twin-chassis car, banned in 1981 but run in
      // practice at Long Beach — real products of a car that never started.
      [/(^|-)88\s*-?\s*a(?![a-z0-9])/, '88A'], [/(^|-)88\s*-?\s*b(?![a-z0-9])/, '88B'],
      [/(^|-)95\s*-?\s*t(?![a-z0-9])/, '95T'], [/(^|-)94\s*-?\s*t(?![a-z0-9])/, '94T'],
      [/(^|-)93\s*-?\s*t(?![a-z0-9])/, '93T'], [/(^|-)92(?![a-z0-9])/, '92'],
      [/(^|-)91(?![a-z0-9])/, '91'], [/(^|-)87(?![a-z0-9])/, '87'],
      [/(^|-)81(?![a-z0-9])/, '81'], [/lotus\s*-?\s*79(?![a-z0-9])/, '79'],
      // Williams. The B variants are distinct cars and precede their base.
      [/fw\s*-?\s*11\s*-?\s*b/, 'FW11B'], [/fw\s*-?\s*11(?![a-z0-9])/, 'FW11'],
      [/fw\s*-?\s*13\s*-?\s*b/, 'FW13B'], [/fw\s*-?\s*12(?![a-z0-9])/, 'FW12'],
      [/fw\s*-?\s*14\s*-?\s*b/, 'FW14B'], [/fw\s*-?\s*14(?![a-z0-9])/, 'FW14'],
      [/fw\s*-?\s*16\s*-?\s*b/, 'FW16B'], [/fw\s*-?\s*16(?![a-z0-9])/, 'FW16'],
      [/641\s*-?\s*2(?![a-z0-9])/, '641/2'], [/641(?![a-z0-9])/, '641'],
      [/(^|-)640(?![a-z0-9])/, '640'],
    ],
    /**
     * An FW14 dated 1992 is an FW14B.
     *
     * One product reads "fw14-dirty-version-5-f1-world-champion-1992". Williams
     * raced only the FW14B that season — the FW14 was the 1991 car — so this is
     * the shop dropping the letter, not a different chassis. The part number
     * agrees: Minichamps 436926605 carries 92 in its season position.
     *
     * Same narrow, stated correction as Villeneuve's 126C in 1982, and caught
     * the same way: by a chassis/year pair that could not have existed.
     */
    correct: (c, y) => (c === 'FW14' && y >= 1992 ? 'FW14B' : c),
  },
};

/* ------------------------------------------------------------------ build */

const cfg = DRIVERS[KEY];
if (!cfg) {
  console.error(`usage: --driver <${Object.keys(DRIVERS).join('|')}> [--review]`);
  process.exit(1);
}

const all = JSON.parse(readFileSync(`.feed-cache/miniatures-minichamps/${cfg.cache}`, 'utf8'));

const dropped = [];
const kept = all.filter(o => {
  for (const [re, why] of cfg.exclude || []) {
    if (re.test(o.slug)) { dropped.push([o.urlSku, why]); return false; }
  }
  /**
   * The catalogue has exactly two scale columns, sku_1_18 and sku_1_43, so
   * anything else cannot be represented.
   *
   * This was a 1:12-only check, because 1:12 is what Villeneuve and Lauda
   * happened to contain. Prost has a 1:64, which passed the filter and then
   * produced a CSV row with BOTH sku columns empty — sync-csv would have
   * created the car and no models, leaving an orphan that is invisible on the
   * site by construction. There are already 37 of those from other causes.
   *
   * Stated as a whitelist so the next unexpected scale is excluded rather than
   * silently turned into an orphan.
   */
  if (o.scale !== '1:18' && o.scale !== '1:43') {
    dropped.push([o.urlSku, `${o.scale} — no column for this scale`]);
    return false;
  }
  if (/(^|-)set-/.test(o.slug)) { dropped.push([o.urlSku, 'multi-item set']); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  return true;
});

/**
 * The part number, and whether to trust a short one.
 *
 * A SHORT SKU IS NOT AUTOMATICALLY A FRAGMENT. Brumm genuinely numbers its
 * models `R593`, `R447`, `R267` — four characters is the whole part number,
 * and rejecting those dropped seven real Villeneuve models the first time this
 * rule was written.
 *
 * The truncation problem it was meant to catch is `029a` where the page says
 * `GP43-029A`, and that is already solved by preferring the page's own SKU.
 * So shortness is only suspicious in the one case where we had to fall back to
 * the URL tail because the page stated nothing.
 */
const partNumber = o => {
  const fromPage = String(o.pageRef || '').trim();
  const fromUrl = String(o.urlSku || '').trim();
  const sku = (cfg.skuFrom === 'url' ? fromUrl : fromPage || fromUrl).toLowerCase();
  const guessed = cfg.skuFrom !== 'url' && !fromPage && sku.length < 5;
  return { sku, guessed };
};

/**
 * The entrant is whichever team name appears EARLIEST in the slug.
 *
 * Not the first rule that matches, which is what this did first and which was
 * wrong in a way worth remembering. Prost's 1993 slugs read
 * "williams-renault-fw15c": Williams built it, Renault supplied the engine —
 * but Renault is ALSO a real Prost team from 1981-83, so it sits in his team
 * list legitimately, and listing it above Williams handed five Williams to
 * Renault.
 *
 * Order in the config should not be load-bearing. The slug names the
 * constructor first and the engine second, every time, so position in the
 * STRING is the fact to read. This is the same rule the modern season
 * generator uses, for the same reason: it is how 11 Williams ended up filed
 * under Mercedes in 2017.
 */
const teamIn = slug => {
  let best = null, at = Infinity;
  for (const [re, name] of cfg.teams) {
    const m = slug.match(re);
    if (m && m.index < at) { at = m.index; best = name; }
  }
  return best;
};

const rows = [], review = [];
for (const o of kept) {
  const s = o.slug;
  const raw = (cfg.chassis.find(([re]) => re.test(s)) || [])[1] || null;
  const year = o.year ? Number(o.year) : null;
  const chassis = raw && cfg.correct ? cfg.correct(raw, year) : raw;
  const team = teamIn(s);
  const event = (EVENTS.find(([re]) => re.test(s)) || [])[1] || 'Season';
  const maker = Object.entries(MAKERS).find(([k]) => s.includes(k))?.[1] || null;
  const { sku, guessed } = partNumber(o);

  const missing = [];
  if (!chassis) missing.push('chassis');
  if (!team) missing.push('team');
  if (!maker) missing.push('manufacturer');
  if (!year) missing.push('year');
  if (!sku) missing.push('part number');
  else if (guessed) missing.push('part number looks truncated');
  if (missing.length) { review.push({ o, missing }); continue; }

  rows.push({
    team, driver: cfg.name, event, chassis, year, maker,
    sku18: o.scale === '1:18' ? sku : '',
    sku43: o.scale === '1:43' ? sku : '',
  });
}

/**
 * One row per (part number, scale). The shop lists some products twice under
 * different URLs — the same 1984 MP4/2 appears as both "winner-angleterre" and
 * "winner-grande-bretagne". sync-csv would skip the duplicate anyway, but a
 * CSV that lists a model twice misreports what is being imported, and the
 * count is what a person checks before saying yes.
 */
const unique = [], seen = new Set();
for (const r of rows) {
  const k = `${r.sku18 || r.sku43}|${r.sku18 ? '18' : '43'}`;
  if (seen.has(k)) continue;
  seen.add(k);
  unique.push(r);
}

if (REVIEW) {
  const tally = (arr, f) => Object.entries(arr.reduce((a, r) => (a[f(r)] = (a[f(r)] || 0) + 1, a), {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  console.log(`${cfg.name} — ${all.length} products, kept ${kept.length}, excluded ${dropped.length}:`);
  for (const [sku, why] of dropped) console.log(`   ${String(sku).padEnd(14)} ${why}`);
  console.log(`\nCSV rows        : ${unique.length}${rows.length !== unique.length ? `  (${rows.length - unique.length} duplicate listings merged)` : ''}`);
  console.log(`needing a human : ${review.length}`);
  for (const r of review)
    console.log(`   missing ${r.missing.join('+').padEnd(20)} ${r.o.slug.slice(0, 72)}`);
  console.log(`\nteams  : ${tally(unique, r => r.team)}`);
  console.log(`chassis: ${tally(unique, r => r.chassis)}`);
  console.log(`events : ${tally(unique, r => r.event)}`);
  console.log(`years  : ${Object.keys(unique.reduce((a, r) => (a[r.year] = 1, a), {})).sort().join(' ')}`);
  console.log('\nchassis against year — every pair should be a car that existed that year:');
  const pairs = new Map();
  for (const r of unique) pairs.set(`${r.chassis} ${r.year}`, (pairs.get(`${r.chassis} ${r.year}`) || 0) + 1);
  console.log('   ' + [...pairs].sort().map(([k, v]) => `${k}×${v}`).join('  '));
  const cars = new Set(unique.map(r => [r.year, r.team, r.chassis, r.event].join('|')));
  console.log(`\nwould create ${cars.size} cars from ${unique.length} models`);
  process.exit(0);
}

const NOTE = 'SINGLE SOURCE — miniatures-minichamps.com; scale read from the product page';
console.log('team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status');
for (const r of unique)
  console.log([r.team, r.driver, r.event, r.chassis, r.year, r.maker, r.sku18, r.sku43, '', NOTE].join(','));
