/**
 * One car, one name — used by the <title>, the og:title, the JSON-LD product
 * name and the search results.
 *
 * IT LIVES IN ITS OWN MODULE BECAUSE A SECOND COPY ALREADY DREW BLOOD.
 * The format was written out by hand in carPageData AND in searchData, so
 * improving the page title on 2026-10-12 left search results rendering the old
 * one — the same car reading two different ways depending on how you reached
 * it. A pure function with no dependencies has no reason to sit inside the
 * data layer, where importing it drags the whole car page's module graph into
 * /search.
 *
 * THE OLD FORMAT NEVER NAMED THE TEAM. It read
 * "Bahrain GP - W15 - Lewis Hamilton - 2024", which omitted the one word a
 * buyer is most likely to type. Measured across the catalogue before changing:
 *
 *   2,390 of 2,472 titles (97%) did not contain the marque
 *     430 had a BARE NUMBER as the chassis -- "- 158 -", "- 49 -"
 *     560 opened with the word "Season"
 *
 * Nobody searches "British GP - 158". They search "Alfa Romeo 158 Farina".
 * Year, marque, chassis and driver now lead, because that is the order the
 * words appear in a query, and the round is kept but demoted.
 */

/**
 * The marque as a searcher types it, for the four team names long enough to
 * push a title past Google's display width on their own.
 *
 * This is a search decision, not an abbreviation: "Ferrari" and "Mercedes"
 * ARE the queries, and the full entrant name is still on the page and in the
 * description. "Mercedes-AMG Petronas" alone costs 21 of the ~60 characters a
 * result shows.
 *
 * Deliberately short. Every other team name in the catalogue already fits.
 */
const TITLE_MARQUE: Record<string, string> = {
  'Scuderia Ferrari': 'Ferrari',
  'Mercedes-AMG Petronas': 'Mercedes',
  'Red Bull Racing': 'Red Bull',
  'Haas F1 Team': 'Haas',
};

/**
 * The same shortening, for anywhere a team name has to fit in a small space —
 * the driver cards on the home page list up to three teams on one line, and
 * "Mercedes-AMG Petronas" alone would fill it.
 *
 * Exported rather than duplicated, because this file exists precisely because
 * the title format had been hand-copied into six places.
 */
export function shortTeamName(name: string | null | undefined): string {
  const raw = String(name || '');
  return TITLE_MARQUE[raw] || raw;
}

/** "2024 Mercedes W15 Lewis Hamilton - Bahrain GP" */
export function carTitle(car: any): string {
  const year = car?.season?.year;
  const raw = String(car?.team?.name || '');
  const team = TITLE_MARQUE[raw] || raw;
  const chassis = String(car?.chassis_name || '');
  const driver = String(car?.driver?.name || '');
  const event = car?.event_name;

  /**
   * SOME chassis_name VALUES ALREADY CARRY THE MARQUE -- "Lotus 79",
   * "Lotus 80", "Lotus 81", "Protos 16" -- so prefixing the team would read
   * "Lotus Lotus 79". The same 14 cars produce the doubled slugs recorded in
   * STATUS-SUMMARY. Detected rather than assumed away, so the title is right
   * whether or not that data is ever cleaned up.
   */
  const firstWord = team.split(/\s+/)[0]?.toLowerCase();
  const marque =
    firstWord && chassis.toLowerCase().startsWith(firstWord) ? '' : team;

  const name = [year, marque, chassis, driver].filter(Boolean).join(' ');

  /**
   * "SEASON" IS NOT A RACE. It is the placeholder for a model the shop sold
   * without naming a round, so printing it as though it were an event made 560
   * titles open on a meaningless word.
   */
  return event && event !== 'Season' ? `${name} - ${event}` : name;
}
