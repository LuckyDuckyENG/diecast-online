import { supabase } from './supabase';
import { selectAll } from './selectAll';

/**
 * Search, filtered by the DATABASE rather than by the browser.
 *
 * WHAT WAS WRONG
 *
 * /search downloaded every car and every model to the client and filtered them
 * in JavaScript. Three faults, all from that one decision:
 *
 *   IT COULD NOT SEE MOST OF THE CATALOGUE. A plain .select() is capped at
 *   1000 rows by PostgREST, silently. With 1,192 cars and 2,848 models the
 *   page received 1000 of each, so 1,848 models were unreachable. A car could
 *   still MATCH -- driver names are on the car row -- while none of its models
 *   came down, and the card then fell back to no image, "Unknown" maker and a
 *   hardcoded 1:18. Searching "senna" returned 50 cars of which 48 showed
 *   none of their models. That is what "the wrong results come in" was.
 *
 *   IT WAS INVISIBLE TO CRAWLERS. Results rendered only after hydration, so
 *   every /search URL served an empty page to Google.
 *
 *   IT COST A CATALOGUE DOWNLOAD PER SEARCH. ~2,000 rows from the browser on
 *   every keystroke-completed query, which is egress this project has already
 *   been billed for once.
 *
 * Filtering in the database fixes all three at once: the query returns tens of
 * rows rather than thousands, so the cap is never approached, the work happens
 * on the server where it can be rendered into the HTML, and the client
 * downloads only what it displays.
 */

export interface SearchCar {
  id: string;
  slug: string | null;
  name: string;
  year: number | null;
  driver: string | null;
  team: string | null;
  liveryName: string | null;
  manufacturer: string;
  manufacturers: string[];
  scales: string[];
  imageUrl: string | null;
  teamPrimaryColor: string | null;
  teamTextColor: string | null;
  hasStore: boolean;
}

/** PostgREST treats % and _ as wildcards inside ilike; a user's text is not a pattern. */
const escapeLike = (s: string) => s.replace(/[%_\\]/g, ch => `\\${ch}`);

/** Hard ceiling on a result set, so a one-letter query cannot pull the catalogue. */
const MAX_CARS = 200;

/**
 * A four-digit season anywhere in the query, and whatever else was typed.
 *
 * "2020" is a season. "hamilton 2020" is a driver IN a season, which is the
 * pair people actually type. Pulling the year out lets the rest of the query
 * stay a text match and the year become a filter, so the two combine as AND
 * rather than returning everything that matches either.
 *
 * Bounded to 1950-2030 so a part number fragment cannot be read as a year.
 */
const splitYear = (q: string) => {
  const m = q.match(/(?:^|\s)((?:19|20)\d{2})(?=\s|$)/);
  const year = m ? Number(m[1]) : null;
  if (!year || year < 1950 || year > 2030) return { year: null, text: q };
  return { year, text: (q.slice(0, m!.index) + ' ' + q.slice(m!.index! + m![0].length)).trim() };
};

export async function searchCars(rawQuery: string): Promise<SearchCar[]> {
  const raw = rawQuery.trim();
  if (raw.length < 2) return [];

  const { year, text } = splitYear(raw);
  const q = text;
  const like = `%${escapeLike(q.toLowerCase())}%`;

  /**
   * A season restricts the result rather than widening it.
   *
   * Resolved first because every car query below is scoped to it, which is
   * what makes "hamilton 2020" mean Hamilton AND 2020.
   */
  let seasonId: string | null = null;
  if (year) {
    const { data } = await supabase.from('seasons').select('id').eq('year', year).maybeSingle();
    // A year we hold no season for matches nothing, rather than silently
    // falling back to an unfiltered search for the rest of the words.
    if (!data) return [];
    seasonId = data.id;
  }
  const scoped = (qb: any) => (seasonId ? qb.eq('season_id', seasonId) : qb);

  const CAR_FIELDS_BASE =
    'id, slug, chassis_name, event_name, season:seasons(year), ' +
    'team:teams(name, primary_color, text_color), driver:drivers(name, number)';

  /**
   * A year on its own lists the season.
   *
   * It deliberately does NOT also match part numbers. 13 models carry "2017"
   * inside their SKU and every one of them is from another season --
   * 410201777 is a 2020 car -- so including them would answer "show me 2017"
   * with cars from 2020 and 2022.
   */
  if (year && !q) {
    const { data } = await supabase
      .from('cars').select(CAR_FIELDS_BASE).eq('season_id', seasonId).limit(MAX_CARS);
    return decorate(data || []);
  }

  /**
   * Four narrow lookups instead of one wide download.
   *
   * Driver and team are separate tables, so their ids are resolved first and
   * fed back as an `in` filter. Doing it as one embedded-resource filter is
   * possible but makes the OR across four different relationships unreadable,
   * and these are indexed id lookups returning a handful of rows.
   */
  const [driverRows, teamRows, skuRows] = await Promise.all([
    supabase.from('drivers').select('id').ilike('name', like),
    supabase.from('teams').select('id').ilike('name', like),
    supabase.from('models').select('car_id').ilike('manufacturer_sku', like).limit(MAX_CARS * 3),
  ]);

  const driverIds = (driverRows.data || []).map(d => d.id);
  const teamIds = (teamRows.data || []).map(t => t.id);
  const skuCarIds = [...new Set((skuRows.data || []).map(m => m.car_id).filter(Boolean))];

  const CAR_FIELDS = CAR_FIELDS_BASE;

  const queries: any[] = [
    scoped(supabase.from('cars').select(CAR_FIELDS).ilike('chassis_name', like)).limit(MAX_CARS),
    scoped(supabase.from('cars').select(CAR_FIELDS).ilike('event_name', like)).limit(MAX_CARS),
  ];
  if (driverIds.length) queries.push(scoped(supabase.from('cars').select(CAR_FIELDS).in('driver_id', driverIds)).limit(MAX_CARS));
  if (teamIds.length) queries.push(scoped(supabase.from('cars').select(CAR_FIELDS).in('team_id', teamIds)).limit(MAX_CARS));
  if (skuCarIds.length) queries.push(scoped(supabase.from('cars').select(CAR_FIELDS).in('id', skuCarIds)).limit(MAX_CARS));

  const results = await Promise.all(queries);
  const byId = new Map<string, any>();
  for (const r of results) for (const car of r.data || []) byId.set(car.id, car);
  const cars = [...byId.values()].slice(0, MAX_CARS);
  if (!cars.length) return [];
  return decorate(cars);
}

/** Attach models, makers, scales and whether anyone sells it. */
async function decorate(cars: any[]): Promise<SearchCar[]> {
  if (!cars.length) return [];

  /**
   * Models for THESE cars only. The old code took whatever 1000 models came
   * back and hoped the right ones were among them; this asks for the ones it
   * is about to render.
   */
  const carIds = cars.map(c => c.id);
  const models = await selectAll<any>(
    supabase, 'models', 'id, car_id, image_url, scale, manufacturers(name)',
    qb => qb.in('car_id', carIds)
  );

  const byCar = new Map<string, any[]>();
  for (const m of models) {
    if (!byCar.has(m.car_id)) byCar.set(m.car_id, []);
    byCar.get(m.car_id)!.push(m);
  }

  // Which of these models anyone actually sells. Scoped to the result set for
  // the same reason as above.
  const modelIds = models.map(m => m.id);
  const [priceRows, ebayRows] = await Promise.all([
    modelIds.length
      ? selectAll<any>(supabase, 'price_history', 'model_id', qb => qb.in('model_id', modelIds))
      : Promise.resolve([]),
    modelIds.length
      ? selectAll<any>(supabase, 'ebay_links', 'model_id', qb => qb.in('model_id', modelIds))
      : Promise.resolve([]),
  ]);
  const sold = new Set<string>([
    ...priceRows.map((p: any) => p.model_id),
    ...ebayRows.map((e: any) => e.model_id),
  ]);

  const out: SearchCar[] = cars.map((car: any) => {
    const variants = byCar.get(car.id) || [];
    const makers = [...new Set(variants.map(v => v.manufacturers?.name).filter(Boolean))] as string[];
    const scales = [...new Set(variants.map(v => v.scale).filter(Boolean))] as string[];
    return {
      id: car.id,
      slug: car.slug ?? null,
      name: `${car.event_name || 'Grand Prix'} - ${car.chassis_name} - ${car.driver?.name} - ${car.season?.year}`,
      // No `|| 2024`. A missing season is missing, not 2024 -- the old default
      // stamped the current year onto any car whose season failed to load.
      year: car.season?.year ?? null,
      driver: car.driver?.name ?? null,
      team: car.team?.name ?? null,
      liveryName: car.chassis_name ?? null,
      manufacturer:
        makers.length === 0 ? 'Unknown'
        : makers.length <= 2 ? makers.join(' · ')
        : `${makers.slice(0, 2).join(' · ')} +${makers.length - 2}`,
      manufacturers: makers,
      scales,
      imageUrl: variants.find(v => v.image_url)?.image_url || null,
      teamPrimaryColor: car.team?.primary_color ?? null,
      teamTextColor: car.team?.text_color ?? null,
      hasStore: variants.some(v => sold.has(v.id)),
    };
  });

  /**
   * Buyable first, then newest. Search deliberately does NOT drop the rest:
   * someone typing a driver's name meant it, and an empty page looks broken.
   */
  return out.sort(
    (a, b) => Number(b.hasStore) - Number(a.hasStore) || (b.year ?? 0) - (a.year ?? 0)
  );
}
