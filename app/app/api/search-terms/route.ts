import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { selectAll } from '@/lib/selectAll';

/**
 * Every term worth suggesting, as one small static file.
 *
 * WHY NOT QUERY PER KEYSTROKE
 *
 * Typeahead is the most query-hungry feature a site can have: someone typing
 * "verstappen" fires ten searches where pressing enter fires one. This project
 * has already exceeded its database egress quota once, on 2026-09-22, and the
 * cause was exactly this shape of thing -- many small reads that each looked
 * harmless.
 *
 * The whole vocabulary is 276 terms and 2.7 KB, under a kilobyte gzipped. So
 * it ships once, the browser caches it, and filtering happens in the client at
 * zero marginal cost. A visitor can type as fast as they like.
 *
 * What this DOES NOT do is suggest individual models. That would need a query
 * per keystroke because 3,101 models will not fit in a suggestion payload. It
 * answers "what can I search for", which for a catalogue nobody knows the
 * contents of is the more useful question anyway.
 */
export const dynamic = 'force-static';
export const revalidate = 86400;

export interface SearchTerm {
  /** What the user sees and what gets searched. */
  t: string;
  /** driver | team | season | chassis — drives the label in the dropdown. */
  k: 'driver' | 'team' | 'season' | 'chassis';
  /** How many cars it matches, for ordering. */
  n: number;
}

export async function GET() {
  const [drivers, teams, seasons, cars] = await Promise.all([
    selectAll<any>(supabase, 'drivers', 'id, name'),
    selectAll<any>(supabase, 'teams', 'id, name'),
    selectAll<any>(supabase, 'seasons', 'id, year'),
    selectAll<any>(supabase, 'cars', 'driver_id, team_id, season_id, chassis_name'),
  ]);

  const tally = <T,>(key: (c: any) => T) => {
    const m = new Map<T, number>();
    for (const c of cars) {
      const k = key(c);
      if (k == null) continue;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const byDriver = tally(c => c.driver_id);
  const byTeam = tally(c => c.team_id);
  const bySeason = tally(c => c.season_id);
  const byChassis = tally(c => c.chassis_name);

  const terms: SearchTerm[] = [
    /**
     * Pair names are skipped. "Norris + Piastri" is a two-car set that was
     * imported as if it were a person; suggesting it would offer a driver who
     * does not exist.
     */
    ...drivers
      .filter(d => byDriver.get(d.id) && !/\+/.test(d.name))
      .map(d => ({ t: d.name, k: 'driver' as const, n: byDriver.get(d.id)! })),
    ...teams
      .filter(t => byTeam.get(t.id))
      .map(t => ({ t: t.name, k: 'team' as const, n: byTeam.get(t.id)! })),
    ...seasons
      .filter(s => bySeason.get(s.id))
      .map(s => ({ t: String(s.year), k: 'season' as const, n: bySeason.get(s.id)! })),
    ...[...byChassis.entries()]
      .filter(([c]) => c)
      .map(([c, n]) => ({ t: String(c), k: 'chassis' as const, n })),
  ];

  // Most cars first, so "Ferrari" outranks a chassis only one car uses.
  terms.sort((a, b) => b.n - a.n || a.t.localeCompare(b.t));

  return NextResponse.json({ terms });
}
