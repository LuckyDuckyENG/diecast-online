import { supabase } from './supabase';
import { slugify } from './carSlug';
import { getHubSlugs } from './hubData';
import { fetchModelIdsWithStore } from './storeCoverage';
import { buildEbayPhotoMap, ebayPhotoForVariants } from './ebayPhoto';
import { shouldHidePrice } from './freshness';
import { shortTeamName } from './carTitle';

/**
 * Home page data, fetched on the server.
 *
 * It used to be fetched in three useEffects, which meant a crawler received
 * empty containers: the served HTML carried 21 internal links and **not one**
 * of them pointed at a car, driver, team or season. The whole catalogue was
 * reachable only through the sitemap, with nothing on the front page telling
 * Google which pages mattered.
 *
 * Uses the anon key like the other public data modules, so RLS still applies
 * and a bug here cannot write.
 */

export interface HomeDriver {
  name: string;
  /**
   * EVERY team they raced for, most-modelled first.
   *
   * Was a single `team`, read as `cars[cars.length - 1]?.team?.name` — which
   * is not "the latest team", it is whichever row PostgREST happened to return
   * last, with no ordering applied anywhere. So Hamilton's card could say
   * McLaren and Alonso's could say Minardi, at random, and the card was
   * claiming a fact it had not established.
   *
   * A career is the interesting thing anyway: Alonso has five teams here and
   * Lauda five, and for a catalogue the useful order is how many of their
   * models we actually hold, since that is what the visitor can buy.
   */
  teams: string[];
  color: string;
  count: number;
  /** Set only when a hub page exists; otherwise the card is not a link. */
  slug: string | null;
}

export interface HomeCar {
  id: string;
  slug: string | null;
  event: string;
  year: number;
  driver: string;
  team: string;
  livery: string;
  teamColor: string;
  imageUrl: string | null;
  /** imageUrl is an eBay listing photo, not a product shot. Captioned. */
  imageFromEbay?: boolean;
  /** Distinct shops selling any model of this car — not the model count. */
  retailers: number;
  /**
   * Cheapest quotable price in AUD, or null when nothing is currently
   * quotable. This replaces a literal `Math.random()` that was shipping
   * fabricated "from $X" figures on the front page of a price index.
   */
  lowestPrice: number | null;
}

export interface HomeStats {
  models: number;
  manufacturers: number;
  retailers: number;
  addedThisWeek: number;
}

export async function getHomeData(): Promise<{
  stats: HomeStats;
  drivers: HomeDriver[];
  latestCars: HomeCar[];
}> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    { count: models },
    { count: manufacturers },
    { count: retailers },
    { count: addedThisWeek },
    { data: allDrivers },
    { data: carsData },
    hubs,
  ] = await Promise.all([
    supabase.from('models').select('*', { count: 'exact', head: true }),
    supabase.from('manufacturers').select('*', { count: 'exact', head: true }),
    supabase.from('retailers').select('*', { count: 'exact', head: true }),
    supabase
      .from('cars')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo.toISOString()),
    supabase.from('drivers').select('id, name, cars(id, team:teams(name, primary_color))'),
    supabase
      .from('cars')
      .select(
        'id, slug, event_name, chassis_name, created_at, ' +
          'team:teams(name, primary_color), season:seasons(year), driver:drivers(name)'
      )
      // Over-fetch: the newest cars are filtered down to those a visitor can
      // actually buy, and 24 recent rows only yielded 8 such cars — leaving the
      // third row of the grid empty and four car links out of the HTML.
      .order('created_at', { ascending: false })
      .limit(60),
    getHubSlugs(),
  ]);

  // Only drivers with a hub become links — MIN_CARS_FOR_HUB means a slug can
  // exist without a page, and linking to one would hand Google a 404.
  const hubDrivers = new Set(hubs.drivers);

  const built: HomeDriver[] = (allDrivers || []).map((d: any) => {
    const cars = d.cars || [];
    const slug = d.name ? slugify(d.name) : '';

    // Teams by how many of this driver's cars we hold, descending.
    const tally = new Map<string, { n: number; color: string | null }>();
    for (const c of cars) {
      const name = c?.team?.name;
      if (!name) continue;
      const seen = tally.get(name);
      if (seen) seen.n++;
      else tally.set(name, { n: 1, color: c.team.primary_color ?? null });
    }
    const ranked = [...tally.entries()].sort((a, b) => b[1].n - a[1].n);

    return {
      name: d.name,
      teams: ranked.map(([name]) => shortTeamName(name)),
      // The colour of the team they are most modelled in, not of a random row.
      // Alfa Romeo's primary_color is null across all 80 of its cars, so the
      // fallback is load-bearing rather than defensive.
      color: ranked[0]?.[1].color || '#cf2f2a',
      count: cars.length,
      slug: hubDrivers.has(slug) ? slug : null,
    };
  });

  /**
   * WHO GETS A CARD, chosen rather than computed.
   *
   * Ranking by car count alone gave ten modern drivers, four of whom were
   * teammates of each other, and it put Perez, Bottas, Ricciardo and Sainz on
   * the front page of a catalogue whose distinguishing feature is that it goes
   * back to 1950. The page was arguing against its own headline.
   *
   * So: the five current drivers worth keeping, plus five who are the reason
   * anyone cares about the older seasons. Fangio is deliberately last and
   * deliberately included -- 22 cars is the smallest here, but he is the
   * 1950s, and a visitor who sees him knows the depth is real.
   *
   * Any name not in the catalogue, or without a hub page, simply falls through
   * to the count-ranked remainder, so the grid is never short.
   */
  const FEATURED = [
    'Lewis Hamilton',
    'Max Verstappen',
    'Ayrton Senna',
    'Michael Schumacher',
    'Fernando Alonso',
    'Charles Leclerc',
    'Lando Norris',
    'Niki Lauda',
    'Alain Prost',
    'Juan Manuel Fangio',
  ];

  const byName = new Map(built.map(d => [d.name, d]));
  const featured = FEATURED.map(n => byName.get(n)).filter(Boolean) as HomeDriver[];
  const filler = built
    .filter(d => !FEATURED.includes(d.name))
    .sort((a, b) => b.count - a.count);
  const drivers: HomeDriver[] = [...featured, ...filler].slice(0, 10);

  // Newest cars, but only ones a visitor can actually buy from — a card
  // linking to a car with no retailer is a dead end, and those cars are
  // excluded from browse and the sitemap for the same reason.
  const carIds = (carsData || []).map((c: any) => c.id);
  const [{ data: allModels }, sellable] = await Promise.all([
    carIds.length
      ? supabase
          .from('models')
          .select('id, car_id, image_url')
          .in('car_id', carIds)
      : Promise.resolve({ data: [] as any[] }),
    fetchModelIdsWithStore(),
  ]);

  const modelsByCar = new Map<string, any[]>();
  (allModels || []).forEach((m: any) => {
    if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
    modelsByCar.get(m.car_id)!.push(m);
  });

  // Real prices and real shop counts for those models. Same rule the car page
  // uses for "lowest": in stock, and recent enough that we are still willing
  // to quote it. eBay is excluded — a secondary-market asking price is not a
  // retail comparison.
  const modelIds = (allModels || []).map((m: any) => m.id);
  /**
   * eBay rows come along for the last-resort photo on cars with no picture.
   *
   * Scoped to these models, like the prices beside it. The newest 60 cars hold
   * roughly a hundred models, so this is a small read -- where a full scan of
   * ebay_links would be 5,501 rows for a dozen thumbnails.
   */
  const [{ data: priceRows }, { data: ebayRows }] = await Promise.all([
    modelIds.length
      ? supabase
          .from('price_history')
          .select('model_id, retailer_id, price_aud, in_stock, last_checked_at, recorded_at')
          .in('model_id', modelIds)
      : Promise.resolve({ data: [] as any[] }),
    modelIds.length
      ? supabase.from('ebay_links').select('model_id, ebay_image').in('model_id', modelIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const ebayPhotos = buildEbayPhotoMap(ebayRows || [], priceRows || []);

  const priceByCar = new Map<string, { low: number | null; shops: Set<string> }>();
  for (const m of allModels || []) {
    if (!priceByCar.has(m.car_id)) priceByCar.set(m.car_id, { low: null, shops: new Set() });
  }
  for (const row of priceRows || []) {
    const model = (allModels || []).find((m: any) => m.id === row.model_id);
    if (!model) continue;
    const bucket = priceByCar.get(model.car_id)!;
    if (row.retailer_id) bucket.shops.add(row.retailer_id);

    const aud = Number(row.price_aud);
    if (!(aud > 0) || row.in_stock === false) continue;
    if (shouldHidePrice(row.last_checked_at || row.recorded_at || null)) continue;
    bucket.low = bucket.low === null ? aud : Math.min(bucket.low, aud);
  }

  const latestCars: HomeCar[] = (carsData || [])
    .map((car: any) => {
      const models = modelsByCar.get(car.id) || [];
      return {
        id: car.id,
        slug: car.slug || null,
        event: car.event_name || 'Grand Prix',
        year: car.season?.year || new Date().getFullYear(),
        driver: car.driver?.name || '',
        team: car.team?.name || '',
        livery: car.chassis_name || '',
        teamColor: car.team?.primary_color || '#cf2f2a',
        // A product shot wins; the eBay snapshot only fills a car with none
        // and no shop that could ever supply one. See lib/ebayPhoto.ts.
        imageUrl: models.find((m: any) => m.image_url)?.image_url
          || ebayPhotoForVariants(models, ebayPhotos) || null,
        imageFromEbay: !models.some((m: any) => m.image_url)
          && !!ebayPhotoForVariants(models, ebayPhotos),
        retailers: priceByCar.get(car.id)?.shops.size ?? 0,
        lowestPrice: priceByCar.get(car.id)?.low ?? null,
        _buyable: models.some((m: any) => sellable.has(m.id)),
      };
    })
    .filter((c: any) => c._buyable && c.slug)
    .slice(0, 12)
    .map(({ _buyable, ...car }: any) => car);


  return {
    stats: {
      models: models || 0,
      manufacturers: manufacturers || 0,
      retailers: retailers || 0,
      addedThisWeek: addedThisWeek || 0,
    },
    drivers,
    latestCars,
  };
}
