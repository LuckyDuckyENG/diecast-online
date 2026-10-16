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
/**
 * How many ids go into one `.in()`.
 *
 * PostgREST takes `.in()` as a query string, so the id list becomes URL. A
 * uuid costs about 39 characters once quoted and comma-separated, and the
 * request dies somewhere past ~16 KB with a bare "fetch failed" -- no status
 * code, no PostgREST error object, nothing to catch by name. 150 is ~5.9 KB,
 * which leaves room for the rest of the URL and is still few enough requests
 * to be irrelevant.
 */
const IN_CHUNK = 150;

/**
 * `selectAll`, but filtered by a list of ids that may be longer than a URL.
 *
 * THIS IS A LIVE 500, NOT A THEORETICAL LIMIT. Searching "spark" or
 * "minichamps" on diecasts.app returned HTTP 500 for weeks: both match 200
 * cars, those cars carry enough model variants that `in('model_id', ...)`
 * crossed the limit, and the "fetch failed" that came back was thrown
 * straight out of a server component. "ferrari" also returns 200 cars, has
 * fewer variants each, and worked fine -- which is why it looked like a
 * mysterious per-query fault rather than a size limit.
 *
 * The same fault has now been found three times in this codebase: the maker
 * lookup (557 uuids, 20,608 characters), the SKU lookup latently, and here.
 * Any `.in()` over a list the caller did not personally count belongs in this
 * function.
 */
export async function selectAllIn<T = any>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: readonly (string | number)[],
  tweak?: (q: any) => any
): Promise<T[]> {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];

  const chunks: (string | number)[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    chunks.push(unique.slice(i, i + IN_CHUNK));
  }

  /**
   * CHUNKS RUN IN PARALLEL, in waves. They are independent reads of disjoint
   * id ranges, so running them one after another spends the whole latency of
   * every round trip in series for no reason.
   *
   * Measured on a 697-model search: price_history took 1,632ms as five
   * sequential chunks, ebay_links 1,127ms as five more. Those two calls alone
   * were 2.8s of a 3.5s search, and almost all of it was waiting.
   *
   * WAVES RATHER THAN ALL AT ONCE, because the chunk count is driven by the
   * size of the result and nothing here caps it. A query matching the whole
   * catalogue would otherwise open dozens of simultaneous connections, which
   * is how a slow page becomes a rate-limited one.
   */
  const WAVE = 6;
  const out: T[] = [];
  for (let i = 0; i < chunks.length; i += WAVE) {
    const wave = await Promise.all(
      chunks.slice(i, i + WAVE).map((chunk) =>
        selectAll<T>(supabase, table, columns, (q) => {
          const withIn = q.in(column, chunk);
          return tweak ? tweak(withIn) : withIn;
        })
      )
    );
    for (const rows of wave) out.push(...rows);
  }
  return out;
}

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
