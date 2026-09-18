import { supabase } from './supabase';
import { selectAll } from './selectAll';
import { shouldHidePrice } from './freshness';

/**
 * Where a model is cheaper than what it usually costs.
 *
 * The site's whole claim is that the same model costs different money at
 * different shops — measured, the median gap is AUD 53. This page is that claim
 * stated directly instead of left for a visitor to find one car page at a time.
 *
 * WHY "TYPICAL" AND NOT "CHEAPEST VS DEAREST"
 *
 * Ranking by the full spread ranks by whichever shop is most expensive, and
 * shops differ in price level for honest reasons. Car Model Store prices at
 * 1.73x the market — it is a UK retailer at UK prices, not a data fault — so a
 * dearest-based page would mostly have said "don't buy from the expensive one",
 * which is true and useless. Comparing against the MEDIAN says "this is below
 * what this model normally goes for", which is what a buyer actually wants and
 * which no single shop can manufacture.
 */

/** A median of two prices is just the dearer one, so "typical" would be a lie. */
const MIN_SHOPS = 3;

/**
 * Below this, the gap is not worth acting on.
 *
 * Postage is not in the data — the site says so wherever it quotes a price —
 * so a gap smaller than a typical shipping difference cannot honestly be
 * called a saving.
 */
const MIN_SAVING_AUD = 20;

export interface SavingRow {
  modelId: string;
  carSlug: string | null;
  /** "1:18 Minichamps", the thing being compared. */
  label: string;
  scale: string | null;
  manufacturer: string | null;
  year: number | null;
  driver: string | null;
  event: string | null;
  imageUrl: string | null;
  /** Cheapest live price, and who has it. */
  price: number;
  seller: string;
  /** Median of the SHOP prices for this model — what it normally costs. */
  typical: number;
  /** typical - price, always at least MIN_SAVING_AUD. */
  saving: number;
  /** As a share of typical. */
  pct: number;
  /** How many shop prices the median was drawn from. Never below MIN_SHOPS. */
  shopCount: number;
  /**
   * Which market the cheap price is in.
   *
   * Never mixed in the UI. A shop price and a used eBay asking price are
   * different kinds of number — the same reason the car page carries two
   * separate ranges rather than one.
   */
  kind: 'shop' | 'ebay';
  /** eBay only: the listing's condition, because "used" changes what it means. */
  condition?: string | null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

export async function getSavings(): Promise<{ shop: SavingRow[]; ebay: SavingRow[] }> {
  const [priceRows, ebayRows, models, cars, seasons, drivers, retailers] = await Promise.all([
    selectAll<any>(supabase, 'price_history',
      'model_id, price_aud, in_stock, is_preorder, retailer_id, last_checked_at, recorded_at'),
    selectAll<any>(supabase, 'ebay_links',
      'model_id, price_aud, availability, last_checked_at, created_at, seller, item_condition'),
    selectAll<any>(supabase, 'models', 'id, car_id, scale, image_url, manufacturers(name)'),
    selectAll<any>(supabase, 'cars', 'id, slug, season_id, driver_id, event_name'),
    selectAll<any>(supabase, 'seasons', 'id, year'),
    selectAll<any>(supabase, 'drivers', 'id, name'),
    selectAll<any>(supabase, 'retailers', 'id, name'),
  ]);

  const Y = new Map(seasons.map(s => [s.id, s.year]));
  const D = new Map(drivers.map(d => [d.id, d.name]));
  const R = new Map(retailers.map(r => [r.id, r.name]));
  const C = new Map(cars.map(c => [c.id, c]));
  const M = new Map(models.map(m => [m.id, m]));

  /**
   * Exactly the prices the site is willing to quote: in stock, not a
   * pre-order, and checked recently enough that we still believe it. Anything
   * we would hide on a car page has no business setting a headline here.
   */
  const shopPrices = new Map<string, { price: number; who: string }[]>();
  for (const r of priceRows) {
    const p = Number(r.price_aud);
    if (!(p > 0) || r.in_stock === false || r.is_preorder === true) continue;
    if (shouldHidePrice(r.last_checked_at || r.recorded_at)) continue;
    if (!shopPrices.has(r.model_id)) shopPrices.set(r.model_id, []);
    shopPrices.get(r.model_id)!.push({ price: p, who: R.get(r.retailer_id) || 'a shop' });
  }

  const ebayPrices = new Map<string, { price: number; who: string; condition: string | null }[]>();
  for (const r of ebayRows) {
    const p = Number(r.price_aud);
    if (!(p > 0) || /OUT_OF_STOCK/i.test(r.availability || '')) continue;
    if (shouldHidePrice(r.last_checked_at || r.created_at)) continue;
    if (!ebayPrices.has(r.model_id)) ebayPrices.set(r.model_id, []);
    ebayPrices.get(r.model_id)!.push({
      price: p,
      who: r.seller || 'an eBay seller',
      condition: r.item_condition || null,
    });
  }

  const describe = (modelId: string) => {
    const m = M.get(modelId);
    const c = m ? C.get(m.car_id) : null;
    const maker = m?.manufacturers?.name || null;
    return {
      carSlug: c?.slug ?? null,
      label: [m?.scale, maker].filter(Boolean).join(' ') || 'Model',
      scale: m?.scale ?? null,
      manufacturer: maker,
      year: c ? Y.get(c.season_id) ?? null : null,
      driver: c ? D.get(c.driver_id) ?? null : null,
      event: c?.event_name ?? null,
      imageUrl: m?.image_url ?? null,
    };
  };

  const shop: SavingRow[] = [];
  const ebay: SavingRow[] = [];

  for (const [modelId, prices] of shopPrices) {
    // The median needs enough shops to mean anything at all.
    if (prices.length < MIN_SHOPS) continue;
    const typical = median(prices.map(p => p.price));
    const cheapest = [...prices].sort((a, b) => a.price - b.price)[0];

    const shopSaving = typical - cheapest.price;
    if (shopSaving >= MIN_SAVING_AUD) {
      shop.push({
        modelId, ...describe(modelId),
        price: cheapest.price, seller: cheapest.who,
        typical, saving: shopSaving, pct: shopSaving / typical,
        shopCount: prices.length, kind: 'shop',
      });
    }

    /**
     * eBay is measured against the SHOP median, never against other eBay
     * listings. The question worth answering is "is the used market cheaper
     * than buying it new", and comparing eBay to eBay would only say one
     * seller undercuts another.
     */
    const listings = ebayPrices.get(modelId);
    if (listings?.length) {
      const best = [...listings].sort((a, b) => a.price - b.price)[0];
      const ebaySaving = typical - best.price;
      if (ebaySaving >= MIN_SAVING_AUD) {
        ebay.push({
          modelId, ...describe(modelId),
          price: best.price, seller: best.who,
          typical, saving: ebaySaving, pct: ebaySaving / typical,
          shopCount: prices.length, kind: 'ebay', condition: best.condition,
        });
      }
    }
  }

  const bySaving = (a: SavingRow, b: SavingRow) => b.saving - a.saving;
  return { shop: shop.sort(bySaving), ebay: ebay.sort(bySaving) };
}
