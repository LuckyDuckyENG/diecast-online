/**
 * Event name matching for retailer-sourced product titles.
 *
 * Retailer listings decorate the event with a result ("Spanish GP Winner",
 * "Bahrain GP 3rd Place") while the DB stores the bare event ("Spanish GP").
 * The CSV skeleton also carries parentheticals ("Italian GP (Monza)") that
 * retailers usually omit. Normalize both sides before comparing.
 */
/**
 * Retailers name races by country ("Brazil GP"), the calendar uses the
 * adjective ("Brazilian GP"). Fold both onto one token so they compare equal.
 * Order matters — longer phrases first ("saudi arabian" before "arabian").
 */
const COUNTRY_FORMS: [RegExp, string][] = [
  [/\bsaudi\s+arabian\b/g, 'saudiarabia'],
  [/\bsaudi\s+arabia\b/g, 'saudiarabia'],
  [/\bunited\s+states\b/g, 'usa'],
  [/\bus\b/g, 'usa'],
  [/\bmexico\s+city\b/g, 'mexico'],
  [/\bemilia\s+romagna\b/g, 'emiliaromagna'],
  [/\babu\s+dhabi\b/g, 'abudhabi'],
  [/\blas\s+vegas\b/g, 'lasvegas'],
  [/\bbrazilian\b/g, 'brazil'],
  [/\bitalian\b/g, 'italy'],
  [/\bspanish\b/g, 'spain'],
  [/\bmexican\b/g, 'mexico'],
  [/\baustrian\b/g, 'austria'],
  [/\baustralian\b/g, 'australia'],
  [/\bhungarian\b/g, 'hungary'],
  [/\bjapanese\b/g, 'japan'],
  [/\bchinese\b/g, 'china'],
  [/\bbritish\b/g, 'britain'],
  [/\bbelgian\b/g, 'belgium'],
  [/\bdutch\b/g, 'netherlands'],
  [/\bcanadian\b/g, 'canada'],
  [/\bbahraini\b/g, 'bahrain'],
  [/\bqatari\b/g, 'qatar'],
  [/\bazerbaijani\b/g, 'azerbaijan'],
  [/\bsingaporean\b/g, 'singapore'],
  [/\bamerican\b/g, 'usa'],
];

export function normalizeEventName(raw?: string | null): string {
  if (!raw) return '';

  let s = raw
    .toLowerCase()
    // "Italian GP (Monza)" -> "italian gp"
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bgrand\s+prix\b/g, 'gp');

  for (const [pattern, canonical] of COUNTRY_FORMS) {
    s = s.replace(pattern, canonical);
  }

  return s
    // Result qualifiers retailers append to the event name
    .replace(/\b(race\s+)?winner\b/g, ' ')
    .replace(/\bwinning\b/g, ' ')
    .replace(/\bworld\s+champion(ship)?\b/g, ' ')
    .replace(/\bchampion\b/g, ' ')
    .replace(/\bpole(\s+position)?\b/g, ' ')
    .replace(/\bpodium\b/g, ' ')
    .replace(/\b\d+(st|nd|rd|th)\b(\s+place)?/g, ' ')
    .replace(/\bp[123]\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * All the forms an event might be written as.
 *
 * The DB encodes circuit aliases in parentheses — "United States GP (Austin)",
 * "Italian GP (Monza)", "Emilia Romagna GP (Imola)" — and retailers often use
 * the circuit instead of the country. Treat the parenthetical as an alias
 * rather than discarding it.
 */
export function eventKeys(raw?: string | null): string[] {
  if (!raw) return [];
  const keys = new Set<string>();

  const main = normalizeEventName(raw);
  if (main) keys.add(main);

  for (const m of raw.matchAll(/\(([^)]*)\)/g)) {
    const alias = normalizeEventName(m[1]);
    if (alias) keys.add(alias);
  }

  return [...keys];
}

/**
 * Word-level containment. Compares whole words so short aliases can't produce
 * false positives — "spa" must not match "spanish", which a plain substring
 * check would happily do.
 */
function keyMatch(x: string, y: string): boolean {
  if (x === y) return true;
  const wx = x.split(' ').filter(Boolean);
  const wy = y.split(' ').filter(Boolean);
  if (!wx.length || !wy.length) return false;
  const [short, long] = wx.length <= wy.length ? [wx, wy] : [wy, wx];
  return short.every(w => long.includes(w));
}

/**
 * True when two event names refer to the same event. Deliberately
 * bidirectional — either side may carry the extra qualifier.
 */
export function eventMatches(a?: string | null, b?: string | null): boolean {
  const ka = eventKeys(a);
  const kb = eventKeys(b);
  for (const x of ka) {
    for (const y of kb) {
      if (keyMatch(x, y)) return true;
    }
  }
  return false;
}

/**
 * Chassis comparison, ignoring punctuation/casing ("SF-24" === "SF24").
 */
export function chassisMatches(a?: string | null, b?: string | null): boolean {
  const na = (a || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nb = (b || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
