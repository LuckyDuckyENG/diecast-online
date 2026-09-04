import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Currency conversion to AUD.
 *
 * Rates come from the `fx_rates` table (migration 019), not from constants. The
 * constants below survive only as a last resort for when the table cannot be
 * read, and they are kept deliberately visible because they were WRONG: USD sat
 * at 1.5 against an actual 1.3902 from 31 July until 3 September, which made
 * every American shop look 7.9% dearer than it was and handed the "cheapest"
 * verdict to the wrong shop on 31 of 413 contested models.
 *
 * price_aud decides which retailer the site calls cheapest, so a stale rate is
 * not a rounding problem. It is a wrong answer, delivered confidently.
 */

/**
 * Last-resort rates. Used only when fx_rates has not been primed or cannot be
 * read — never in preference to a real rate.
 *
 * Left at their historical values ON PURPOSE. Replacing them with today's
 * numbers would make a fallback indistinguishable from a live rate, and the
 * whole failure being fixed here is that a plausible constant went unquestioned
 * for five weeks. A visibly dated floor is easier to catch than a fresh-looking
 * guess.
 */
export const FALLBACK_TO_AUD: Record<string, number> = {
  AUD: 1,
  USD: 1.5,
  EUR: 1.6,
  GBP: 1.9,
};

/** Kept for callers that imported the old name. */
export const CONVERSION_TO_AUD = FALLBACK_TO_AUD;

/**
 * In-process cache of the newest rate per currency.
 *
 * `toAud` stays synchronous because it is called inside tight loops in the
 * refresh and sweep routes, once per price. Making it async would turn a
 * conversion into an await in four write paths and change nothing about the
 * answer. Instead a route primes this once and every subsequent call is a map
 * lookup.
 */
let cache: Record<string, number> | null = null;
let cacheStamp: string | null = null;

/** What the last prime loaded, for a route that wants to report it. */
export function ratesInUse(): { rates: Record<string, number>; asOf: string | null; live: boolean } {
  return { rates: cache ?? FALLBACK_TO_AUD, asOf: cacheStamp, live: cache !== null };
}

/**
 * Load rates from fx_rates into the cache. Call once at the top of any route
 * that converts prices.
 *
 * Never throws. A refresh that cannot reach the rates table should still refresh
 * prices — falling back to a five-week-old constant is worse than a live rate
 * and far better than a 500 on the job that keeps the site's prices current.
 */
export async function primeRates(supabase: SupabaseClient): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('fx_rates')
      .select('base, quote, rate, as_of')
      .eq('quote', 'AUD')
      .order('as_of', { ascending: false });

    if (error || !data?.length) {
      console.warn(`⚠️ fx_rates unavailable (${error?.message ?? 'no rows'}) — using fallback rates`);
      return;
    }

    // Newest row per base wins; the query is already sorted, so the first
    // occurrence of each currency is the most recent one.
    const next: Record<string, number> = { AUD: 1 };
    let newest: string | null = null;
    for (const r of data) {
      if (next[r.base] === undefined) next[r.base] = Number(r.rate);
      if (!newest || r.as_of > newest) newest = r.as_of;
    }
    cache = next;
    cacheStamp = newest;
  } catch (err: any) {
    console.warn(`⚠️ could not load fx_rates: ${err.message} — using fallback rates`);
  }
}

/**
 * Convert to AUD. Unknown currencies fall back to 1:1 rather than null —
 * previously refresh-prices wrote NULL for anything non-AUD, which silently
 * dropped those links out of the price comparison entirely.
 */
export function toAud(price: number, currency?: string | null): number {
  const code = (currency || 'AUD').toUpperCase();
  const table = cache ?? FALLBACK_TO_AUD;
  return price * (table[code] ?? 1);
}

/**
 * Convert between any two currencies via the AUD rates held.
 *
 * Present because showing a price in the reader's own currency is the obvious
 * next step and the shops are already international — 21 American, 7 British,
 * 6 European against 13 Australian. Nothing calls this yet.
 *
 * Note what it is NOT for: converting a price back into the currency it was
 * quoted in. LIVECARMODEL charges USD 109.95; putting that through USD -> AUD ->
 * USD lands somewhere that is not 109.95. The raw `price` and `currency` are
 * stored on every row precisely so the native figure can be shown as-is.
 */
export function convert(price: number, from: string, to: string): number {
  const table = cache ?? FALLBACK_TO_AUD;
  const f = table[(from || 'AUD').toUpperCase()] ?? 1;
  const t = table[(to || 'AUD').toUpperCase()] ?? 1;
  return (price * f) / t;
}
