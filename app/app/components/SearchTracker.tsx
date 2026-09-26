'use client';

import { useEffect, useRef } from 'react';

/**
 * Records what people searched for, and whether it found anything.
 *
 * This is the one signal that says what to build next. A search returning
 * nothing is a visitor stating, in their own words, what they wanted and the
 * catalogue did not have -- which beats guessing at the next season to import,
 * and beats SEO, whose feedback loop is months long.
 *
 * WHY THIS POSTS TO OUR OWN ENDPOINT
 *
 * It first sent a Vercel custom event, on the reasoning that analytics was
 * already running and already filtered bots, so a table might be building
 * something that existed. That was right to check and wrong in fact: custom
 * events are EXCLUDED from the Hobby plan and cost USD 20/month on Pro.
 *
 * Page views stay with Vercel, because bot filtering there is a list
 * maintained forever and the volume would otherwise land on the database. But
 * searches are one row each rather than one per page view, so a table costs
 * almost nothing -- and gives proper SQL for ranking empty queries, which is
 * better than a dashboard panel would have managed across thousands of
 * distinct strings anyway.
 *
 * The country and the bot check happen server-side in the route, because both
 * live in request headers a browser cannot be trusted to report.
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

    /**
     * keepalive so the request survives the visitor clicking a result
     * immediately, which is the normal case for a search that WORKED. Without
     * it the successful searches would be under-counted relative to the empty
     * ones, and the ratio between them is the number worth watching.
     */
    fetch('/api/log-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: q.slice(0, 80), results }),
      keepalive: true,
    }).catch(() => { /* logging must never disturb the page */ });
  }, [query, results]);

  return null;
}
