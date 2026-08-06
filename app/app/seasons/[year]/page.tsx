import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HubPage from '../../components/HubPage';
import { getSeasonHub, getHubSlugs } from '@/lib/hubData';

export const revalidate = 3600;

type Props = { params: Promise<{ year: string }> };

export async function generateStaticParams() {
  const { seasons } = await getHubSlugs();
  return seasons.map(year => ({ year }));
}

function summarise(hub: NonNullable<Awaited<ReturnType<typeof getSeasonHub>>>) {
  const teams = Array.from(new Set(hub.cars.map(c => c.team).filter(Boolean))).length;
  const drivers = Array.from(new Set(hub.cars.map(c => c.driver).filter(Boolean))).length;
  const price = hub.lowestPrice !== null ? ` From AUD $${hub.lowestPrice.toFixed(2)}.` : '';
  return (
    `Scale models from the ${hub.subject} Formula 1 season — ${hub.cars.length} cars across ` +
    `${teams} teams and ${drivers} drivers, made by ${hub.manufacturers.join(', ')} ` +
    `in ${hub.scales.join(' and ')}. Compare prices across every retailer that stocks them.${price}`
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const hub = await getSeasonHub(year);
  if (!hub) return { title: 'Season not found' };

  const description = summarise(hub);
  return {
    title: `${hub.subject} F1 diecast models — compare prices`,
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
