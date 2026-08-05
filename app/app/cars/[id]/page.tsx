import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CarDetail from './CarDetail';
import { getCarPageData, getAllCarSlugs, carTitle } from '@/lib/carPageData';
import { getRelatedCars } from '@/lib/relatedCars';

/**
 * Car detail page — server rendered.
 *
 * This was a client component fetching in useEffect, which meant the HTML a
 * crawler received contained none of the page's own content and every car
 * shared one <title> (a client component cannot export generateMetadata).
 *
 * Prices change, so pages revalidate hourly rather than being frozen at build.
 */
export const revalidate = 3600;

/**
 * Prerender every car at build time. `dynamicParams` defaults to true, so a car
 * created after the build still renders on demand — no rebuild needed to add one.
 */
export async function generateStaticParams() {
  const slugs = await getAllCarSlugs();
  return slugs.map(slug => ({ id: slug }));
}

// params is a Promise in this version of Next
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getCarPageData(id);

  if (!data) {
    return { title: 'Car not found' };
  }

  const { car, variants } = data;
  const title = carTitle(car);

  // Describe what the page uniquely offers: which manufacturers and scales made
  // this car, and what it costs. That's the thing no single retailer can answer.
  const makers = Array.from(
    new Set(variants.map(v => v.manufacturers?.name).filter(Boolean))
  ) as string[];
  const scales = Array.from(new Set(variants.map(v => v.scale).filter(Boolean))) as string[];

  const prices = variants
    .map(v => v.lowestPrice)
    .filter((p): p is number => typeof p === 'number');
  const cheapest = prices.length ? Math.min(...prices) : null;

  const parts = [
    `Compare prices for the ${car.season?.year} ${car.team?.name} ${car.chassis_name} of ${car.driver?.name} at the ${car.event_name}.`,
    makers.length ? `${makers.join(', ')} in ${scales.join(' and ')}.` : null,
    cheapest ? `From AUD $${cheapest.toFixed(2)}.` : null,
  ].filter(Boolean);

  return {
    title: `${title} | Diecast prices`,
    description: parts.join(' ').slice(0, 300),
    alternates: { canonical: car.slug ? `/cars/${car.slug}` : undefined },
    openGraph: {
      title,
      description: parts.join(' ').slice(0, 300),
      type: 'website',
      images: variants.find(v => v.image_url)?.image_url
        ? [{ url: variants.find(v => v.image_url)!.image_url as string }]
        : undefined,
    },
  };
}

export default async function MasterCarPage({ params }: Props) {
  const { id } = await params;
  const data = await getCarPageData(id);

  if (!data) notFound();

  // Fetched here so the links are in the server-rendered HTML — /browse is
  // client-rendered, so without these there are no crawlable links to any car.
  const related = await getRelatedCars(data.car);

  return (
    <CarDetail
      car={data.car}
      variants={data.variants}
      urlParam={id}
      related={related}
    />
  );
}
