import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';
import { getHubSlugs } from '@/lib/hubData';
import { selectAll } from '@/lib/selectAll';

/**
 * Sitemap, generated from the database so it can't drift.
 *
 * Internal links from car pages give crawlers a path between pages; this tells
 * them the pages exist at all. Both matter — /browse is client-rendered, so
 * without either there was no route to any car page.
 *
 * Regenerated on the same hourly cycle as the car pages.
 */
export const revalidate = 3600;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://diecasts.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/browse`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/retailers`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/about`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  // Only cars a visitor can actually do something with. A page listing no
  // retailer is a dead end, and submitting thin pages en masse is exactly what
  // search engines treat as low-quality aggregation.
  /**
   * ALL FOUR are paged.
   *
   * `prices` and `ebay` were paged and `cars` and `models` were not, because
   * models was under 1000 rows when this was written. It passed that line on
   * 2026-08-29 at 1,788, and PostgREST truncates a plain .select() silently —
   * so `modelsByCar` was missing 788 models, every car whose models all sat in
   * that tail failed the sellable test, and the sitemap advertised 505 car
   * pages instead of 729.
   *
   * Search Console then reported 545 known pages against 786 cars, which read
   * as Google being slow to discover them. It was not. We had not told it.
   *
   * Same defect as browseData, hubData, relatedCars, get-f1-data and
   * batch-ebay-search. It keeps recurring because a half-fix looks finished:
   * page the tables that are too big TODAY and it breaks when the next one
   * grows.
   */
  const [cars, models, prices, ebay] = await Promise.all([
    selectAll<any>(supabase, 'cars', 'id, slug, created_at', q => q.not('slug', 'is', null)),
    selectAll<any>(supabase, 'models', 'id, car_id'),
    selectAll<any>(supabase, 'price_history', 'model_id, last_checked_at, recorded_at'),
    selectAll<any>(supabase, 'ebay_links', 'model_id, last_checked_at'),
  ]);

  const sellable = new Set<string>([
    ...(prices || []).map((p: any) => p.model_id),
    ...(ebay || []).map((e: any) => e.model_id),
  ]);

  const modelsByCar = new Map<string, string[]>();
  (models || []).forEach((m: any) => {
    if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
    modelsByCar.get(m.car_id)!.push(m.id);
  });

  /**
   * lastModified tracks the newest PRICE CHECK, not when the car row was created.
   *
   * The content of a car page is its prices. Using created_at meant a car whose
   * prices were re-verified yesterday still advertised a lastmod from months
   * ago, so a crawler had no reason to come back and look — on the one type of
   * page whose whole value is being current.
   *
   * Falls back to created_at where nothing has been checked, which is honest
   * rather than claiming freshness we cannot support.
   */
  const checkedByModel = new Map<string, number>();
  const note = (id: string, when?: string | null) => {
    if (!when) return;
    const t = new Date(when).getTime();
    if (Number.isFinite(t) && t > (checkedByModel.get(id) ?? 0)) checkedByModel.set(id, t);
  };
  for (const p of prices) note(p.model_id, p.last_checked_at || p.recorded_at);
  for (const e of ebay) note(e.model_id, e.last_checked_at);

  const carRoutes: MetadataRoute.Sitemap = (cars || [])
    .filter((car: any) => (modelsByCar.get(car.id) || []).some(id => sellable.has(id)))
    .map((car: any) => {
      const newest = (modelsByCar.get(car.id) || [])
        .reduce((a, id) => Math.max(a, checkedByModel.get(id) ?? 0), 0);
      return {
        url: `${SITE_URL}/cars/${car.slug}`,
        lastModified: newest
          ? new Date(newest)
          : car.created_at
            ? new Date(car.created_at)
            : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      };
    });

  // Hub pages. getHubSlugs already applies the minimum-cars threshold, so only
  // hubs substantial enough to be worth landing on are submitted.
  const { drivers, teams, seasons } = await getHubSlugs();

  const hubRoutes: MetadataRoute.Sitemap = [
    ...seasons.map(year => ({
      url: `${SITE_URL}/seasons/${year}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...teams.map(slug => ({
      url: `${SITE_URL}/teams/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...drivers.map(slug => ({
      url: `${SITE_URL}/drivers/${slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];

  console.log(
    `🗺️ Sitemap: ${staticRoutes.length} static + ${hubRoutes.length} hubs + ${carRoutes.length} car pages`
  );

  return [...staticRoutes, ...hubRoutes, ...carRoutes];
}
