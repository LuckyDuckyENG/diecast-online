import { supabase } from './supabase';
import { selectAll } from './selectAll';

/**
 * The shops this site reads, stated publicly.
 *
 * WHY IT EXISTS
 *
 * Asked for on r/Diecast, 2026-10-12: "If there an easy way to see what
 * retailers your following so we can potentially suggest others?"
 *
 * /retailers already existed and is NOT this: it is a pitch TO shops, asking
 * them to be listed. There was nowhere to see which 48 are actually read, so
 * the one thing a reader could usefully offer -- a shop we have never heard of
 * -- had nowhere to be offered.
 *
 * That is not hypothetical. The same thread produced spr-models.co.nz, which
 * turned out to hold the cheapest price on 90 models. A collector found a shop
 * that beat every one of the 47 already indexed, and the only reason it
 * arrived is that somebody volunteered it in a comment.
 *
 * IT ALSO GIVES THE TAX LABELS A HOME. Car pages say "includes 20% VAT" on a
 * single price. This is where the rule behind that can be stated once.
 */

export interface Shop {
  name: string;
  url: string | null;
  region: string | null;
  currency: string | null;
  /** Sales tax already inside the listed price, or null for unknown/none. */
  vatRate: number | null;
  /** Prices held from this shop. The honest measure of how much we read it. */
  prices: number;
  /** How many of those were re-checked within the staleness window. */
  fresh: number;
}

/** Matches lib/freshness.ts, which is what decides whether a price is shown. */
const STALE_DAYS = 30;

export async function getShops(): Promise<{ shops: Shop[]; totalPrices: number }> {
  const [retailers, prices] = await Promise.all([
    selectAll<any>(supabase, 'retailers', 'id, name, url, region, currency, vat_rate'),
    selectAll<any>(supabase, 'price_history', 'retailer_id, last_checked_at'),
  ]);

  const cutoff = Date.now() - STALE_DAYS * 86_400_000;
  const count = new Map<string, number>();
  const fresh = new Map<string, number>();
  for (const p of prices) {
    count.set(p.retailer_id, (count.get(p.retailer_id) || 0) + 1);
    if (p.last_checked_at && new Date(p.last_checked_at).getTime() >= cutoff) {
      fresh.set(p.retailer_id, (fresh.get(p.retailer_id) || 0) + 1);
    }
  }

  const shops: Shop[] = retailers
    .map(r => ({
      name: r.name,
      url: r.url ?? null,
      region: r.region ?? null,
      currency: r.currency ?? null,
      vatRate: r.vat_rate ?? null,
      prices: count.get(r.id) || 0,
      fresh: fresh.get(r.id) || 0,
    }))
    /**
     * Shops with no prices are left OUT, not shown as zeroes.
     *
     * 13 of the 48 rows hold nothing: some were added speculatively, some
     * stopped stocking F1. Listing them would claim we read a shop we do not,
     * which is exactly the kind of small overstatement this page exists to
     * avoid -- and it would invite someone to point out that a shop we
     * "follow" has nothing from it.
     */
    .filter(s => s.prices > 0)
    .sort((a, b) => b.prices - a.prices);

  return { shops, totalPrices: shops.reduce((n, s) => n + s.prices, 0) };
}

/** Two-letter codes are not a thing most readers decode on sight. */
export const COUNTRY: Record<string, string> = {
  AU: 'Australia', NZ: 'New Zealand', UK: 'United Kingdom', US: 'United States',
  BE: 'Belgium', NL: 'Netherlands', DE: 'Germany', AT: 'Austria', CZ: 'Czechia',
  CA: 'Canada', CN: 'China', GLOBAL: 'International',
};
