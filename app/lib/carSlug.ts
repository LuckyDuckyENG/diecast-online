import { canonicalTeam } from './teamName';

/**
 * Human-readable URLs for cars.
 *
 * A car is identified by season + team + chassis + driver + event, so a slug
 * built from those five fields is unique by construction — and happens to
 * contain exactly the words people search for:
 *
 *   /cars/2024-mercedes-w15-lewis-hamilton-bahrain-gp
 *
 * The stored `slug` column is the authority (unique index). This function is
 * for generating it, not for looking cars up — resolve by the column so a
 * later change to this logic can't orphan existing URLs.
 */

/** Short, searchable team names: "Mercedes-AMG Petronas" -> "mercedes". */
const TEAM_SLUGS: Record<string, string> = {
  redbull: 'red-bull',
  ferrari: 'ferrari',
  mercedes: 'mercedes',
  mclaren: 'mclaren',
  astonmartin: 'aston-martin',
  alpine: 'alpine',
  williams: 'williams',
  haas: 'haas',
  sauber: 'sauber',
  rb: 'rb',
  alfaromeo: 'alfa-romeo',
  alphatauri: 'alphatauri',
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // fold accents rather than dropping the letter
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CarSlugParts {
  year?: number | string | null;
  team?: string | null;
  chassis?: string | null;
  driver?: string | null;
  event?: string | null;
}

export function buildCarSlug(parts: CarSlugParts): string {
  const teamKey = canonicalTeam(parts.team);
  const team = TEAM_SLUGS[teamKey] || parts.team || '';

  return slugify(
    [parts.year, team, parts.chassis, parts.driver, parts.event]
      .filter(Boolean)
      .join(' ')
  );
}

/** True when a path segment looks like a UUID rather than a slug. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
