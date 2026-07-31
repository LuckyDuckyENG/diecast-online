/**
 * Currency conversion to AUD.
 *
 * These rates are hardcoded and undated — a known weak spot. `price_aud` is what
 * the site sorts by to pick the cheapest retailer, so stale rates directly skew
 * which shop looks best. Replace with a real FX source when there's time; until
 * then at least keep a single copy so linking and refreshing can't disagree.
 */
export const CONVERSION_TO_AUD: Record<string, number> = {
  AUD: 1,
  USD: 1.5,
  EUR: 1.6,
  GBP: 1.9,
};

/**
 * Convert to AUD. Unknown currencies fall back to 1:1 rather than null —
 * previously refresh-prices wrote NULL for anything non-AUD, which silently
 * dropped those links out of the price comparison entirely.
 */
export function toAud(price: number, currency?: string | null): number {
  const code = (currency || 'AUD').toUpperCase();
  return price * (CONVERSION_TO_AUD[code] ?? 1);
}
