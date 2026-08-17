import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Read every row of a table, not the first thousand.
 *
 * PostgREST caps a plain `.select()` at 1000 rows. It does not error, does not
 * set a flag, and returns a perfectly ordinary array — so the truncation is
 * invisible at the call site and stays invisible until someone counts.
 *
 * price_history crossed 1000 rows on 2026-08-17 (the first LIVECARMODEL sweep
 * took it to 1,151), which silently broke three separate things at once:
 *
 *   - sitemap.ts decided which car pages were worth indexing from a `sellable`
 *     set built on that select, so cars with a retailer link were being dropped
 *     from the sitemap for appearing to have none
 *   - the batch eBay search anchored its price-outlier guard on it, so the
 *     guard was reasoning from partial data exactly where we had made it
 *     deliberately independent of the current run
 *   - the admin panel read it to show what was already linked
 *
 * Every one of those failures is quiet and in the unsafe direction. Use this
 * for any read that is not scoped by `.eq()` to a handful of rows.
 */
export async function selectAll<T = any>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  tweak?: (q: any) => any
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];

  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns);
    if (tweak) q = tweak(q);
    const { data, error } = await q.range(from, from + PAGE - 1);

    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));

    // A short page is the last page. Anything else risks looping forever on a
    // table that is being written to while we read it.
    if (!data || data.length < PAGE) return out;
  }
}
