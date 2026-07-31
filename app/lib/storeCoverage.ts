import { supabase } from './supabase';

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
 */
export async function fetchModelIdsWithStore(): Promise<Set<string>> {
  const ids = new Set<string>();

  const [retailerResult, ebayResult] = await Promise.all([
    supabase.from('price_history').select('model_id'),
    supabase.from('ebay_links').select('model_id'),
  ]);

  if (retailerResult.error) {
    // Fail loudly-ish: without this the grid would silently empty out.
    console.error('Error fetching retailer links:', retailerResult.error.message);
    throw new Error(retailerResult.error.message);
  }
  (retailerResult.data || []).forEach((row: any) => {
    if (row.model_id) ids.add(row.model_id);
  });

  // eBay is optional — never let it take down the grid.
  if (ebayResult.error) {
    console.warn('Could not read eBay links:', ebayResult.error.message);
  } else {
    (ebayResult.data || []).forEach((row: any) => {
      if (row.model_id) ids.add(row.model_id);
    });
  }

  return ids;
}
