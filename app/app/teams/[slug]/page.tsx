import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HubPage from '../../components/HubPage';
import { getTeamHub, getHubSlugs } from '@/lib/hubData';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { teams } = await getHubSlugs();
  return teams.map(slug => ({ slug }));
}

function summarise(hub: NonNullable<Awaited<ReturnType<typeof getTeamHub>>>) {
  const years = hub.years.join(' and ');
  const makers = hub.manufacturers.join(', ');
  const price = hub.lowestPrice !== null ? ` Prices start at AUD $${hub.lowestPrice.toFixed(2)}.` : '';
  return (
    `Every ${hub.subject} scale model we track — ${hub.cars.length} cars from ${years}, ` +
    `made by ${makers} in ${hub.scales.join(' and ')}. ` +
    `Compare what every retailer charges for each one.${price}`
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = await getTeamHub(slug);
  if (!hub) return { title: 'Team not found' };

  const description = summarise(hub);
  return {
    title: `${hub.subject} diecast models — compare prices`,
    description,
    alternates: { canonical: `/teams/${slug}` },
    openGraph: { title: hub.title, description, type: 'website' },
  };
}

export default async function TeamHub({ params }: Props) {
  const { slug } = await params;
  const hub = await getTeamHub(slug);
  if (!hub) notFound();

  return (
    <HubPage
      hub={hub}
      summary={summarise(hub)}
      breadcrumb={[
        { label: 'Home', href: '/' },
        { label: 'Browse', href: '/browse' },
        { label: hub.subject, href: `/teams/${slug}` },
      ]}
    />
  );
}
