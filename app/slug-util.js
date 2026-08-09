/**
 * Car slug rules, in plain JS.
 *
 * Mirrors lib/carSlug.ts + lib/teamName.ts, which the app imports. Kept as
 * CommonJS so the node scripts run without a TypeScript step.
 *
 * This file exists so there is ONE copy for the scripts rather than one per
 * script. sync-csv.js did not set slugs at all, so an import left every new car
 * with a NULL slug falling back to a UUID URL — the exact thing migration 011
 * and the SEO work removed. Duplicating the rules into sync-csv would have set
 * up a slow divergence between the importer and the backfill instead.
 */

const TEAM_PATTERNS = [
  [/williams/, 'williams'],
  [/mclaren/, 'mclaren'],
  [/aston\s*martin/, 'aston-martin'],
  [/alpine/, 'alpine'],
  [/haas/, 'haas'],
  [/sauber|stake|kick/, 'sauber'],
  [/alfa\s*romeo/, 'alfa-romeo'],
  [/ferrari/, 'ferrari'],
  [/red\s*bull/, 'red-bull'],
  [/alphatauri/, 'alphatauri'],
  [/visa\s*cash\s*app|racing\s*bulls|(^|[^a-z])rb([^a-z]|$)/, 'rb'],
  [/mercedes/, 'mercedes'], // last: powers several other teams
];

const teamSlug = name => {
  const s = (name || '').toLowerCase();
  for (const [re, slug] of TEAM_PATTERNS) if (re.test(s)) return slug;
  return name || '';
};

const slugify = t =>
  (t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // fold accents rather than dropping the letter
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** From a joined car row (season/team/driver nested). */
const buildSlug = c =>
  slugify(
    [c.season?.year, teamSlug(c.team?.name), c.chassis_name, c.driver?.name, c.event_name]
      .filter(Boolean)
      .join(' ')
  );

/** From loose parts, for callers creating a car and holding the values already. */
const buildSlugFromParts = ({ year, team, chassis, driver, event }) =>
  slugify([year, teamSlug(team), chassis, driver, event].filter(Boolean).join(' '));

module.exports = { TEAM_PATTERNS, teamSlug, slugify, buildSlug, buildSlugFromParts };
