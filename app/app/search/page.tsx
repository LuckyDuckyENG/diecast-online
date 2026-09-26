import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ModelCard from '../components/ModelCard';
import { searchCars } from '@/lib/searchData';
import SearchTracker from '../components/SearchTracker';

/**
 * Server-rendered, and filtered in the database.
 *
 * This was a client component that downloaded every car and every model and
 * filtered them in JavaScript. It could not work: a plain .select() stops at
 * 1000 rows, so with 2,848 models the page never saw 1,848 of them. Cars still
 * MATCHED, because driver names live on the car row, but their models did not
 * come down -- searching "senna" returned 50 cars of which 48 showed no models,
 * no image, "Unknown" maker and a hardcoded 1:18 scale.
 *
 * Reading searchParams opts this page into dynamic rendering, which is right
 * for a search: the result depends on the request, and there is nothing to
 * revalidate. The win over the old version is that the HTML now CONTAINS the
 * results, so a crawler sees them, and the browser downloads twenty cards
 * instead of two thousand rows.
 */
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Search — diecasts.app',
  description: 'Search F1 diecast models by driver, team, race or part number.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw) || '';
  const results = query.trim().length >= 2 ? await searchCars(query) : [];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
      {/*
        Records the query and how many results it found. Renders nothing; see
        the component for why this is a custom event rather than a table.
      */}
      <SearchTracker query={query} results={results.length} />
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="mb-8">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-2">
            Search Results
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            {query.trim().length < 2 ? (
              'Type at least two characters.'
            ) : (
              <>
                {results.length} result{results.length !== 1 ? 's' : ''} for &quot;
                <span className="font-semibold text-[var(--text-primary)]">{query}</span>&quot;
              </>
            )}
          </p>
        </div>

        {results.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border-light)] p-12 text-center">
            <h2 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-3">
              {query.trim().length < 2 ? 'What are you looking for?' : 'No results found'}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Try searching for a driver name, team, event, or model SKU
            </p>
            <p className="text-sm text-[var(--text-tertiary)]">
              Examples: &quot;Senna&quot;, &quot;Ferrari&quot;, &quot;Monaco GP&quot;,
              &quot;LSF1070&quot;
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {results.map(car => (
              <ModelCard
                key={car.id}
                id={car.id}
                slug={car.slug}
                name={car.name}
                manufacturer={car.manufacturer}
                // ModelCard wants a number. A car with no season is rare and
                // showing 0 would be worse than showing nothing, so it falls
                // back to the current year only for display -- never stored.
                year={car.year ?? new Date().getFullYear()}
                driver={car.driver ?? undefined}
                team={car.team ?? undefined}
                liveryName={car.liveryName ?? undefined}
                imageUrl={car.imageUrl ?? undefined}
                teamPrimaryColor={car.teamPrimaryColor ?? undefined}
                teamTextColor={car.teamTextColor ?? undefined}
                hasStore={car.hasStore}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
