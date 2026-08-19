/**
 * Build a season CSV from the shops' own product feeds.
 *
 *   node scripts/build-season-csv.mjs --year 2026
 *   node scripts/build-season-csv.mjs --year 2026 --out ../f1_2026_models_by_team.csv
 *
 * WHY THIS EXISTS
 *
 * The catalogue is imported from hand-built CSVs. That works for a finished
 * season, where a settled list exists to be transcribed. It does not work for
 * the CURRENT season: models are announced and released continuously, so there
 * is nothing complete to copy. The shops are the live record.
 *
 * And the data is already being downloaded. A retailer sweep pulls a shop's
 * whole catalogue, matches on SKU, and discards everything it does not
 * recognise. For 2026 that discarded remainder IS the season -- 164 F1 products
 * at Anthony's, 179 at Downies, 60 at Stone Model, none of which the catalogue
 * has ever heard of.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not write to the database. It emits a CSV for sync-csv.js, which is
 * proven, and puts a person between the matcher and the tables. That matters
 * more here than anywhere else so far: everywhere else a bad match produces a
 * wrong price on a real car, which is visible and fixable. Here a bad match
 * invents a CAR THAT NEVER EXISTED -- a page about nothing, that then attracts
 * its own eBay links and retailer rows and looks entirely legitimate forever.
 *
 * HOW IT READS A TITLE
 *
 * Shops write titles differently:
 *
 *   Anthony's    1:43 2026 Oscar Piastri -- Miami GP -- #81 McLaren MCL40 -- Spark F1
 *   Downies      McLaren Mastercard F1 Team MCL40 No.1 Monaco GP 2026 - Lando Norris - 1:43
 *   Stone Model  [Pre-Order] Ferrari HP F1 SF-26 #44 Lewis Hamilton British GP Podium 2026
 *
 * Writing a parser per shop would be three brittle regexes that break whenever
 * anyone edits a product title. Instead this runs in two passes:
 *
 *   1. BOOTSTRAP. Anthony's format is rigidly structured, so parse it strictly
 *      to learn the season's vocabulary -- which chassis exist, which team each
 *      belongs to, which drivers and events appear.
 *   2. EXTRACT. Use that vocabulary to pull fields out of ANY title by
 *      recognition rather than by position. A title mentioning "MCL40" and
 *      "Piastri" and "Monaco GP" yields the same car whatever order they are in.
 *
 * The vocabulary is also the fence. A 2026 grid is 11 teams and ~22 drivers, so
 * anything outside it is self-evidently wrong -- which is exactly why this is a
 * good season to try first, and why the 1990s would not be.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m && !line.startsWith('#')) process.env[m[1]] = m[2].trim();
}
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const UA = { 'User-Agent': 'diecasts.app catalogue matcher (+https://diecasts.app)' };

/**
 * Shops with a Shopify feed that carry current-season F1.
 *
 * Mini Model Shop, Yuui and Notjustcollectibles are omitted on evidence, not
 * oversight: all three returned ZERO 2026 F1 products. They are back-catalogue
 * specialists, the mirror image of Metro Hobbies. Fetching them would cost four
 * minutes to learn nothing.
 */
const SHOPS = [
  { name: "Anthony's", host: 'anthonysdiecasts.com.au', structured: true },
  { name: 'Downies', host: 'www.downies.com' },
  { name: 'Stone Model', host: 'www.stonemodelcar.com' },
  { name: 'Horizondiecast', host: 'horizondiecast.com' },
];

const PAGE_SIZE = 250;
const MAX_PAGES = 60;
const DELAY_MS = 400;

/** Only scales the CSV has columns for. 1:64, 1:12 and 1:24 are out by design. */
const SCALES = ['1:18', '1:43'];

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const YEAR = arg('--year', '2026');
const OUT = arg('--out', path.join('..', `f1_${YEAR}_models_by_team.csv`));
const NO_CACHE = process.argv.includes('--no-cache');
const CACHE_DIR = path.join(process.cwd(), '.feed-cache');

// ---------------------------------------------------------------- fetching

async function fetchFeed(shop) {
  const cacheFile = path.join(CACHE_DIR, `${shop.host.replace(/[^a-z0-9]/gi, '_')}.json`);

  if (!NO_CACHE && existsSync(cacheFile)) {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    // A cached empty feed is almost always a rate-limited run that got saved,
    // not a shop with no products. Refetch rather than trust it -- an earlier
    // session cached four empty feeds after a 429 and they read as authoritative.
    if (cached.length) {
      console.log(`  ${shop.name}: ${cached.length} variants (cached)`);
      return cached;
    }
  }

  const variants = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    let res;
    try {
      res = await fetch(`https://${shop.host}/products.json?limit=${PAGE_SIZE}&page=${page}`, {
        headers: UA,
      });
    } catch (err) {
      console.warn(`  ⚠️ ${shop.name} page ${page}: ${err.message}`);
      break;
    }
    if (res.status === 429) {
      // Loud, because the failure mode is a shop that looks empty.
      console.error(`  ❌ ${shop.name}: HTTP 429 rate limited — wait and re-run. NOT caching.`);
      return [];
    }
    if (!res.ok) {
      console.warn(`  ⚠️ ${shop.name} page ${page}: HTTP ${res.status}`);
      break;
    }

    const json = await res.json();
    if (!json.products?.length) break;

    for (const product of json.products) {
      for (const v of product.variants || []) {
        variants.push({
          sku: (v.sku || '').trim(),
          title: product.title || '',
          price: parseFloat(v.price),
          available: v.available !== false,
          url: `https://${shop.host}/products/${product.handle}`,
        });
      }
    }

    if (json.products.length < PAGE_SIZE) break;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  if (variants.length) {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(variants));
  }
  console.log(`  ${shop.name}: ${variants.length} variants`);
  return variants;
}

// ---------------------------------------------------------------- filtering

/**
 * F1 only.
 *
 * Anthony's 2026 stock is 258 products of which 94 are Le Mans, Nürburgring,
 * LMGT3, LMP2 and WEC. Those share the year, the manufacturers and often the
 * teams, so a year filter alone pulls in a Ferrari 499P as readily as an SF-26.
 *
 * Helmets are excluded explicitly. They are 1:5, they name a driver and a race,
 * and they would otherwise parse as cars -- 7 of the 17 unparsed Anthony's
 * titles were helmets.
 */
const ENDURANCE = /24h|Le\s*Mans|LMGT3|LMP2|\bWEC\b|Nurburgring|Nürburgring|Daytona|Sebring|Bathurst|GT3|Hypercar/i;
const NOT_A_CAR = /helmet|figurine\s*only|display\s*case|showcase|book|poster|cap\b|t-?shirt/i;

const isF1 = title =>
  /\bF1\b|formula\s*1|\bGP\b|grand\s*prix/i.test(title) &&
  !ENDURANCE.test(title) &&
  !NOT_A_CAR.test(title);

const scaleOf = title => {
  const m = title.match(/\b1[:\/\- ](12|18|24|43|64)\b/);
  return m ? `1:${m[1]}` : null;
};

// ---------------------------------------------------------------- bootstrap

/**
 * Anthony's strict format, which is where the vocabulary comes from:
 *
 *   (Pre-Order) 1:43 2026 Oscar Piastri -- Miami GP -- #81 McLaren MCL40 -- Spark F1
 *
 * 147 of its 164 F1 titles match this exactly. The 17 that do not are helmets
 * and one Bburago with no event, both of which should be skipped anyway.
 */
const ANTHONYS = /^1[:\/](\d{2})\s+(\d{4})\s+(.+?)\s+--\s+(.+?)\s+--\s+#(\S+)\s+(.+?)\s+--\s+(\S+)\s+F1$/i;

function parseStructured(title) {
  const clean = title.replace(/^\s*[\(\[]\s*pre-?order\s*[\)\]]\s*/i, '').trim();
  const m = clean.match(ANTHONYS);
  if (!m) return null;
  return {
    scale: `1:${m[1]}`,
    year: m[2],
    driver: m[3].trim(),
    event: m[4].trim(),
    number: m[5],
    teamChassis: m[6].trim(),
    manufacturer: m[7].trim(),
  };
}

/**
 * "McLaren MCL40" -> { team: 'McLaren', chassis: 'MCL40' }
 *
 * The chassis is the last token, which holds across the whole 2026 grid
 * (MCL40, SF-26, RB22, W17E, AMR26, A526, FW48, VCARB-03, VF-26, R26, MAC-26)
 * because a chassis code always carries a digit and a team name never ends in
 * one.
 */
function splitTeamChassis(s) {
  const parts = s.split(/\s+/);
  const chassis = parts.pop();
  return { team: parts.join(' ') || null, chassis };
}

// ---------------------------------------------------------------- normalising

/** Trailing result/placing wording. "British GP Winner" is the same RACE as
 *  "British GP" — one car, several models. Left on, one race becomes three cars. */
const RESULT_SUFFIX =
  /\s+(winner|win|1st(\s+place)?|2nd(\s+place)?|3rd(\s+place)?|\d+th(\s+place)?|podium|pole(\s+position)?|fastest\s+lap|world\s+champion(ship)?(\s+winner)?|champion|first\s+win|debut|dnf|retirement)\b.*$/i;

const cleanEvent = e => {
  const stripped = e.replace(RESULT_SUFFIX, '').trim();
  return stripped || e.trim();
};

/** The result wording is not noise — it belongs in notes, just not in the key. */
const resultOf = e => {
  const m = e.match(RESULT_SUFFIX);
  return m ? m[0].trim() : '';
};

/** "Kimi Antonelli w/Figurine" and "Charles LeClerc" are the same people as
 *  "Kimi Antonelli" and "Charles Leclerc". Casing is normalised by comparison,
 *  not by rewriting, so the CSV keeps whatever the shop actually said. */
const cleanDriver = d =>
  d
    .replace(/\s+w\/.*$/i, '')
    .replace(/\s+with\s+.*$/i, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const key = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Scale implied by the SKU, which is independent of anything the title claims.
 *
 * This is the one check a wrong title cannot defeat, and prefixes are
 * systematic: 110/117/147 are Minichamps 1:18 and 410/417/537 are 1:43; 18S is
 * Spark 1:18 and a bare S is 1:43; LS18F is Looksmart 1:18 and LSF is 1:43.
 * Returns null when the prefix says nothing, which is not a failure.
 */
function scaleFromSku(sku) {
  const s = sku.toUpperCase();
  if (/^LS18F/.test(s)) return '1:18';
  if (/^LSF/.test(s)) return '1:43';
  if (/^18S/.test(s)) return '1:18';
  if (/^S\d{3,4}$/.test(s)) return '1:43';
  if (/^(110|117|147)\d{6}$/.test(s)) return '1:18';
  if (/^(410|417|537|447)\d{6}$/.test(s)) return '1:43';
  if (/^12S/.test(s)) return '1:12';
  if (/^(64S|Y)\d+$/.test(s)) return '1:64';
  return null;
}

// ------------------------------------------------- speaking the catalogue's names

/**
 * Shops and the catalogue name the same things differently, and every mismatch
 * is a bug rather than cosmetic:
 *
 *   "HAAS" vs "Haas F1 Team"        -> sync-csv.js finds no team and drops the row
 *   "Charles LeClerc" vs "Leclerc"  -> a second driver record for one person
 *   "Japan GP" AND "Japanese GP"    -> TWO CARS for one race, from one feed
 *
 * The last is the worst, because it does not fail — it silently doubles a race.
 * So everything is mapped onto what the catalogue already says, and only names
 * with no existing counterpart are reported as genuinely new.
 */
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Country/GP wordings that mean one race. Mapped toward the longer adjectival
 *  form, which is what the catalogue uses ("Japanese GP", not "Japan GP"). */
const EVENT_ALIASES = [
  [/^japan\b/i, 'Japanese'], [/^china\b/i, 'Chinese'], [/^canada\b/i, 'Canadian'],
  [/^brazil\b/i, 'Brazilian'], [/^mexico\b/i, 'Mexican'], [/^italy\b/i, 'Italian'],
  [/^spain\b/i, 'Spanish'], [/^barcelona\b/i, 'Spanish'], [/^austria\b/i, 'Austrian'],
  [/^australia\b/i, 'Australian'], [/^hungary\b/i, 'Hungarian'], [/^belgium\b/i, 'Belgian'],
  [/^britain\b/i, 'British'], [/^netherlands\b/i, 'Dutch'], [/^bahrain\b/i, 'Bahrain'],
  [/^qatar\b/i, 'Qatar'], [/^singapore\b/i, 'Singapore'], [/^abu dhabi\b/i, 'Abu Dhabi'],
];

function canonicalEvent(raw, known) {
  let e = raw.trim();
  for (const [re, replacement] of EVENT_ALIASES) {
    if (re.test(e)) { e = e.replace(re, replacement); break; }
  }
  // Prefer a name the catalogue already uses, matched on alphanumerics so
  // "United States GP (Austin)" and "United States GP" meet.
  const hit = known.find(k => norm(k) === norm(e)) ||
              known.find(k => norm(k).startsWith(norm(e)) || norm(e).startsWith(norm(k)));
  return hit || e;
}

/** A team the catalogue already has, matched loosely enough that "Red Bull"
 *  finds "Red Bull Racing" but not so loosely that "RB" matches everything. */
function canonicalTeam(raw, known) {
  const n = norm(raw);
  return (
    known.find(k => norm(k) === n) ||
    known.find(k => norm(k).startsWith(n) && n.length >= 4) ||
    known.find(k => n.startsWith(norm(k)) && norm(k).length >= 4) ||
    raw
  );
}

/** Same person, by surname plus first initial — enough to fold "Kimi Antonelli"
 *  into "Andrea Kimi Antonelli" without merging two different Schumachers. */
function canonicalDriver(raw, known) {
  const n = norm(raw);
  const exact = known.find(k => norm(k) === n);
  if (exact) return exact;
  const surname = raw.trim().split(/\s+/).pop();
  const candidates = known.filter(k => norm(k).endsWith(norm(surname)) && !/\+/.test(k));
  if (candidates.length === 1) return candidates[0];
  const first = raw.trim()[0]?.toLowerCase();
  const byInitial = candidates.filter(k => k[0]?.toLowerCase() === first);
  return byInitial.length === 1 ? byInitial[0] : (candidates[0] || raw);
}

// ---------------------------------------------------------------- main

console.log(`\nBuilding a ${YEAR} CSV from shop feeds\n`);

const [{ data: dbTeams }, { data: dbDrivers }, { data: dbCars }] = await Promise.all([
  supabase.from('teams').select('name'),
  supabase.from('drivers').select('name'),
  supabase.from('cars').select('event_name'),
]);
const knownTeams = [...new Set((dbTeams || []).map(t => t.name?.trim()).filter(Boolean))];
const knownDrivers = [...new Set((dbDrivers || []).map(d => d.name?.trim()).filter(Boolean))];
const knownEvents = [...new Set((dbCars || []).map(c => c.event_name?.trim()).filter(Boolean))];
console.log(`catalogue vocabulary: ${knownTeams.length} teams, ${knownDrivers.length} drivers, ${knownEvents.length} events\n`);

const feeds = {};
for (const shop of SHOPS) feeds[shop.name] = await fetchFeed(shop);

if (!Object.values(feeds).some(f => f.length)) {
  console.error('\nEvery feed came back empty — almost certainly rate limiting. Wait and re-run.');
  process.exit(1);
}

// --- pass 1: learn the season's vocabulary from the structured shop
const chassisToTeam = new Map();
const drivers = new Map();
const events = new Map();

for (const shop of SHOPS.filter(s => s.structured)) {
  for (const v of feeds[shop.name]) {
    if (!v.title.includes(YEAR) || !isF1(v.title)) continue;
    const p = parseStructured(v.title);
    if (!p || p.year !== YEAR) continue;
    const { team, chassis } = splitTeamChassis(p.teamChassis);
    // Canonicalised AS IT IS LEARNED, not afterwards. Fold later and the
    // vocabulary already contains both "Japan GP" and "Japanese GP", so the
    // extractor matches whichever it meets first and the same race yields two
    // different cars depending on which shop listed it.
    if (team && chassis) {
      chassisToTeam.set(key(chassis), { team: canonicalTeam(team, knownTeams), chassis });
    }
    const d = cleanDriver(p.driver);
    if (d) {
      const canon = canonicalDriver(d, knownDrivers);
      drivers.set(key(canon), canon);
      // Index the shop's spelling too, so extraction still recognises
      // "Charles LeClerc" in a title while writing "Charles Leclerc" out.
      drivers.set(key(d), canon);
    }
    const e = cleanEvent(p.event);
    if (e) {
      const canon = canonicalEvent(e, knownEvents);
      events.set(key(canon), canon);
      events.set(key(e), canon);
    }
  }
}

console.log(`\nvocabulary learned from the structured feed:`);
console.log(`  chassis/teams : ${chassisToTeam.size}`);
for (const { team, chassis } of chassisToTeam.values()) console.log(`      ${chassis.padEnd(12)} ${team}`);
console.log(`  drivers       : ${drivers.size}  ${[...drivers.values()].join(', ')}`);
console.log(`  events        : ${events.size}  ${[...events.values()].join(', ')}`);

if (!chassisToTeam.size) {
  console.error(`\nNo ${YEAR} chassis found in the structured feed — nothing to match against.`);
  process.exit(1);
}

// --- pass 2: recognise those fields in every shop's titles
const rows = new Map(); // car key -> row

/**
 * A title as whole tokens, with internal punctuation folded out.
 *
 *   "1:18 ... #14 Aston Martin AMR26 -- Minichamps F1"
 *     -> [1, 18, 14, ASTON, MARTIN, AMR26, MINICHAMPS, F1]
 *
 * Hyphens and dots are removed BEFORE splitting so "SF-26" survives as one
 * token "SF26" rather than becoming "SF" and "26".
 */
const tokens = s =>
  s.toUpperCase().replace(/[-._/]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ');

const tokenKey = s => s.toUpperCase().replace(/[-._/]/g, '').replace(/[^A-Z0-9]/g, '');

function extract(title) {
  const scale = scaleOf(title);
  if (!scale) return null;
  const tk = tokens(title);
  const has = t => tk.includes(t);

  /**
   * Chassis, matched as a WHOLE TOKEN.
   *
   * This used substring containment, which silently mis-assigned an entire
   * team: Aston Martin's AMR26 contains Audi's R26, so every Aston Martin
   * product became an Audi one and Audi ended up with four drivers. A grid has
   * two per team, which is what made it visible — but nothing in the matcher
   * would ever have complained.
   */
  let found = null;
  for (const [, v] of chassisToTeam) {
    if (has(tokenKey(v.chassis))) { found = v; break; }
  }
  if (!found) return null;

  // Full name first, then surname — and surnames are whole tokens too, so
  // "Sainz" cannot be found inside some longer word.
  let driver = null;
  for (const [, v] of drivers) {
    if (tokens(v).every(t => has(t))) { driver = v; break; }
  }
  if (!driver) {
    for (const [, v] of drivers) {
      const surname = tokenKey(v.split(/\s+/).pop());
      if (surname.length > 3 && has(surname)) { driver = v; break; }
    }
  }
  if (!driver) return null;

  // Events are multi-word ("Miami GP", "Belgian GP (Spa)"), so every token of
  // the event name must appear, rather than the string appearing verbatim.
  let event = null;
  let bestLen = 0;
  for (const [, v] of events) {
    const et = tokens(v).filter(t => t !== 'GP');
    if (!et.length) continue;
    // Longest match wins, so "Spanish Test" is not beaten by "Spanish GP".
    if (et.every(t => has(t)) && et.join('').length > bestLen) {
      event = v;
      bestLen = et.join('').length;
    }
  }
  if (!event) return null;

  return { scale, driver, event, team: found.team, chassis: found.chassis };
}

const MANUFACTURERS = ['Minichamps', 'Looksmart', 'Spark', 'BBR', 'Bburago', 'Solido', 'Sparky', 'GP Replicas', 'Amalgam'];
const mfrOf = title => MANUFACTURERS.find(m => new RegExp(`\\b${m}\\b`, 'i').test(title)) || null;

const skipped = { scale: 0, noMatch: 0, badSkuScale: 0, noSku: 0 };

for (const shop of SHOPS) {
  for (const v of feeds[shop.name]) {
    if (!v.title.includes(YEAR) || !isF1(v.title)) continue;
    if (!v.sku) { skipped.noSku++; continue; }

    const f = extract(v.title);
    if (!f) { skipped.noMatch++; continue; }
    if (!SCALES.includes(f.scale)) { skipped.scale++; continue; }

    // The SKU's own prefix must not contradict the title's scale. This is the
    // check a mislabelled title cannot beat.
    const skuScale = scaleFromSku(v.sku);
    if (skuScale && skuScale !== f.scale) { skipped.badSkuScale++; continue; }

    const manufacturer = mfrOf(v.title);
    if (!manufacturer) { skipped.noMatch++; continue; }

    const rowKey = [f.team, f.chassis, f.driver, f.event, manufacturer].map(key).join('|');
    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        team: f.team, chassis: f.chassis, driver: f.driver, event: f.event,
        manufacturer, sku_1_18: '', sku_1_43: '',
        results: new Set(), sources: new Map(), // sku -> Set(shop)
      });
    }
    const row = rows.get(rowKey);
    const col = f.scale === '1:18' ? 'sku_1_18' : 'sku_1_43';
    if (!row[col]) row[col] = v.sku;
    const r = resultOf(v.title.replace(/.*--\s*/, ''));
    if (r) row.results.add(r);
    if (!row.sources.has(v.sku)) row.sources.set(v.sku, new Set());
    row.sources.get(v.sku).add(shop.name);
  }
}

console.log(`\nrows built: ${rows.size}`);
console.log(`  skipped — no field match: ${skipped.noMatch}  out-of-scope scale: ${skipped.scale}  ` +
            `SKU/scale disagreement: ${skipped.badSkuScale}  no SKU: ${skipped.noSku}`);

// --- missing reference rows, which sync-csv.js will NOT create
const csvEsc = s => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const out = ['team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status'];
let confirmed = 0;

for (const row of [...rows.values()].sort((a, b) =>
  a.team.localeCompare(b.team) || a.driver.localeCompare(b.driver) || a.event.localeCompare(b.event))) {
  const shopsFor = sku => [...(row.sources.get(sku) || [])];
  const all = [...new Set([...shopsFor(row.sku_1_18), ...shopsFor(row.sku_1_43)])];
  const multi = [...row.sources.values()].some(s => s.size > 1);
  if (multi) confirmed++;

  const verification = multi
    ? `CONFIRMED — the same SKU is listed by ${all.join(' and ')}, two independent shops agreeing on a structured field`
    : `SINGLE SOURCE — only ${all.join(', ')} lists this; SKU is unconfirmed and the car is inferred from one title`;

  out.push([
    row.team, row.driver, row.event, row.chassis, YEAR, row.manufacturer,
    row.sku_1_18, row.sku_1_43,
    [...row.results].join('; '),
    verification,
  ].map(csvEsc).join(','));
}

const outPath = path.resolve(process.cwd(), OUT);
writeFileSync(outPath, out.join('\n') + '\n');

console.log(`\n${rows.size} rows written to ${outPath}`);
console.log(`  cross-confirmed by 2+ shops : ${confirmed}`);
console.log(`  single source               : ${rows.size - confirmed}`);

console.log(`\nREFERENCE ROWS sync-csv.js needs and will NOT create:`);
console.log(`  season  ${YEAR}`);
console.log(`  teams   ${[...new Set([...rows.values()].map(r => r.team))].sort().join(' | ')}`);
console.log(`  drivers ${[...new Set([...rows.values()].map(r => r.driver))].sort().join(' | ')}`);
console.log(`  (check these against the seasons/teams/drivers tables before importing)`);
console.log(`\nThen: node sync-csv.js ${OUT} --dry-run\n`);
