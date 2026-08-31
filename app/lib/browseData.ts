import { supabase } from './supabase';
import { REQUIRE_RETAILER, fetchModelIdsWithStore } from './storeCoverage';
import { selectAll } from './selectAll';
import { priceSpan, cheapest } from './priceSpan';
import { shouldHidePrice } from './freshness';
import type { Model } from './types';

/**
 * Card data for /browse, loaded on the server.
 *
 * Previously fetched in a useEffect, which meant the page's HTML contained no
 * car names and — more importantly — zero links to any car page. The sitemap
 * tells crawlers the car pages exist; this is the hub page that links to them
 * and passes authority through.
 */
/**
 * Both reads are paged.
 *
 * PostgREST caps a plain .select() at 1000 rows and says nothing about it — no
 * error, no flag, just a short array. `models` crossed that line on 2026-08-29
 * when the 2023 and 2024 imports took it from 865 to 1,463, and /browse
 * immediately dropped to 502 cars from the 631 it should show: every car whose
 * models all sat in the missing 463 had a variantCount of 0 and was filtered
 * out as having nothing to sell.
 *
 * It presented as a smaller catalogue rather than as a failure, which is what
 * makes this cap dangerous — the page looked entirely healthy.
 *
 * `cars` is at 670 and will cross the same line within a couple of seasons, so
 * it is paged now rather than after it silently truncates too.
 */
export async function getBrowseCars(): Promise<Model[]> {
  let carsData: any[];
  let allModels: any[];
  try {
    [carsData, allModels] = await Promise.all([
      selectAll<any>(supabase, 'cars', `
        id,
        slug,
        chassis_name,
        event_name,
        team:teams(name, primary_color, text_color),
        season:seasons(year),
        driver:drivers(name, number)
      `),
      selectAll<any>(supabase, 'models', 'id, car_id, image_url, manufacturer_sku, scale, manufacturers(name)'),
    ]);
  } catch (err: any) {
    console.error('Error fetching browse data:', err.message);
    return [];
  }

  const modelsByCar = new Map<string, any[]>();
  (allModels || []).forEach((m: any) => {
    if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
    modelsByCar.get(m.car_id)!.push(m);
  });

  const modelIdsWithStore = await fetchModelIdsWithStore();

  /**
   * Prices, so the cards can show a range and "Price: Low to High" can work.
   *
   * That sort option has been in the dropdown all along and did nothing: every
   * card carried `price: undefined`, so it compared 0 against 0 for all 729
   * cars and the grid never moved. A control that silently does nothing is
   * worse than no control.
   *
   * Two more paged reads on a page that is ISR with revalidate = 3600, so this
   * is paid once an hour rather than per visitor. hubData already pays exactly
   * the same cost for the same reason.
   */
  const [priceRows, ebayRows] = await Promise.all([
    selectAll<any>(supabase, 'price_history',
      'model_id, price_aud, in_stock, is_preorder, last_checked_at, recorded_at'),
    selectAll<any>(supabase, 'ebay_links',
      'model_id, price_aud, availability, last_checked_at, created_at'),
  ]);

  // The same rules the car page quotes on: in stock, recently verified, and for
  // shops, not a pre-order. A price we would not print is not a price we can
  // sort or compare on either.
  const shopByModel = new Map<string, number[]>();
  for (const r of priceRows) {
    const p = parseFloat(r.price_aud);
    if (!(p > 0) || r.in_stock === false || r.is_preorder === true) continue;
    if (shouldHidePrice(r.last_checked_at || r.recorded_at)) continue;
    if (!shopByModel.has(r.model_id)) shopByModel.set(r.model_id, []);
    shopByModel.get(r.model_id)!.push(p);
  }
  const ebayByModel = new Map<string, number[]>();
  for (const r of ebayRows) {
    const p = parseFloat(r.price_aud);
    if (!(p > 0) || /OUT_OF_STOCK/i.test(r.availability || '')) continue;
    if (shouldHidePrice(r.last_checked_at || r.created_at)) continue;
    if (!ebayByModel.has(r.model_id)) ebayByModel.set(r.model_id, []);
    ebayByModel.get(r.model_id)!.push(p);
  }

  const cards = (carsData || []).map((car: any) => {
    const variants = modelsByCar.get(car.id) || [];
    const driver = car.driver;
    const eventName = car.event_name || 'Grand Prix';
    const hasStore = variants.some((v: any) => modelIdsWithStore.has(v.id));
    const variantWithImage = variants.find((v: any) => v.image_url);

    /**
     * ONE PRODUCT, not the whole car — which means scale AND maker.
     *
     * A car holds several models, and a range across them is not a spread. Two
     * category errors, one inside the other:
     *
     *   scale — a 1:18 costs about twice its 1:43, so a span across both is the
     *   scale difference wearing a spread's clothing
     *
     *   maker — at 1:43 alone, a Bburago is AUD 22.99 and a hand-built BBR of
     *   the SAME car is AUD 831.78. Grouping by scale only produced cards
     *   reading "AUD 28.82 – 831.78", which claims you could own this car for
     *   28.82 when what 28.82 buys is a different, far simpler model
     *
     * So the bucket is scale + maker, which is as close to "one product" as the
     * data gets, and both are printed on the card. The cheapest bucket wins,
     * because the cheapest way to own the car is the thing a price comparison
     * is for — and it is labelled, so nobody mistakes a Bburago price for the
     * Looksmart in the photograph.
     */
    const byProduct = new Map<string, { scale: string; maker: string; shop: number[]; ebay: number[] }>();
    for (const v of variants) {
      const scale = v.scale || '—';
      const maker = v.manufacturers?.name || 'Unknown';
      const key = `${scale}|${maker}`;
      if (!byProduct.has(key)) byProduct.set(key, { scale, maker, shop: [], ebay: [] });
      const bucket = byProduct.get(key)!;
      bucket.shop.push(...(shopByModel.get(v.id) || []));
      bucket.ebay.push(...(ebayByModel.get(v.id) || []));
    }

    let best: {
      scale: string; maker: string; low: number;
      from: 'shop' | 'ebay'; span: ReturnType<typeof priceSpan>;
    } | null = null;
    for (const b of byProduct.values()) {
      const c = cheapest(b.shop, b.ebay);
      if (!c) continue;
      if (!best || c.price < best.low) {
        best = {
          scale: b.scale, maker: b.maker, low: c.price, from: c.from,
          span: priceSpan([...b.shop, ...b.ebay]),
        };
      }
    }

    return {
      id: car.id,
      slug: car.slug,
      name: `${eventName} - ${car.chassis_name} - ${driver?.name} - ${car.season?.year}`,
      manufacturer: `${variants.length} manufacturers`,
      year: car.season?.year || 2024,
      driver: driver?.name,
      team: car.team?.name,
      // Numeric, so sorting compares prices rather than parsing "AUD $12.00"
      // back out of a formatted string.
      lowestPrice: best?.low ?? null,
      lowestFrom: best?.from ?? null,
      priceScale: best ? `${best.scale} ${best.maker}` : null,
      priceRange: best?.span ?? null,
      imageUrl: variantWithImage?.image_url || null,
      releaseDate: undefined,
      scale: variants[0]?.scale || '1:18',
      variantCount: variants.length,
      liveryName: car.chassis_name,
      teamPrimaryColor: car.team?.primary_color,
      teamTextColor: car.team?.text_color,
      eventName,
      hasStore,
    };
  });

  let withModels = cards.filter((c: any) => c.variantCount > 0);

  // The grid is the shop window: only what someone can buy. Detail pages and
  // search stay complete — see lib/storeCoverage.ts.
  if (REQUIRE_RETAILER) {
    const before = withModels.length;
    withModels = withModels.filter((c: any) => c.hasStore);
    console.log(`🏪 Store filter: ${withModels.length}/${before} cars have a retailer or eBay listing`);
  }

  return withModels as Model[];
}
