import type { MetadataRoute } from 'next';
import { supabase } from '@/lib/supabase';

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
  const [{ data: cars }, { data: models }, { data: prices }, { data: ebay }] = await Promise.all([
    supabase.from('cars').select('id, slug, created_at').not('slug', 'is', null),
    supabase.from('models').select('id, car_id'),
    supabase.from('price_history').select('model_id'),
    supabase.from('ebay_links').select('model_id'),
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

  const carRoutes: MetadataRoute.Sitemap = (cars || [])
    .filter((car: any) => (modelsByCar.get(car.id) || []).some(id => sellable.has(id)))
    .map((car: any) => ({
      url: `${SITE_URL}/cars/${car.slug}`,
      lastModified: car.created_at ? new Date(car.created_at) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

  console.log(`🗺️ Sitemap: ${staticRoutes.length} static + ${carRoutes.length} car pages`);

  return [...staticRoutes, ...carRoutes];
}
