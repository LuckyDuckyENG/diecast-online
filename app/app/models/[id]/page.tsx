import { notFound, permanentRedirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * /models/<id> — a permanent redirect to the car that owns the model.
 *
 * This used to be a second, worse detail page. It was a client component, so a
 * crawler received an empty shell and it could not export generateMetadata —
 * the exact defect /cars/[slug] was rewritten to fix. It was absent from the
 * sitemap. Nothing linked into it except a "related models" strip rendered on
 * the page itself, so the only way in was to already be there.
 *
 * And three of its six sections had nothing to show: it passed
 * `priceHistory: []`, `rating: { average: 0, count: 0 }` and `reviews: []`, so
 * it rendered a permanently empty price chart and a reviews block for a feature
 * that does not exist. Its "Where to buy" list marked links
 * `rel="noopener noreferrer"` with no `sponsored`, which for an eBay affiliate
 * link is an undisclosed paid link — the car page is careful about exactly this.
 *
 * A redirect rather than a deletion because model ids are real UUIDs that may
 * sit in someone's history or an old message, and sending those to the car page
 * is strictly better than a 404. Permanent, because this will not come back:
 * everything it attempted, /cars/[slug] already does properly.
 */
export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

export default async function ModelRedirect({ params }: Props) {
  const { id } = await params;

  const { data } = await supabase
    .from('models')
    .select('car:cars(slug, id)')
    .eq('id', id)
    .maybeSingle();

  const car = (data as any)?.car;
  if (!car) notFound();

  // Slug where there is one, id as the fallback — /cars/[id] resolves both.
  permanentRedirect(`/cars/${car.slug || car.id}`);
}
