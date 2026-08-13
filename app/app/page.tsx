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
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Diecasts - The F1 Diecast Price Index',
  description:
    'Compare prices on F1 scale models from Minichamps, Spark, Looksmart and more. ' +
    'Every car, every race, every retailer we can find.',
  alternates: { canonical: '/' },
};

export default async function Home() {
  const { stats, drivers, latestCars } = await getHomeData();
  return <HomeClient stats={stats} drivers={drivers} latestCars={latestCars} />;
}
