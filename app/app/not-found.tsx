import Link from 'next/link';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { getHubSlugsForBuild } from '@/lib/hubData';
import { slugify } from '@/lib/carSlug';

/**
 * What a visitor sees when a URL no longer resolves.
 *
 * There was no not-found page at all, so Next served its built-in default:
 * "404 — This page could not be found" in a system font, black on white, with
 * no navigation and nothing to click. Search Console showed that is what four
 * clicked-through visitors got — /cars/b975b545… and /cars/d43e4377… between
 * them drew 4 clicks from 12 impressions, and BOTH cars had been deleted
 * before the earliest backup, so there is nothing to redirect them to.
 *
 * Those two will fall out of the index eventually. The general case will not:
 * every merge or delete leaves an indexed URL behind, and a car page is the
 * kind of thing people link to. So the fix is not two redirects, it is making
 * the dead end lead somewhere.
 *
 * Deliberately offers the things that actually rank — driver hubs. They draw
 * 79 of the site's impressions against 4 for the home page, so someone who
 * arrived hunting a car is most likely to be served by the driver they were
 * looking for.
 */
export const revalidate = 3600;

export const metadata = {
  title: 'Not found | Diecasts',
  // Nothing here should be indexed in its own right.
  robots: { index: false, follow: true },
};

/** Shown when the hub list cannot be read — recognisable names that have hubs. */
const FALLBACK_DRIVERS = ['Max Verstappen', 'Lewis Hamilton', 'Charles Leclerc', 'Lando Norris'];

export default async function NotFound() {
  /**
   * Build-safe: a Supabase timeout here would otherwise fail the deployment,
   * and a 404 page is the last thing that should be able to do that.
   */
  const hubs = await getHubSlugsForBuild();

  const drivers = (
    hubs.drivers.length
      ? FALLBACK_DRIVERS.filter(n => hubs.drivers.includes(slugify(n)))
      : []
  ).map(n => ({ name: n, slug: slugify(n) }));

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-5 py-16 sm:py-24">
        <p className="text-sm font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
          404
        </p>
        <h1 className="font-display font-black text-3xl sm:text-4xl mt-2 text-[var(--text-primary)]">
          That page isn&rsquo;t here any more
        </h1>
        <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
          Some older car links no longer work — a model may have been merged with
          another listing or removed when a shop stopped carrying it. The car
          itself is often still on the site under a different address.
        </p>

        <form action="/search" method="get" className="mt-8 flex gap-2">
          <input
            type="search"
            name="q"
            placeholder="Search a driver, team or part number…"
            aria-label="Search"
            className="flex-1 min-w-0 rounded-lg border border-[var(--border-medium)] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--accent)] text-white font-semibold px-5 py-3 text-sm whitespace-nowrap"
          >
            Search
          </button>
        </form>

        {drivers.length > 0 && (
          <div className="mt-10">
            <h2 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)]">
              Popular drivers
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {drivers.map(d => (
                <Link
                  key={d.slug}
                  href={`/drivers/${d.slug}`}
                  className="rounded-full border border-[var(--border-light)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  {d.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="mt-10 text-sm text-[var(--text-tertiary)]">
          Or <Link href="/browse" className="text-[var(--accent)] font-semibold hover:underline">browse every car</Link>{' '}
          we track.
        </p>
      </main>
      <Footer />
    </div>
  );
}
