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
