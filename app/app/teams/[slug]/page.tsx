import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import HubPage from '../../components/HubPage';
import { getTeamHub, getHubSlugsForBuild } from '@/lib/hubData';
import { hubSummary } from '@/lib/hubSummary';

// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { teams } = await getHubSlugsForBuild();
  return teams.map(slug => ({ slug }));
}

const summarise = hubSummary;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const hub = await getTeamHub(slug);
  if (!hub) return { title: 'Team not found' };

  const description = summarise(hub);
  return {
    title: `${hub.subject} model cars and diecast — compare prices`,
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
