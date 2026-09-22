import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CarDetail from './CarDetail';
import { getCarPageData, getAllCarSlugs, carTitle } from '@/lib/carPageData';
import { carPageJsonLd, jsonLdScript } from '@/lib/structuredData';
import { getPriceHistory } from '@/lib/priceHistory';
import { supabase } from '@/lib/supabase';
import { getRelatedCars } from '@/lib/relatedCars';
import { getHubSlugs } from '@/lib/hubData';
import { slugify, teamSlug } from '@/lib/carSlug';

/**
 * Car detail page — server rendered.
 *
 * This was a client component fetching in useEffect, which meant the HTML a
 * crawler received contained none of the page's own content and every car
 * shared one <title> (a client component cannot export generateMetadata).
 *
 * Prices change, so pages revalidate hourly rather than being frozen at build.
 */
// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

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

  /**
   * Price history, keyed by model id.
   *
   * A plain object rather than the Map getPriceHistory returns: CarDetail is a
   * client component and a Map does not survive serialisation across that
   * boundary.
   */
  const historyMap = await getPriceHistory(supabase, data.variants.map(v => v.id));
  const history = Object.fromEntries(historyMap);

  // Only link up to hubs that actually exist — getHubSlugs applies the
  // minimum-cars threshold, so a driver with two models has no page to link to.
  const hubs = await getHubSlugs();
  const driverSlug = slugify(data.car.driver?.name || '');
  const tSlug = teamSlug(data.car.team?.name);
  const year = String(data.car.season?.year || '');

  const hubLinks = {
    driver: hubs.drivers.includes(driverSlug) ? `/drivers/${driverSlug}` : null,
    team: hubs.teams.includes(tSlug) ? `/teams/${tSlug}` : null,
    season: hubs.seasons.includes(year) ? `/seasons/${year}` : null,
  };

  /**
   * Structured data, so a search result can say what this costs.
   *
   * Rendered here rather than inside CarDetail because that is a client
   * component: this has to be in the server HTML, which is the only version a
   * crawler reads.
   *
   * Prices in it are gated on the same isQuotable rule as the visible ones, so
   * markup and page cannot disagree — see lib/structuredData.ts.
   */
  const jsonLd = carPageJsonLd(data, data.car.slug || id, carTitle(data.car));

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
        />
      )}
      <CarDetail
        car={data.car}
        variants={data.variants}
        urlParam={id}
        related={related}
        history={history}
        hubLinks={hubLinks}
      />
    </>
  );
}
