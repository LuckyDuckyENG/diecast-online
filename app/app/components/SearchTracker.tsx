'use client';

import { useEffect, useRef } from 'react';
import { track } from '@vercel/analytics';

/**
 * Records what people searched for, and whether it found anything.
 *
 * This is the one signal that says what to build next. A search returning
 * nothing is a visitor stating, in their own words, what they wanted and the
 * catalogue did not have -- which beats guessing at the next season to import,
 * and beats SEO, whose feedback loop is months long.
 *
 * WHY CUSTOM EVENTS RATHER THAN A TABLE
 *
 * The obvious build is a search_queries table. But analytics is already
 * running, already filters bots by user agent, and already costs the database
 * nothing. Writing a table before checking whether the dashboard answers the
 * question would be building something that might already exist.
 *
 * The open question is whether it can rank a HIGH-CARDINALITY property.
 * Analytics tools are built for properties with tens of values -- country,
 * browser -- and thousands of distinct search strings is their worst case. The
 * docs mention exporting "up to 250 entries", which hints at the ceiling.
 *
 * So empty searches get their OWN EVENT NAME as well as a property. The docs
 * confirm the dashboard can filter by event name; whether it can rank by
 * property value is exactly what they do not say. If in a week the property
 * breakdown turns out to be unusable, the fallback is a table -- built then,
 * knowing the real search volume rather than guessing it.
 *
 * Fires once per query, not per render.
 */
export default function SearchTracker({
  query,
  results,
}: {
  query: string;
  results: number;
}) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    // Matches the floor in searchCars: shorter than this never ran a search,
    // so recording it would count keystrokes rather than intent.
    if (q.length < 2) return;
    // Guard against re-renders and against React running effects twice in
    // development, either of which would double every count.
    const key = `${q}|${results}`;
    if (sent.current === key) return;
    sent.current = key;

    // Capped so one pasted paragraph cannot become an unbounded property
    // value. Nothing anyone genuinely searches for is this long.
    const term = q.slice(0, 80);

    track('Search', { q: term, results });
    if (results === 0) track('Search: no results', { q: term });
  }, [query, results]);

  return null;
}
