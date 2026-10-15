'use client';

import { useEffect, useRef, useState } from 'react';
import { SortOption, Model } from '@/lib/types';
import ModelCard from './ModelCard';

interface BrowseGridProps {
  models: Model[];
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

/**
 * How many cards render before more are appended.
 *
 * 100 is about four screens of grid at desktop widths, so the next batch is
 * fetched long before anyone reaches the end of this one.
 */
const PAGE = 100;

/**
 * Where the observer stops appending on its own and the button becomes a
 * button again.
 *
 * Measured on this build: appending all the way to 2,236 rebuilds exactly the
 * document this change exists to avoid, and traversing it costs 24.9s of
 * blocked thread -- slightly WORSE than the 20.9s it replaced, because the
 * appends add their own 4.1s of React on top. The window defers the cost, it
 * does not abolish it. Nothing can: painting 2,236 cards costs what it costs.
 *
 * What it CAN do is make the growth deliberate. Five batches is about 20
 * screens of grid, past any plausible accidental scroll, and after that the
 * page only gets heavier if someone chooses to make it heavier. The gesture
 * that caused the reported freeze -- dragging the scrollbar across the whole
 * catalogue in one movement -- stops being reachable at all, because the
 * scrollbar now only ever spans what has been rendered.
 */
const AUTO_BATCHES = 5;

/**
 * THE WHOLE CATALOGUE IS LOADED. ONLY A WINDOW OF IT IS RENDERED.
 *
 * This file used to say the opposite -- that every one of the 2,236 cards
 * rendering was affordable, because lazy images and `content-visibility`
 * meant the node count never turned into scroll cost. That was wrong, and it
 * was wrong in a way that reasoning could not catch. Measured in Chrome at 4x
 * CPU throttle on 2026-10-15, one scroll to the bottom of the deployed page:
 *
 *     script (React, filtering)      185 ms
 *     style recalc                   671 ms
 *     layout                       5,354 ms
 *     paint / composite           14,647 ms
 *     ------------------------------------
 *     total blocked               20,857 ms   over 152 long tasks
 *
 * 150 of 152 frames took longer than 100ms. That is the freeze two people
 * reported, and React is 1% of it.
 *
 * Two things that comment got specifically wrong:
 *
 *   IMAGES WERE NOT THE CAUSE. Blocking all 2,204 of them moved the cost from
 *   160ms to 126ms per frame. 79% of it remained with no images at all.
 *
 *   content-visibility DID ITS JOB AND IT WAS NOT ENOUGH. It skips offscreen
 *   paint; it cannot make a 179,000px document cheap to traverse, because the
 *   work arrives as you scroll through it either way. /seasons/2024, same
 *   components, 127 cards: 321ms for the same scroll. 65x cheaper for 17.6x
 *   fewer cards -- the cost grows faster than the card count.
 *
 * WHY A WINDOW RATHER THAN PAGED URLS. The old comment's own suggestion was
 * /browse/page/N, and the reason that is not what happened is filtering: the
 * filters work over the whole catalogue in memory, instantly, and paging the
 * DATA would cut them down to whatever page you were standing on. Paging only
 * the RENDER keeps every filter exactly as it was and still fixes the scroll.
 *
 * WHY IT APPENDS ITSELF. The objection to the old "Show more" was sound --
 * the owner hunts through this page and a click he pays 22 times is friction.
 * So the button is not a gate. An observer trips it as it comes into view and
 * the batch arrives before you reach it; the button exists to say where you
 * are, and to work if the observer never fires.
 *
 * Discovery does not depend on this page: the sitemap lists all 2,236 cars,
 * verified against the live file on 2026-10-15.
 */
export default function BrowseGrid({ models, sortBy, onSortChange }: BrowseGridProps) {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  /**
   * Back to the first batch whenever the result set changes.
   *
   * Without this, filtering down to 40 cars after scrolling to 900 would
   * render all 40 and keep the window open at 900, so the next filter that
   * widened the set would dump 900 cards in at once -- the exact cost this
   * is here to avoid, arriving at the least expected moment.
   *
   * `models` is a useMemo in BrowseClient, so its identity changes when the
   * filters or the sort change and at no other time.
   */
  useEffect(() => { setShown(PAGE); }, [models]);

  const visible = Math.min(shown, models.length);
  const remaining = models.length - visible;

  /**
   * Appends the next batch as the button approaches the viewport.
   *
   * rootMargin buys roughly a screen and a half of warning, so the cards are
   * in place before the end of the current batch is reached and the scroll
   * never actually stops.
   *
   * Re-created on every append because the observer is watching a node whose
   * position has just moved. Disconnecting first is what stops a backlog of
   * observers all firing on the same element.
   */
  const autoAppends = shown < PAGE * (AUTO_BATCHES + 1);

  useEffect(() => {
    if (remaining <= 0 || !autoAppends) return;
    const node = sentinel.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setShown((s) => s + PAGE); },
      { rootMargin: '1200px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [remaining, autoAppends]);

  return (
    <div className="flex-1">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 sm:mb-6">
        <div>
          {/*
            Both numbers, because they are different questions. The total is
            how big the answer to your filters is; the first is how much of it
            is on the page right now. Showing only the rendered count would
            read as "your filter matched 100", which is wrong and would make
            the filters look broken.
          */}
          <p className="text-[var(--text-primary)] font-semibold">
            {remaining > 0
              ? `Showing ${visible} of ${models.length.toLocaleString()} models`
              : `Showing ${models.length} model${models.length !== 1 ? 's' : ''}`}
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
            {models.slice(0, visible).map((model, i) => (
              /* The first row loads eagerly so the largest visible image is
                 not deferred; every other card waits until it is scrolled
                 to. */
              <ModelCard key={model.id} {...model} imagePriority={i < 4} />
            ))}
          </div>

          {remaining > 0 && (
            /*
              A real button, not a bare sentinel div.

              The observer above normally trips it before anyone gets here,
              so most visitors never press it. It is a button anyway for the
              cases where the observer does not fire -- it is the only way
              back to the rest of the catalogue if it fails, and an invisible
              div would leave the page silently truncated at 100 with nothing
              on screen admitting it.
            */
            <div ref={sentinel} className="pt-8 text-center">
              <button
                type="button"
                onClick={() => setShown((s) => s + PAGE)}
                className="rounded-xl border border-[var(--border-medium)] bg-white px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                Show {Math.min(PAGE, remaining)} more
              </button>
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                {autoAppends
                  ? `${remaining.toLocaleString()} more to go`
                  : `${remaining.toLocaleString()} more. Filtering is quicker than scrolling from here.`}
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
