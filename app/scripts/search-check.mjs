/**
 * Does search answer what people actually type?
 *
 *   node scripts/search-check.mjs                      # against localhost:3000
 *   node scripts/search-check.mjs https://diecasts.app
 *
 * Read-only. Drives the real /search route rather than importing the library,
 * so it tests what a visitor gets, including the rendering.
 *
 * WHY THESE CASES
 *
 * Every one is either a query taken from `search_queries` that returned zero,
 * or a behaviour that broke while fixing one of those. Search has now been
 * repaired four separate times -- the silent 1000-row cap, the unsearchable
 * manufacturer and scale, the 20,608-character URL that died as "fetch
 * failed", and multi-term AND -- and each fix had a fair chance of undoing an
 * earlier one. Three cases exist purely to catch that:
 *
 *   A TWO-WORD CIRCUIT MUST STAY WHOLE. "watkins glen" split into AND'ed
 *   words matches nothing, because neither word appears anywhere in the data.
 *   Fourteen of the aliases are two words and all of them would have gone
 *   quiet.
 *
 *   A SINGLE WORD MUST STILL BE A UNION. "ferrari" has to mean the team OR
 *   the chassis OR the event, not all of them at once.
 *
 *   AND MUST ACTUALLY EXCLUDE. "leclerc zzzznotathing" has to return nothing.
 *   A broken intersection that quietly falls back to OR would pass every
 *   other case in this file.
 */

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

/**
 * `min` is a floor, not an expectation of exactness: the catalogue grows, so
 * asserting a count would turn every import into a test failure. Zero versus
 * non-zero is the thing that has actually broken, four times.
 */
const CASES = [
  // The failure that prompted the multi-term work, straight from the logs.
  { q: 'looksmart leclerc', min: 1, why: 'maker AND driver, the logged zero' },
  { q: 'looksmart', min: 1, why: 'the maker alone' },
  { q: 'leclerc', min: 1, why: 'the driver alone' },

  // The earlier logged zero: maker + category noise + scale.
  { q: 'spark f1 1/43', min: 1, why: 'maker, noise word, slash scale' },
  { q: 'spark', min: 1, why: 'the 557-car maker that died as "fetch failed"' },
  { q: 'minichamps', min: 1, why: 'the maker that worked while spark did not' },

  // Union behaviour for one word must survive the intersection rewrite.
  { q: 'ferrari', min: 1, why: 'one word stays a union' },
  { q: 'red bull', min: 1, why: 'a two-word TEAM name' },

  // Year and scale narrow rather than widen.
  { q: 'hamilton 2020', min: 1, why: 'driver AND season' },
  { q: 'verstappen 1:18', min: 1, why: 'driver AND scale' },

  // Circuits, including the two-word aliases that splitting would kill.
  { q: 'monza', min: 1, why: 'one-word circuit alias' },
  { q: 'watkins glen', min: 1, why: 'TWO-WORD circuit alias, must stay whole' },
  { q: 'brands hatch', min: 1, why: 'two-word circuit alias' },
  { q: 'silverstone', min: 1, why: 'circuit stored as British GP' },

  // Three words, which is where a naive AND starts returning nothing.
  { q: 'looksmart hamilton ferrari', min: 1, why: 'maker AND driver AND team' },

  // The intersection has to be real.
  { q: 'zzzznotathing', max: 0, why: 'nonsense returns nothing' },
  { q: 'leclerc zzzznotathing', max: 0, why: 'AND excludes, rather than falling back to OR' },
];

const count = (html) => (html.match(/href="\/cars\//g) || []).length;

let failed = 0;
console.log(`\nsearch against ${BASE}\n`);
console.log(`  ${'query'.padEnd(28)} ${'cars'.padStart(5)}   why`);

for (const c of CASES) {
  const url = `${BASE}/search?q=${encodeURIComponent(c.q)}`;
  let n = -1;
  let note = '';
  try {
    const res = await fetch(url);
    if (!res.ok) { note = `HTTP ${res.status}`; }
    else {
      const html = await res.text();
      n = count(html);
      // "No results found" and zero links should always agree. If they ever
      // disagree the page is lying in one direction or the other.
      const saysNone = html.includes('No results found');
      if (saysNone !== (n === 0)) note = `INCONSISTENT: copy says ${saysNone ? 'none' : 'some'}, ${n} links`;
    }
  } catch (e) {
    note = `fetch failed: ${String(e.message || e).slice(0, 40)}`;
  }

  const bad =
    note.startsWith('HTTP') || note.startsWith('fetch') || note.startsWith('INCONSISTENT') ||
    (c.min !== undefined && n < c.min) ||
    (c.max !== undefined && n > c.max);
  if (bad) failed++;

  console.log(`  ${(bad ? 'FAIL ' : '     ') + c.q.padEnd(23)} ${String(n).padStart(5)}   ${c.why}${note ? '  <- ' + note : ''}`);
}

console.log(`\n  ${CASES.length - failed}/${CASES.length} passed\n`);
process.exit(failed ? 1 : 0);
