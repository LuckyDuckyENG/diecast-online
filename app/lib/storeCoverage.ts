import { supabase } from './supabase';
import { selectAll } from './selectAll';

/**
 * Whether /browse hides cars that nobody sells yet.
 *
 * Defaults to ON. Set NEXT_PUBLIC_REQUIRE_RETAILER=false in .env.local to show
 * the full catalogue instead (useful while retailer coverage is still thin).
 *
 * This gates the browse GRID only. Car detail pages, search, and direct URLs
 * always show everything — a car with no stores is still a real car, and it's
 * the natural home for a future "notify me when it's available" signup.
 */
export const REQUIRE_RETAILER = process.env.NEXT_PUBLIC_REQUIRE_RETAILER !== 'false';

/**
 * IDs of every model that is buyable somewhere — a retailer link or an eBay
 * listing. eBay counts from the start, so cars light up automatically as eBay
 * listings get linked, with no code change.
 *
 * Note: despite the name, price_history holds one CURRENT row per
 * (model, retailer) — refresh-prices updates in place rather than appending —
 * so a plain existence check is correct here.
 *
 * BOTH reads must be paged. This decides what appears in the browse grid, and a
 * plain `.select()` stops at PostgREST's 1000-row cap without erroring — so once
 * price_history passed 1000 (it reached 1,151 on 2026-08-17) the tail of it
 * simply stopped counting, and models that ARE buyable quietly vanished from
 * browse. A truncation here looks exactly like "nobody sells this".
 */
export async function fetchModelIdsWithStore(): Promise<Set<string>> {
  const ids = new Set<string>();

  // Retailer links are required — if this read fails the grid would silently
  // empty out, so let it throw rather than return a plausible-looking subset.
  const retailerRows = await selectAll<any>(supabase, 'price_history', 'model_id');
  retailerRows.forEach(row => {
    if (row.model_id) ids.add(row.model_id);
  });

  // eBay is optional — never let it take down the grid.
  try {
    const ebayRows = await selectAll<any>(supabase, 'ebay_links', 'model_id');
    ebayRows.forEach(row => {
      if (row.model_id) ids.add(row.model_id);
    });
  } catch (err: any) {
    console.warn('Could not read eBay links:', err.message);
  }

  return ids;
}
