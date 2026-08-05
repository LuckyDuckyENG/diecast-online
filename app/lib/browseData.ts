import { supabase } from './supabase';
import { REQUIRE_RETAILER, fetchModelIdsWithStore } from './storeCoverage';
import type { Model } from './types';

/**
 * Card data for /browse, loaded on the server.
 *
 * Previously fetched in a useEffect, which meant the page's HTML contained no
 * car names and — more importantly — zero links to any car page. The sitemap
 * tells crawlers the car pages exist; this is the hub page that links to them
 * and passes authority through.
 */
export async function getBrowseCars(): Promise<Model[]> {
  const { data: carsData, error: carsError } = await supabase
    .from('cars')
    .select(`
      id,
      slug,
      chassis_name,
      event_name,
      team:teams(name, primary_color, text_color),
      season:seasons(year),
      driver:drivers(name, number)
    `);

  if (carsError) {
    console.error('Error fetching cars:', carsError.message);
    return [];
  }

  const { data: allModels, error: modelsError } = await supabase
    .from('models')
    .select('id, car_id, image_url, manufacturer_sku, scale, manufacturers(name)');

  if (modelsError) {
    console.error('Error fetching models:', modelsError.message);
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
