import { supabase } from './supabase';
import { selectAll } from './selectAll';

/**
 * Related cars for the bottom of a car page.
 *
 * Two jobs at once. For a collector these are the real questions — what else
 * did this chassis race, who else has a model of this Grand Prix, what did this
 * driver have last season. For crawling, it turns 164 orphan pages into a
 * connected graph: /browse is client-rendered, so before this there were no
 * crawlable links to any car page at all.
 */

export interface RelatedCar {
  id: string;
  slug: string | null;
  title: string;
  imageUrl: string | null;
  hasStore: boolean;
  lowestPrice: number | null;
}

export interface RelatedGroup {
  heading: string;
  cars: RelatedCar[];
}

/** How many to show per section — enough to be useful, not a link farm. */
const PER_GROUP = 6;

export async function getRelatedCars(car: any): Promise<RelatedGroup[]> {
  // One pass over the catalogue; it's small and this avoids four round trips.
  //
  // Paged, because "it's small" stopped being true. PostgREST caps a plain
  // .select() at 1000 rows silently: price_history is at 2,774 and models at
  // 1,463, so an unpaged read here was quietly deciding that most of the
  // catalogue had no models and no prices — which on this page means related
  // cars that look unbuyable, or vanish.
  const [allCars, allModels, allPrices] = await Promise.all([
    selectAll<any>(supabase, 'cars', `
      id, slug, chassis_name, event_name, season_id, team_id, driver_id,
      driver:drivers(name), team:teams(name), season:seasons(year)
    `),
    selectAll<any>(supabase, 'models', 'id, car_id, image_url'),
    selectAll<any>(supabase, 'price_history', 'model_id, price, price_aud, in_stock'),
  ]);

  const modelsByCar = new Map<string, any[]>();
  (allModels || []).forEach((m: any) => {
    if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
    modelsByCar.get(m.car_id)!.push(m);
  });

  const pricesByModel = new Map<string, any[]>();
  (allPrices || []).forEach((p: any) => {
    if (!pricesByModel.has(p.model_id)) pricesByModel.set(p.model_id, []);
    pricesByModel.get(p.model_id)!.push(p);
  });

  const toRelated = (c: any): RelatedCar => {
    const models = modelsByCar.get(c.id) || [];
    const prices = models.flatMap(m => pricesByModel.get(m.id) || []);
    const quotable = prices.filter(p => p.in_stock !== false && p.price > 0);
    return {
      id: c.id,
      slug: c.slug,
      title: `${c.event_name} - ${c.chassis_name} - ${c.driver?.name} - ${c.season?.year}`,
      imageUrl: models.find(m => m.image_url)?.image_url || null,
      hasStore: prices.length > 0,
      lowestPrice: quotable.length
        ? Math.min(...quotable.map(p => parseFloat(p.price_aud) || parseFloat(p.price)))
        : null,
    };
  };

  const hasRetailer = (c: any) =>
    (modelsByCar.get(c.id) || []).some(m => (pricesByModel.get(m.id) || []).length > 0);

  // Only suggest cars someone can actually buy. A third of these links used to
  // land on a page reading "no retailers found" — a dead end for the visitor,
  // and inconsistent with /browse and sitemap.xml, which already exclude them.
  //
  // Store-less cars stay reachable by direct URL and site search; they just
  // aren't promoted anywhere.
  const candidates = (allCars || []).filter((c: any) => c.id !== car.id && hasRetailer(c));

  // Cheapest-first among what's left, so the most appealing suggestion leads
  const rank = (list: any[]) =>
    list
      .map(toRelated)
      .sort((a, b) => {
        if (a.lowestPrice === null && b.lowestPrice === null) return 0;
        if (a.lowestPrice === null) return 1;
        if (b.lowestPrice === null) return -1;
        return a.lowestPrice - b.lowestPrice;
      })
      .slice(0, PER_GROUP);

  // A car appears in at most one section
  const used = new Set<string>();
  const take = (heading: string, list: any[]): RelatedGroup => {
    const picked = rank(list.filter(c => !used.has(c.id)));
    picked.forEach(c => used.add(c.id));
    return { heading, cars: picked };
  };

  const driverName = car.driver?.name;
  const year = car.season?.year;
  const teamName = car.team?.name;

  const groups = [
    take(
      `More ${car.chassis_name} models`,
      candidates.filter(
        (c: any) => c.chassis_name === car.chassis_name && c.driver_id === car.driver_id
      )
    ),
    take(
      `Other drivers at the ${car.event_name}`,
      candidates.filter(
        (c: any) =>
          c.event_name === car.event_name &&
          c.season_id === car.season_id &&
          c.driver_id !== car.driver_id
      )
    ),
    take(
      `${driverName} in other seasons`,
      candidates.filter(
        (c: any) => c.driver_id === car.driver_id && c.season_id !== car.season_id
      )
    ),
    take(
      `More from ${year} ${teamName}`,
      candidates.filter((c: any) => c.team_id === car.team_id && c.season_id === car.season_id)
    ),
  ];

  return groups.filter(g => g.cars.length > 0);
}
