import type { Metadata } from 'next';
import BrowseClient from './BrowseClient';
import { getBrowseCars } from '@/lib/browseData';

/**
 * Browse — server rendered.
 *
 * This is the hub page: it's the only place that links to every car. Fetching
 * client-side meant the HTML had no car names and no links at all, so crawlers
 * had no route into the catalogue and no signal about which pages matter.
 */
// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const cars = await getBrowseCars();

  const years = Array.from(new Set(cars.map(c => c.year))).sort();
  const teams = Array.from(new Set(cars.map(c => c.team).filter(Boolean)));

  const description =
    `Compare prices on ${cars.length} Formula 1 diecast models across ` +
    `${teams.length} teams and ${years.join(', ')}. Spark, Minichamps, Looksmart and more, ` +
    `in 1:18 and 1:43, priced across every retailer that stocks them.`;

  return {
    title: 'Browse F1 diecast models and compare prices',
    description,
    alternates: { canonical: '/browse' },
    openGraph: {
      title: 'Browse F1 diecast models and compare prices',
      description,
      type: 'website',
    },
  };
}

export default async function BrowsePage() {
  const cars = await getBrowseCars();
  return <BrowseClient initialModels={cars} />;
}
