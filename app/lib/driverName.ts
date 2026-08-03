/**
 * Driver name matching.
 *
 * Comparing whole names after stripping punctuation is too brittle:
 *   - Two-driver models: "Lando Norris + Oscar Piastri" vs stored "Norris + Piastri"
 *   - Accents: "Sergio Pérez" vs "Sergio Perez", "Nico Hülkenberg" vs "Hulkenberg"
 *     (a naive [^a-z0-9] strip DELETES the accented letter rather than folding it,
 *     turning "pérez" into "prez")
 *   - Initials: "M. Verstappen" vs "Max Verstappen"
 *   - Surname only: "Verstappen" vs "Max Verstappen"
 *
 * Compare the set of surnames instead — that's the part everyone agrees on.
 */

/** "Pérez" -> "perez", "Hülkenberg" -> "hulkenberg" */
function foldAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * The surnames named in a driver string. Handles multi-driver entries
 * separated by "+", "/", "&", "," or " and ".
 */
export function driverSurnames(raw?: string | null): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;

  const cleaned = foldAccents(raw.toLowerCase())
    .replace(/[^a-z0-9\s+/&,]/g, ' ')
    .replace(/\s+and\s+/g, '+');

  for (const part of cleaned.split(/[+/&,]/)) {
    // Drop initials and stray single letters — the surname is the last real token
    const tokens = part.trim().split(/\s+/).filter(t => t.length > 1);
    if (tokens.length) out.add(tokens[tokens.length - 1]);
  }

  return out;
}

/**
 * True when two driver strings name the same person (or the same pairing).
 *
 * Lenient by design: one side naming a subset of the other still matches, so
 * "Norris" lines up with "Norris + Piastri". The SKU has already identified the
 * product by the time this runs — this is a sanity check, not the primary key.
 * Genuinely different drivers still fail: {verstappen} vs {perez} shares nothing.
 */
export function driverMatches(a?: string | null, b?: string | null): boolean {
  const A = driverSurnames(a);
  const B = driverSurnames(b);
  if (!A.size || !B.size) return false;

  let shared = 0;
  for (const name of A) if (B.has(name)) shared++;

  return shared === Math.min(A.size, B.size);
}

/** Whole name, folded for comparison: trimmed, accent-free, single-spaced. */
export function normalizeDriverName(raw?: string | null): string {
  if (!raw) return '';
  return foldAccents(raw.toLowerCase()).replace(/\s+/g, ' ').trim();
}

interface DriverRow {
  id: string;
  name: string;
}

/**
 * Find an existing driver, tolerating the spellings that actually occur.
 *
 * A plain `.ilike('name', x)` misses on a trailing space or an accent, and the
 * caller then "helpfully" creates a second driver. That is exactly how
 * "Esteban Ocon " and "Sergio Pérez" ended up as separate rows, splitting one
 * driver's cars across two identities.
 *
 * Exact (folded) name first, surname set second — so "Verstappen" and
 * "M. Verstappen" both find Max, without "Norris" matching "Norris + Piastri"
 * ahead of a real full-name match.
 */
export function findDriverIn(drivers: DriverRow[], name?: string | null): DriverRow | null {
  if (!name) return null;

  const target = normalizeDriverName(name);
  const exact = drivers.find(d => normalizeDriverName(d.name) === target);
  if (exact) return exact;

  const bySurname = drivers.filter(d => driverMatches(d.name, name));
  return bySurname.length === 1 ? bySurname[0] : null;
}

/**
 * Resolve a driver name to a row, creating one only when it genuinely isn't
 * there. Always stores the trimmed name — an untrimmed insert is what created
 * the "Esteban Ocon " duplicate in the first place.
 */
export async function resolveDriver(
  supabase: any,
  name: string
): Promise<{ id: string; name: string; created: boolean } | null> {
  const clean = (name || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const { data: drivers, error } = await supabase.from('drivers').select('id, name');
  if (error) throw new Error(`Driver lookup failed: ${error.message}`);

  const found = findDriverIn(drivers || [], clean);
  if (found) return { ...found, created: false };

  const { data: created, error: createError } = await supabase
    .from('drivers')
    .insert({ name: clean })
    .select('id, name')
    .single();

  if (createError) throw new Error(`Failed to create driver: ${createError.message}`);
  return { ...created, created: true };
}
