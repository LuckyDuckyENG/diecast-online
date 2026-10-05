'use client';

import { SortOption, Model } from '@/lib/types';
import ModelCard from './ModelCard';

interface BrowseGridProps {
  models: Model[];
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

/**
 * EVERY card renders. There is no Show more.
 *
 * It had three lives here: all 1,267 at once (3.5MB, and 1,366 images loaded
 * eagerly), then 48 with a fixed step, then 150 with a doubling step. The
 * third was measurably better than the second -- 29 clicks to the end became
 * 3 -- and it was still the wrong shape, because the owner uses this page to
 * hunt for underpriced models and ANY click between him and the catalogue is
 * friction he has to pay repeatedly.
 *
 * What makes it affordable now is the lazy loading added alongside the 150
 * change. The original fault was never really the HTML: it was 1,366 image
 * requests firing at once for cards nobody had scrolled to. With the first
 * row eager and the rest deferred, the browser fetches what is on screen.
 *
 *     1.22 MB   data for all 1,550 cars, paid either way (client filtering)
 *     1.4 KB    per card of markup
 *     => ~3.2 MB of HTML, against 1.44 MB at 150 cards
 *
 * So the honest cost is about +1.8MB of markup and a ~14,000-node DOM. That
 * is paid once at load rather than per interaction, and `content-visibility`
 * on the cards (see ModelCard) stops the node count turning into scroll cost:
 * the browser skips layout and paint for cards that are off screen, which is
 * most of them.
 *
 * If this ever needs reversing, the thing to reach for is NOT Show more again
 * -- it is statically generated /browse/page/N, 27 prerendered pages with no
 * dynamic reads. Discovery does not depend on this page either way: measured
 * 2026-10-06, the hubs already link all 1,419 crawlable cars and the sitemap
 * lists exactly the same set.
 */

export default function BrowseGrid({ models, sortBy, onSortChange }: BrowseGridProps) {


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
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {models.map((model, i) => (
            /* The first row loads eagerly so the largest visible image is not
               deferred; every other card waits until it is scrolled to. With
               the whole catalogue rendered that is the difference between 4
               image requests on load and 1,419. */
            <ModelCard key={model.id} {...model} imagePriority={i < 4} />
          ))}
        </div>
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
