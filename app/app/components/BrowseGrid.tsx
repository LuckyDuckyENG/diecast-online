'use client';

import { useEffect, useState } from 'react';
import { SortOption, Model } from '@/lib/types';
import ModelCard from './ModelCard';

interface BrowseGridProps {
  models: Model[];
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

/**
 * How many cards to render before "Show more".
 *
 * The page used to render all 1,267 at once: 3.5MB of HTML, 1,366 <img>
 * elements, and at grid-cols-2 roughly 634 rows to scroll on a phone.
 *
 * Baymard's product-list research puts the default at 50-150 on desktop and
 * 15-30 on mobile, the mobile figure being lower precisely because a phone
 * shows two to four items per screen — which is this grid exactly. 48 is one
 * number for both: four full rows on desktop, 24 on a phone, and a round
 * multiple of 2, 3 and 4 so no row is left ragged at any breakpoint.
 *
 * Load More rather than pagination or infinite scroll, also from that
 * research: subjects called pagination slow, and infinite scroll breaks
 * returning to your place — which is the common journey here, where people
 * open several cars from one list. It would also make the footer unreachable,
 * and the footer is the only mobile route to /savings.
 */
const PAGE = 48;

export default function BrowseGrid({ models, sortBy, onSortChange }: BrowseGridProps) {
  const [shown, setShown] = useState(PAGE);

  /**
   * Back to the first page whenever the list itself changes.
   *
   * Without this, filtering down to 12 results while 240 are "shown" leaves
   * the count stuck high, and the next Show more jumps by a page that is no
   * longer there. Keyed on length and sort rather than the array identity,
   * which is rebuilt on every render by the parent's useMemo.
   */
  useEffect(() => {
    setShown(PAGE);
  }, [models.length, sortBy]);

  const visible = models.slice(0, shown);
  const remaining = models.length - visible.length;

  return (
    <div className="flex-1">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6">
        <div>
          <p className="text-[var(--text-primary)] font-semibold">
            Showing {models.length} model{models.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          <label htmlFor="sort" className="text-sm text-[var(--text-tertiary)] font-medium">
            Sort by:
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-white border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {models.length > 0 ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
            {visible.map((model) => (
              <ModelCard key={model.id} {...model} />
            ))}
          </div>

          {remaining > 0 && (
            <div className="mt-8 flex flex-col items-center gap-2">
              {/*
                A button, not a link.

                Google's guidance is to make Show More a real <a href> to a
                unique URL so the set stays crawlable — but that would mean
                /browse?page=2 existing on the server, and reading searchParams
                there turns this page dynamic. Hourly regeneration of a page
                that reads the whole dataset is what exceeded the Supabase
                egress quota on 2026-09-22, which is why revalidate is 86400.

                Discovery does not depend on this page any more: the sitemap
                carries all 1,267 car URLs, every hub links its own cars, and
                each car page links about 16 others. The cost is internal link
                equity from one hub page, not reachability. If Search Console
                ever shows a crawl problem, the fix is statically generated
                /browse/page/N — 27 prerendered pages, still no dynamic reads.
              */}
              <button
                type="button"
                onClick={() => setShown(s => s + PAGE)}
                className="rounded-lg bg-[var(--accent)] px-6 py-3 font-bold text-white hover:brightness-[0.92] transition-all"
              >
                Show more
              </button>
              <p className="text-sm text-[var(--text-tertiary)]">
                Showing {visible.length} of {models.length}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <h3 className="font-display font-bold text-xl text-[var(--text-primary)] mb-2">
            No models found
          </h3>
          <p className="text-[var(--text-tertiary)]">
            Try adjusting your filters to see more results
          </p>
        </div>
      )}
    </div>
  );
}
