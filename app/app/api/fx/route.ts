import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * AUD -> everything, for showing a price in the visitor's own currency.
 *
 * WHY THIS ROUTE EXISTS RATHER THAN A CONSTANT
 *
 * Rates move. USD drifted 2.86% in the twenty days between two manual runs of
 * scripts/fetch-fx.mjs, and before that a hardcoded 1.5 sat against a real
 * 1.3902 for five weeks. Anything that depends on someone remembering to run a
 * command will be stale, so this refreshes itself.
 *
 * HOW IT STAYS FRESH WITHOUT A CRON OR A KEY
 *
 * `force-static` with a six-hour revalidate means the response is cached and
 * regenerated at most four times a day. On regeneration, if the newest stored
 * rate is more than a day old, it pulls from Frankfurter -- the ECB's daily
 * reference rates, republished without an API key, chosen because this repo has
 * already leaked one secret to a public GitHub and a currency display is not
 * worth risking another.
 *
 * So the external call happens roughly once a day, never on a visitor's
 * critical path, and the database is the primary source at request time. A
 * Frankfurter outage costs nothing: the stored rates keep serving.
 *
 * THREE LEVELS OF FALLBACK, deliberately
 *
 *   live ECB      -> today's rate
 *   fx_rates      -> the last rate we successfully stored
 *   nothing       -> no conversion offered at all, and the site shows AUD
 *
 * The last one matters. There is no constant fallback here on purpose: a wrong
 * rate presented as a real one is how this went wrong the first time, and
 * showing AUD to an American is merely inconvenient, where showing them a
 * confidently converted number computed from a guess is a lie.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-static';
export const revalidate = 21600; // six hours

/** Everything the site is willing to display a price in. */
const DISPLAY = ['USD', 'EUR', 'GBP', 'CAD', 'NZD', 'SGD', 'JPY'] as const;

const SOURCE = 'ecb-frankfurter';
const STALE_HOURS = 24;

type Rates = Record<string, number>;

/** Newest stored AUD -> X rate per currency. */
async function fromDatabase(): Promise<{ rates: Rates; asOf: string | null }> {
  const { data, error } = await supabase
    .from('fx_rates')
    .select('quote, rate, as_of')
    .eq('base', 'AUD')
    .order('as_of', { ascending: false });

  if (error || !data?.length) return { rates: {}, asOf: null };

  const rates: Rates = {};
  let asOf: string | null = null;
  for (const r of data) {
    if (rates[r.quote] != null) continue; // ordered newest first
    const v = Number(r.rate);
    if (!(v > 0)) continue;
    rates[r.quote] = v;
    if (!asOf || r.as_of > asOf) asOf = r.as_of;
  }
  return { rates, asOf };
}

/** One request to Frankfurter for every display currency at once. */
async function fromEcb(): Promise<{ rates: Rates; asOf: string } | null> {
  try {
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=AUD&to=${DISPLAY.join(',')}`,
      // Not Next-cached: this route's own revalidate already bounds how often
      // it runs, and a second cache layer here would make the age of a rate
      // impossible to reason about.
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const rates: Rates = {};
    for (const q of DISPLAY) {
      const v = Number(json?.rates?.[q]);
      if (v > 0) rates[q] = v;
    }
    if (!Object.keys(rates).length || !json?.date) return null;
    return { rates, asOf: json.date as string };
  } catch {
    return null;
  }
}

export async function GET() {
  const stored = await fromDatabase();

  const ageHours = stored.asOf
    ? (Date.now() - new Date(stored.asOf).getTime()) / 3_600_000
    : Infinity;

  let rates = stored.rates;
  let asOf = stored.asOf;
  let source: 'database' | 'ecb' | 'none' = stored.asOf ? 'database' : 'none';

  if (ageHours > STALE_HOURS) {
    const live = await fromEcb();
    if (live) {
      rates = live.rates;
      asOf = live.asOf;
      source = 'ecb';
      // Persist so the ranking path and the next request benefit too, and so a
      // later Frankfurter outage has something current to fall back to.
      const rows = Object.entries(live.rates).map(([quote, rate]) => ({
        as_of: live.asOf,
        base: 'AUD',
        quote,
        rate,
        source: SOURCE,
      }));
      const { error } = await supabase
        .from('fx_rates')
        .upsert(rows, { onConflict: 'as_of,base,quote' });
      if (error) console.warn(`fx: refreshed but not stored (${error.message})`);
    }
  }

  return NextResponse.json({
    base: 'AUD',
    asOf,
    source,
    // Absent rather than zero when unknown. A client that cannot find its
    // currency here must show AUD, not multiply by nothing.
    rates,
  });
}
