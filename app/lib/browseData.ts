import { supabase } from './supabase';
import { REQUIRE_RETAILER, fetchModelIdsWithStore } from './storeCoverage';
import { selectAll } from './selectAll';
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

  const cards = (carsData || []).map((car: any) => {
    const variants = modelsByCar.get(car.id) || [];
    const driver = car.driver;
    const eventName = car.event_name || 'Grand Prix';
    const hasStore = variants.some((v: any) => modelIdsWithStore.has(v.id));
    const variantWithImage = variants.find((v: any) => v.image_url);

    return {
      id: car.id,
      slug: car.slug,
      name: `${eventName} - ${car.chassis_name} - ${driver?.name} - ${car.season?.year}`,
      manufacturer: `${variants.length} manufacturers`,
      year: car.season?.year || 2024,
      driver: driver?.name,
      team: car.team?.name,
      price: undefined,
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
