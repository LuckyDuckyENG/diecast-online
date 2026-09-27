import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HubPage from '../../components/HubPage';
import { getSeasonHub, getHubSlugsForBuild } from '@/lib/hubData';

// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

type Props = { params: Promise<{ year: string }> };

export async function generateStaticParams() {
  const { seasons } = await getHubSlugsForBuild();
  return seasons.map(year => ({ year }));
}

function summarise(hub: NonNullable<Awaited<ReturnType<typeof getSeasonHub>>>) {
  const teams = Array.from(new Set(hub.cars.map(c => c.team).filter(Boolean))).length;
  const drivers = Array.from(new Set(hub.cars.map(c => c.driver).filter(Boolean))).length;
  /**
   * Short enough to survive Google's ~155 character cut, with the price early.
   *
   * The previous version ran past 230 characters and ended on the price, so
   * the one fact that makes a price-comparison result worth clicking was the
   * part that got truncated away. Same reason the driver and team hubs were
   * drawing page-one impressions and almost no clicks.
   */
  const bits = [`${hub.cars.length} F1 scale models from the ${hub.subject} season.`];
  if (hub.lowestPrice !== null) bits.push(`From AUD $${hub.lowestPrice.toFixed(2)}.`);
  bits.push(`${teams} teams, ${drivers} drivers, in ${hub.scales.join(' and ')}.`);
  bits.push('Compare every retailer in one place.');
  let out = bits.join(' ');
  while (out.length > 155 && bits.length > 1) {
    bits.splice(bits.length - 2, 1);
    out = bits.join(' ');
  }
  return out;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const hub = await getSeasonHub(year);
  if (!hub) return { title: 'Season not found' };

  const description = summarise(hub);
  return {
    title: `${hub.subject} F1 model cars and diecast — compare prices`,
    description,
    alternates: { canonical: `/seasons/${year}` },
    openGraph: { title: hub.title, description, type: 'website' },
  };
}

export default async function SeasonHub({ params }: Props) {
  const { year } = await params;
  const hub = await getSeasonHub(year);
  if (!hub) notFound();

  return (
    <HubPage
      hub={hub}
      summary={summarise(hub)}
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Browse', href: '/browse' },
        { label: `${hub.subject} season`, href: `/seasons/${year}` },
      ]}
    />
  );
}
