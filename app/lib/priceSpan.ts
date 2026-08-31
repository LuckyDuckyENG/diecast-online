/**
 * What the same model costs at the cheapest and the dearest place selling it.
 *
 * Shared by the car page and /browse so the two can never disagree about what a
 * range means — the same mistake `slug-util.js` exists to prevent, and the same
 * one that let `hubData` page two tables while leaving two unpaged.
 */

export interface PriceSpan {
  low: number;
  high: number;
  /** How many prices the span was drawn from — always 2 or more. */
  count: number;
}

/**
 * A span, or null when there is nothing to compare.
 *
 * Needs two prices that actually DIFFER. One listing is not a range, and two
 * identical prices are a fact worth knowing but not a spread — rendering either
 * as "AUD 199.54–199.54" is the price again wearing a costume.
 */
export function priceSpan(prices: number[]): PriceSpan | null {
  const p = prices.filter(n => Number.isFinite(n) && n > 0);
  if (p.length < 2) return null;
  const low = Math.min(...p);
  const high = Math.max(...p);
  return high > low ? { low, high, count: p.length } : null;
}

/**
 * The cheapest price anywhere, and which market it came from.
 *
 * Both markets, deliberately, because on the 738 models carrying a price in
 * each, eBay is cheaper than EVERY shop 51% of the time and by as much as 69%.
 * Sorting or quoting on shop prices alone would put genuinely cheap cars in the
 * wrong place and hide the site's most useful finding.
 *
 * `from` is returned so the caller can say WHERE the floor is. A bare "from
 * AUD 186.67" next to a shop name implies a shop offers it, which is the
 * misreading the car page's two separate ranges exist to avoid.
 */
export function cheapest(
  shopPrices: number[],
  ebayPrices: number[]
): { price: number; from: 'shop' | 'ebay' } | null {
  const s = shopPrices.filter(n => Number.isFinite(n) && n > 0);
  const e = ebayPrices.filter(n => Number.isFinite(n) && n > 0);
  if (!s.length && !e.length) return null;
  const sLow = s.length ? Math.min(...s) : Infinity;
  const eLow = e.length ? Math.min(...e) : Infinity;
  // Ties go to the shop: a retail price is payable now and its postage is
  // knowable, so it is the safer thing to point someone at.
  return eLow < sLow ? { price: eLow, from: 'ebay' } : { price: sLow, from: 'shop' };
}
