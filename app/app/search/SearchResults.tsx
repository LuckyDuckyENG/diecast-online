import ModelCard from '../components/ModelCard';
import SearchTracker from '../components/SearchTracker';
import { searchCars } from '@/lib/searchData';

/**
 * How many placeholder cards the skeleton draws.
 *
 * Eight is two rows at the widest grid and four at the narrowest, so the
 * fallback is always clearly a grid of results arriving rather than one lonely
 * box. It does not try to predict the real count: guessing 40 and delivering 3
 * is a worse lie than not guessing.
 */
const SKELETON_CARDS = 8;

/**
 * What the page shows for the three seconds the search takes.
 *
 * THE QUERY IS ECHOED HERE, not only in the finished results, and that is the
 * point of having a fallback at all. Before this, the whole page waited --
 * navbar, heading and all -- so a search looked like nothing had happened.
 * The owner's own reaction to it was "I did not know it loaded".
 *
 * Card-shaped rather than a bare spinner so the layout does not jump when the
 * real results replace it, and so the shape of the answer is visible before
 * the answer is.
 */
export function SearchSkeleton({ query }: { query: string }) {
  return (
    <>
      <div className="mb-8">
        <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-2">
          Search Results
        </h1>
        <p className="flex items-center gap-2 text-lg text-[var(--text-secondary)]">
          {/*
            animate-spin is a Tailwind built-in, so this costs no CSS. The
            border trick makes a ring with one coloured quarter: cheaper than
            an SVG and it inherits the accent colour.
          */}
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-medium)] border-t-[var(--accent)]"
            aria-hidden="true"
          />
          Searching for &quot;
          <span className="font-semibold text-[var(--text-primary)]">{query}</span>&quot;
        </p>
      </div>

      {/*
        aria-busy and the status role, so this is announced rather than being a
        silent grid of grey boxes to anyone using a screen reader.
      */}
      <div
        role="status"
        aria-busy="true"
        aria-label={`Searching for ${query}`}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
      >
        {Array.from({ length: SKELETON_CARDS }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse overflow-hidden rounded-[14px] border border-[var(--border-light)] bg-white"
          >
            {/* Same aspect ratio as ModelCard's image, so nothing shifts. */}
            <div className="aspect-[4/3] bg-[#efeee9]" />
            <div className="p-4">
              <div className="mb-2 h-3 w-16 rounded bg-[#efeee9]" />
              <div className="mb-2 h-4 w-full rounded bg-[#efeee9]" />
              <div className="h-4 w-2/3 rounded bg-[#efeee9]" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The results, awaited here rather than in the page.
 *
 * This component exists ONLY so the await happens inside a Suspense boundary.
 * When the page itself awaited searchCars, React had nothing it could render
 * until the query finished, so the three seconds were spent on the previous
 * screen with no indication anything was happening. Moving the await one
 * level down lets the shell and the search box stream immediately and the
 * results fill in behind the skeleton above.
 */
export default async function SearchResults({ query }: { query: string }) {
  const results = await searchCars(query);

  return (
    <>
      {/*
        Records the query and how many results it found. Renders nothing; see
        the component for why this is a custom event rather than a table.

        It lives in here rather than in the page because it reports the COUNT,
        which does not exist until the search has run.
      */}
      <SearchTracker query={query} results={results.length} />

      <div className="mb-8">
        <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-2">
          Search Results
        </h1>
        <p className="text-lg text-[var(--text-secondary)]">
          {results.length} result{results.length !== 1 ? 's' : ''} for &quot;
          <span className="font-semibold text-[var(--text-primary)]">{query}</span>&quot;
        </p>
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-xl border border-[var(--border-light)] p-12 text-center">
          <h2 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-3">
            No results found
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
          {results.map((car, i) => (
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
              imageFromEbay={car.imageFromEbay}
              imagePriority={i < 4}
              teamPrimaryColor={car.teamPrimaryColor ?? undefined}
              teamTextColor={car.teamTextColor ?? undefined}
              hasStore={car.hasStore}
            />
          ))}
        </div>
      )}
    </>
  );
}
