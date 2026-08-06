import { supabase } from './supabase';
import { slugify, teamSlug } from './carSlug';
import type { Model } from './types';

/**
 * Hub pages: /drivers/[slug], /teams/[slug], /seasons/[year].
 *
 * These target searches the car pages can't. "Max Verstappen diecast" is a real
 * query with real intent, and a page listing all 19 of his models beats any
 * retailer's — they each stock one or two. Previously that query had nowhere to
 * land: filtering produced /browse?driver=Max+Verstappen, a query-parameter URL
 * search engines generally won't index.
 *
 * They also give the catalogue a third layer of internal linking, grouped by
 * topic, which carries more signal than a generic listing.
 */

/**
 * Minimum buyable cars before a subject gets its own page.
 *
 * Pages listing one or two models are the thin-aggregation pattern search
 * engines filter out — a hub has to be worth landing on. Raise this to be
 * stricter; at 3 it yields ~13 drivers and ~10 teams.
 */
export const MIN_CARS_FOR_HUB = 3;

export interface HubCar extends Model {
  lowestPrice: number | null;
}

export interface HubData {
  title: string;
  subject: string;
  cars: HubCar[];
  manufacturers: string[];
  scales: string[];
  years: number[];
  lowestPrice: number | null;
}

async function loadCatalogue() {
  const [{ data: cars }, { data: models }, { data: prices }, { data: ebay }] = await Promise.all([
    supabase.from('cars').select(`
      id, slug, chassis_name, event_name,
      driver:drivers(name), team:teams(name, primary_color, text_color), season:seasons(year)
    `),
    supabase.from('models').select('id, car_id, image_url, scale, manufacturers(name)'),
    supabase.from('price_history').select('model_id, price, price_aud, in_stock'),
    supabase.from('ebay_links').select('model_id'),
  ]);

  const modelsByCar = new Map<string, any[]>();
  (models || []).forEach((m: any) => {
    if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
    modelsByCar.get(m.car_id)!.push(m);
  });

  const pricesByModel = new Map<string, any[]>();
  (prices || []).forEach((p: any) => {
    if (!pricesByModel.has(p.model_id)) pricesByModel.set(p.model_id, []);
    pricesByModel.get(p.model_id)!.push(p);
  });

  const sellable = new Set<string>([
    ...(prices || []).map((p: any) => p.model_id),
    ...(ebay || []).map((e: any) => e.model_id),
  ]);

  return { cars: cars || [], modelsByCar, pricesByModel, sellable };
}

function toHubCar(car: any, modelsByCar: Map<string, any[]>, pricesByModel: Map<string, any[]>): HubCar {
  const variants = modelsByCar.get(car.id) || [];
  const linked = variants.flatMap(v => pricesByModel.get(v.id) || []);
  const quotable = linked.filter(p => p.in_stock !== false && p.price > 0);

  return {
    id: car.id,
    slug: car.slug,
    name: `${car.event_name} - ${car.chassis_name} - ${car.driver?.name} - ${car.season?.year}`,
    manufacturer: `${variants.length} manufacturers`,
    year: car.season?.year || 0,
    driver: car.driver?.name,
    team: car.team?.name,
    imageUrl: variants.find(v => v.image_url)?.image_url || null,
    scale: variants[0]?.scale || '1:18',
    liveryName: car.chassis_name,
    teamPrimaryColor: car.team?.primary_color,
    teamTextColor: car.team?.text_color,
    eventName: car.event_name,
    hasStore: true,
    lowestPrice: quotable.length
      ? Math.min(...quotable.map(p => parseFloat(p.price_aud) || parseFloat(p.price)))
      : null,
  } as HubCar;
}

/** Build a hub from whichever subset of cars matches. */
async function buildHub(
  match: (car: any) => boolean,
  subject: string,
  title: string
): Promise<HubData | null> {
  const { cars, modelsByCar, pricesByModel, sellable } = await loadCatalogue();

  const matching = cars.filter(
    (c: any) => match(c) && (modelsByCar.get(c.id) || []).some(m => sellable.has(m.id))
  );

  if (matching.length < MIN_CARS_FOR_HUB) return null;

  const hubCars = matching
    .map(c => toHubCar(c, modelsByCar, pricesByModel))
    .sort((a, b) => (b.year || 0) - (a.year || 0) || a.name.localeCompare(b.name));

  const allVariants = matching.flatMap(c => modelsByCar.get(c.id) || []);
  const prices = hubCars.map(c => c.lowestPrice).filter((p): p is number => p !== null);

  return {
    title,
    subject,
    cars: hubCars,
    manufacturers: Array.from(
      new Set(allVariants.map((v: any) => v.manufacturers?.name).filter(Boolean))
    ).sort(),
    scales: Array.from(new Set(allVariants.map((v: any) => v.scale).filter(Boolean))).sort(),
    years: Array.from(new Set(hubCars.map(c => c.year))).sort(),
    lowestPrice: prices.length ? Math.min(...prices) : null,
  };
}

export async function getDriverHub(slug: string): Promise<HubData | null> {
  const { cars } = await loadCatalogue();
  const match = cars.find((c: any) => slugify((c.driver as any)?.name || '') === slug);
  const name = (match?.driver as any)?.name as string | undefined;
  if (!name) return null;
  return buildHub(c => c.driver?.name === name, name, `${name} F1 diecast models`);
}

export async function getTeamHub(slug: string): Promise<HubData | null> {
  const { cars } = await loadCatalogue();
  const match = cars.find((c: any) => teamSlug((c.team as any)?.name) === slug);
  const name = (match?.team as any)?.name as string | undefined;
  if (!name) return null;
  return buildHub(c => teamSlug(c.team?.name) === slug, name, `${name} F1 diecast models`);
}

export async function getSeasonHub(year: string): Promise<HubData | null> {
  const y = parseInt(year, 10);
  if (isNaN(y)) return null;
  return buildHub(c => c.season?.year === y, `${y}`, `${y} F1 season diecast models`);
}

/** Subjects with enough buyable cars to deserve a page — used for prerendering and the sitemap. */
export async function getHubSlugs(): Promise<{ drivers: string[]; teams: string[]; seasons: string[] }> {
  const { cars, modelsByCar, sellable } = await loadCatalogue();
  const buyable = cars.filter((c: any) => (modelsByCar.get(c.id) || []).some(m => sellable.has(m.id)));

  const count = (key: (c: any) => string | undefined) => {
    const tally: Record<string, number> = {};
    buyable.forEach((c: any) => {
      const k = key(c);
      if (k) tally[k] = (tally[k] || 0) + 1;
    });
    return Object.entries(tally)
      .filter(([, n]) => n >= MIN_CARS_FOR_HUB)
      .map(([k]) => k);
  };

  return {
    drivers: count((c: any) => (c.driver?.name ? slugify(c.driver.name) : undefined)),
    teams: count((c: any) => (c.team?.name ? teamSlug(c.team.name) : undefined)),
    seasons: count((c: any) => (c.season?.year ? String(c.season.year) : undefined)),
  };
}
