import { supabase } from './supabase';

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
  // One pass over the catalogue; it's small and this avoids four round trips
  const [{ data: allCars }, { data: allModels }, { data: allPrices }] = await Promise.all([
    supabase.from('cars').select(`
      id, slug, chassis_name, event_name, season_id, team_id, driver_id,
      driver:drivers(name), team:teams(name), season:seasons(year)
    `),
    supabase.from('models').select('id, car_id, image_url'),
    supabase.from('price_history').select('model_id, price, price_aud, in_stock'),
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

  const candidates = (allCars || []).filter((c: any) => c.id !== car.id);

  // Rank buyable cars first so most links go somewhere useful — but don't
  // exclude the rest, or part of the catalogue stays uncrawlable.
  const rank = (list: any[]) =>
    list
      .map(toRelated)
      .sort((a, b) => Number(b.hasStore) - Number(a.hasStore))
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
