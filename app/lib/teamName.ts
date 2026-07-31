/**
 * Team name matching.
 *
 * Retailers write the full sponsored entrant name ("Oracle Red Bull Racing",
 * "Mercedes-AMG Petronas F1 Team", "Williams Racing"); the DB stores a short
 * form ("Red Bull Racing", "Mercedes-AMG Petronas", "Williams"). A plain
 * `ilike '%parsed%'` needs the STORED name to contain the PARSED one, which is
 * backwards whenever the listing is more verbose — so it silently failed and
 * the UI offered to create a duplicate car.
 *
 * Fold both sides onto a canonical token instead.
 */

// Order matters. Engine suppliers and title sponsors appear inside other
// teams' names ("Williams Mercedes", "Aston Martin Aramco Mercedes"), so the
// chassis constructor must be tested before the engine badge.
const TEAM_PATTERNS: [RegExp, string][] = [
  [/williams/, 'williams'],
  [/mclaren/, 'mclaren'],
  [/aston\s*martin/, 'astonmartin'],
  [/alpine/, 'alpine'],
  [/haas/, 'haas'],
  [/sauber|stake|kick/, 'sauber'],
  [/ferrari/, 'ferrari'],
  [/red\s*bull/, 'redbull'],
  [/visa\s*cash\s*app|alphatauri|racing\s*bulls|(^|[^a-z])rb([^a-z]|$)/, 'rb'],
  // Last — Mercedes powers several other teams
  [/mercedes/, 'mercedes'],
];

/** Reduce any spelling of a team to a single stable token, or '' if unknown. */
export function canonicalTeam(raw?: string | null): string {
  if (!raw) return '';
  const s = raw.toLowerCase().trim();
  for (const [pattern, token] of TEAM_PATTERNS) {
    if (pattern.test(s)) return token;
  }
  return '';
}

export function teamMatches(a?: string | null, b?: string | null): boolean {
  const ca = canonicalTeam(a);
  const cb = canonicalTeam(b);
  return !!ca && ca === cb;
}

/**
 * Pick the right row from the teams table for a parsed team name.
 *
 * The table carries duplicate/junk rows ("Ferrari" vs "Scuderia Ferrari",
 * "Mercedes " with a trailing space) that no car references. Rank by how many
 * cars actually use each row so the real one always wins — previously this was
 * `ilike` + `teams[0]` with no ORDER BY, which was correct only by luck.
 */
export function pickTeam<T extends { id: string; name: string }>(
  teams: T[],
  parsedName: string,
  carCountByTeamId: Map<string, number> = new Map()
): T | null {
  const target = canonicalTeam(parsedName);
  if (!target) return null;

  const candidates = teams.filter(t => canonicalTeam(t.name) === target);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const byCars = (carCountByTeamId.get(b.id) || 0) - (carCountByTeamId.get(a.id) || 0);
    if (byCars !== 0) return byCars;
    // Tie-break: prefer the tidier name
    return a.name.trim().length - b.name.trim().length;
  });

  return candidates[0];
}
