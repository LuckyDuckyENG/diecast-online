import { Suspense } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SearchResults, { SearchSkeleton } from './SearchResults';

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
 *
 * THE SEARCH IS AWAITED IN A CHILD, NOT HERE, and that is deliberate.
 *
 * It used to be awaited in this function, which meant React could render
 * nothing at all -- not the navbar, not the search box, not the heading --
 * until the query came back. A search takes about three seconds, and all three
 * were spent looking at the previous screen with no sign anything had
 * happened. The owner's own first reaction to it was "I did not know it
 * loaded".
 *
 * Moving the await into SearchResults puts it inside a Suspense boundary, so
 * the shell streams immediately and the results fill in behind a skeleton.
 * Nothing about the query itself got faster; the page simply stopped lying
 * about whether it was working.
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
  const tooShort = query.trim().length < 2;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {tooShort ? (
          /*
            Nothing to search for, so nothing to wait for. Rendered inline
            rather than through the boundary, because a skeleton promising
            results that are never coming is worse than no skeleton.
          */
          <>
            <div className="mb-8">
              <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-2">
                Search Results
              </h1>
              <p className="text-lg text-[var(--text-secondary)]">
                Type at least two characters.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-[var(--border-light)] p-12 text-center">
              <h2 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-3">
                What are you looking for?
              </h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Try searching for a driver name, team, event, or model SKU
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Examples: &quot;Senna&quot;, &quot;Ferrari&quot;, &quot;Monaco GP&quot;,
                &quot;LSF1070&quot;
              </p>
            </div>
          </>
        ) : (
          /*
            KEYED ON THE QUERY, which is what makes a SECOND search show the
            skeleton too.

            Without the key, React treats a new query as the same boundary in
            the same position and keeps the resolved children on screen while
            the next search runs -- so searching again from the results page
            would sit on the old results for three seconds, which is the exact
            confusion this is meant to remove. A new key is a new boundary, and
            a new boundary falls back.
          */
          <Suspense key={query} fallback={<SearchSkeleton query={query} />}>
            <SearchResults query={query} />
          </Suspense>
        )}
      </main>

      <Footer />
    </div>
  );
}
