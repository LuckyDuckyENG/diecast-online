/**
 * Where a renamed car URL used to live.
 *
 * WHY THIS EXISTS
 *
 * A car slug is built from season, team, chassis, driver and event, so
 * correcting ANY of those five changes the URL. Several corrections are known
 * to be needed and have all been deferred for the same reason: the old slugs
 * are live and indexed, and renaming without a redirect turns a working page
 * into a 404 for everyone who arrives from Google or a bookmark.
 *
 * The site already knows this is happening. not-found.tsx opens with "Some
 * older car links no longer work ... The car itself is often still on the site
 * under a different address", which is an apology standing in for a redirect.
 * This replaces the apology.
 *
 * WHY A FILE RATHER THAN A TABLE
 *
 * It is consulted ONLY when a slug fails to resolve, which is the 404 path, so
 * a database table would add a query to every genuine 404 and nothing else.
 * A module costs nothing at all, and being in git means a rename is reviewable
 * and revertible with the code change that caused it.
 *
 * HOW TO ADD ENTRIES
 *
 * Do not hand-edit. `scripts/rename-slugs.mjs` writes this file as part of
 * performing a rename, so the map cannot drift from what is in the database.
 *
 * ONE HOP ONLY. If a slug is renamed twice, the script rewrites every entry
 * already pointing at the old name so they point at the newest one. A chain
 * would mean two redirects for one visitor, and Google treats long chains as
 * a reason to stop following.
 */

/** old slug -> current slug. Generated; see scripts/rename-slugs.mjs. */
export const CAR_SLUG_REDIRECTS: Record<string, string> = {
  '1967-protos-protos-16-kurt-ahrens-german-gp': '1967-protos-16-kurt-ahrens-german-gp',
  '1979-alfa-romeo-alfa-177-bruno-giacomelli-belgian-gp': '1979-alfa-romeo-177-bruno-giacomelli-belgian-gp',
  '1979-alfa-romeo-alfa-177-bruno-giacomelli-italian-gp': '1979-alfa-romeo-177-bruno-giacomelli-italian-gp',
  '1979-alfa-romeo-alfa-177-vittorio-brambilla-italian-gp': '1979-alfa-romeo-177-vittorio-brambilla-italian-gp',
  '1979-alfa-romeo-alfa-179-bruno-giacomelli-season': '1979-alfa-romeo-179-bruno-giacomelli-season',
  '1979-lotus-lotus-79-carlos-reutemann-italian-gp': '1979-lotus-79-carlos-reutemann-italian-gp',
  '1979-lotus-lotus-79-carlos-reutemann-season': '1979-lotus-79-carlos-reutemann-season',
  '1979-lotus-lotus-79-hector-rebaque-brazilian-gp': '1979-lotus-79-hector-rebaque-brazilian-gp',
  '1979-lotus-lotus-79-hector-rebaque-season': '1979-lotus-79-hector-rebaque-season',
  '1979-lotus-lotus-79-mario-andretti-season': '1979-lotus-79-mario-andretti-season',
  '1979-lotus-lotus-79-nigel-mansell-season': '1979-lotus-79-nigel-mansell-season',
  '1979-lotus-lotus-80-carlos-reutemann-season': '1979-lotus-80-carlos-reutemann-season',
  '1979-lotus-lotus-80-mario-andretti-monaco-gp': '1979-lotus-80-mario-andretti-monaco-gp',
  '1979-lotus-lotus-80-mario-andretti-season': '1979-lotus-80-mario-andretti-season',
  '1979-lotus-lotus-80-mario-andretti-spanish-gp': '1979-lotus-80-mario-andretti-spanish-gp',
  '1980-alfa-romeo-alfa-179-bruno-giacomelli-monaco-gp': '1980-alfa-romeo-179-bruno-giacomelli-monaco-gp',
  '1980-alfa-romeo-alfa-179-bruno-giacomelli-united-states-gp': '1980-alfa-romeo-179-bruno-giacomelli-united-states-gp',
  '1980-alfa-romeo-alfa-179-patrick-depailler-monaco-gp': '1980-alfa-romeo-179-patrick-depailler-monaco-gp',
  '1980-alfa-romeo-alfa-179-vittorio-brambilla-dutch-gp': '1980-alfa-romeo-179-vittorio-brambilla-dutch-gp',
  '1980-lotus-lotus-81-elio-de-angelis-season': '1980-lotus-81-elio-de-angelis-season',
  '1980-lotus-lotus-81-mario-andretti-monaco-gp': '1980-lotus-81-mario-andretti-monaco-gp',
  '1980-lotus-lotus-81-mario-andretti-season': '1980-lotus-81-mario-andretti-season',
};

/**
 * The current slug for a URL that did not resolve, or null.
 *
 * Case-folded because a slug is lowercase by construction, and a link shared
 * through somewhere that capitalises it should still land.
 */
export function redirectForSlug(slug: string): string | null {
  if (!slug) return null;
  const hit = CAR_SLUG_REDIRECTS[slug] ?? CAR_SLUG_REDIRECTS[slug.toLowerCase()];
  // A self-reference would be an infinite redirect. It should be impossible,
  // but this file is generated and that is exactly the sort of thing a
  // generator gets wrong once.
  return hit && hit !== slug ? hit : null;
}
