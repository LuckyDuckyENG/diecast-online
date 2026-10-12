import type { Metadata } from 'next';
import HomeClient from './HomeClient';
import { getHomeData } from '@/lib/homeData';

/**
 * The home page is server-rendered so its links are in the HTML.
 *
 * It used to be a client component fetching everything in effects, which meant
 * a crawler received 21 internal links — all of them fonts, logos and JS
 * chunks, and not one pointing at a car, driver, team or season. The catalogue
 * was reachable only via the sitemap.
 *
 * Interactivity (search box, scroll reveals) stays in HomeClient; only the data
 * moved. Same split as browse/page.tsx -> BrowseClient.
 */
// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Diecasts - The F1 Diecast Price Index',
  // "Every car, every race" was the same overclaim as the old headline, only
  // hedged at the end by "we can find". The season range is the claim that is
  // actually true and actually unique, so it is the one that belongs in the
  // snippet Google shows. No retailer count: a number in static metadata rots
  // silently, and "dozens" is true at 47.
  description:
    'Compare prices on F1 scale models from Minichamps, Spark, Looksmart and more. ' +
    'Every championship season since 1950, priced across dozens of retailers and eBay.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const { stats, drivers, latestCars } = await getHomeData();
  return <HomeClient stats={stats} drivers={drivers} latestCars={latestCars} />;
}
