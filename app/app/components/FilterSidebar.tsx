'use client';

import { useState } from 'react';
import { FilterOptions } from '@/lib/types';

interface FilterSidebarProps {
  /** Derived from the models on the page, so the lists cannot go stale. */
  options: FilterOptionLists;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onClearAll: () => void;
}

/** One choice, with how many cars it would leave. */
export interface FilterOption {
  value: string;
  count: number;
}

export interface FilterOptionLists {
  years: FilterOption[];
  teams: FilterOption[];
  drivers: FilterOption[];
  scales: FilterOption[];
  manufacturers: FilterOption[];
}

/**
 * How many choices each filter shows before "Advanced".
 *
 * The sidebar offered 74 checkboxes at once on desktop, 41 of them drivers.
 * Not a rendering problem — a reading one: every option looked equally worth
 * clicking, and the long lists buried the short ones.
 *
 * Scale and Manufacturer are never truncated. They are 3 and 6 options, and
 * they are the only two filters with no hub page behind them — /drivers,
 * /teams and /seasons already answer the single-value case for the other
 * three, so those lists exist here mainly for combinations like
 * "Verstappen in 1:18".
 *
 * Years are cut to the newest four rather than the biggest four.
 */
const SHORT_LIST: Partial<Record<keyof FilterOptionLists, number>> = {
  years: 4,
  teams: 6,
  drivers: 8,
};

/**
 * Scale and Manufacturer lead, which is a change from Year/Team/Driver first.
 *
 * /drivers, /teams and /seasons already answer "show me everything for this
 * one value" — 35 of the 41 drivers offered here have their own page. Scale
 * and Manufacturer have no hub at all, so they are the questions only this
 * sidebar can answer, and they are also the two short enough to show whole.
 */
const SECTIONS: { key: keyof FilterOptionLists; title: string }[] = [
  { key: 'scales', title: 'Scale' },
  { key: 'manufacturers', title: 'Manufacturer' },
  { key: 'years', title: 'Year' },
  { key: 'teams', title: 'Team' },
  { key: 'drivers', title: 'Driver' },
];


interface FilterSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function FilterSection({ title, defaultOpen = true, children }: FilterSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border-light)] pb-5 mb-5">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-3 text-left"
      >
        <h3 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)]">
          {title}
        </h3>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-tertiary)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {isOpen && <div className="space-y-2">{children}</div>}
    </div>
  );
}

export default function FilterSidebar({ options, filters, onFilterChange, onClearAll }: FilterSidebarProps) {
  /**
   * Deliberately not remembered between visits.
   *
   * It is a browsing aid, not a preference. Persisting it would quietly
   * rebuild the 74-checkbox wall for exactly the people who have been here
   * before and are most likely to be scanning rather than reading.
   */
  const [advanced, setAdvanced] = useState(false);

  /**
   * What to render for one filter: the short list, plus anything ticked.
   *
   * A ticked value ALWAYS shows even when it falls outside the short list or
   * has dropped to zero, otherwise it cannot be unticked and the only way out
   * is Clear all. Zero-count values are otherwise dropped — offering a choice
   * that leads to an empty grid is the defect this replaced.
   */
  const visible = (key: keyof FilterOptionLists, selected: string[]) => {
    const all = options[key];
    const live = all.filter(o => o.count > 0 || selected.includes(o.value));
    const limit = SHORT_LIST[key];
    if (advanced || limit === undefined || live.length <= limit) {
      return { shown: live, hidden: 0 };
    }
    const head = live.slice(0, limit);
    const ticked = live.slice(limit).filter(o => selected.includes(o.value));
    return { shown: [...head, ...ticked], hidden: live.length - head.length - ticked.length };
  };

  const toggleArrayFilter = (key: keyof FilterOptions, value: string) => {
    const currentValues = filters[key] as string[];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];

    onFilterChange({ ...filters, [key]: newValues });
  };

  const hasActiveFilters =
    filters.years.length > 0 ||
    filters.teams.length > 0 ||
    filters.drivers.length > 0 ||
    filters.scales.length > 0 ||
    filters.manufacturers.length > 0;

  /**
   * Collapsed by default on small screens.
   *
   * Stacking the sidebar above the grid is necessary — at a fixed 250px beside
   * a flex row it left about 30px for the cars on a phone — but stacking alone
   * would mean scrolling past thirty checkboxes before seeing a single model.
   * On lg and up the class list forces it open, so desktop is unchanged.
   */
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <aside className="w-full lg:w-[250px] lg:flex-none">
      {/*
        The panel scrolls inside itself rather than with the page.

        It was sticky but unbounded, so as soon as the filters were taller than
        the viewport the only way to reach Driver — the last and longest
        section — was to scroll the whole page, which scrolls the car grid away
        at the same time. You had to leave the results to change what filters
        them.

        max-height ties it to the viewport below the 88px header, and
        overscroll-contain stops a flick at the end of the list continuing into
        the page behind it. Both are lg-only: on mobile the whole panel already
        collapses behind the Filters button and is not sticky at all.
      */}
      {/*
        ON MOBILE, OPEN MEANS OVER THE PAGE, NOT ABOVE IT.
        Reported on r/Diecast 2026-10-14: "When I click filters in my web
        browser (pretty powerful Android phone) webpage gets stuck".

        It expanded in normal flow, so opening it pushed the ENTIRE GRID down.
        /browse renders the whole catalogue: measured the same day, 5.3 MB of
        HTML, 11,664 divs and 2,236 images. Reflowing that on a phone is what
        "stuck" was. content-visibility makes SCROLLING cheap; it does not make
        a full-document reflow cheap, because every one of those boxes still
        has to be repositioned.

        Fixed and inset-0 means opening paints over the grid and moves nothing.
        Scrolls inside itself, so a flick in the list cannot reach the page
        behind. Every one of these is a mobile-only class and lg: resets each,
        so the desktop sidebar is byte-for-byte what it was.

        This does NOT fix the page being 5.3 MB. That is /browse/page/N, which
        the note in BrowseGrid.tsx already specifies.
      */}
      <div className={`lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:overscroll-contain bg-white border border-[var(--border-light)] rounded-xl p-5 ${mobileOpen ? "fixed inset-0 z-50 overflow-y-auto overscroll-contain rounded-none border-0 pb-24 lg:static lg:inset-auto lg:z-auto lg:rounded-xl lg:border lg:pb-5" : "py-3 lg:py-5"}`}>
        {/* Header */}
        {/*
          Pinned to the top of the scrolling panel, so "Clear all" does not
          scroll away — it is the one control you want most once you are deep
          enough in the list to have lost track of what is ticked.

          The negative top margin cancels the panel's own padding so the header
          sits flush against the edge when pinned; pt-5 puts the same space back
          inside it, and the white background stops rows showing through.
        */}
        {/*
          Sticky on mobile too once the panel is a full-screen sheet, or
          "Clear all" and the way out scroll off the top the moment you reach
          Driver, which is the longest section. Same reasoning the lg: version
          already carried, now that mobile has the same problem.
        */}
        <div className={`flex items-center justify-between lg:sticky lg:top-0 lg:z-10 lg:bg-white lg:-mt-5 lg:pt-5 lg:mb-5 lg:pb-5 lg:border-b border-[var(--border-light)] ${mobileOpen ? "sticky top-0 z-10 bg-white -mt-5 pt-5 mb-5 pb-5 border-b" : ""}`}>
          <button
            type="button"
            onClick={() => setMobileOpen(o => !o)}
            className="flex items-center gap-2 lg:cursor-default"
            aria-expanded={mobileOpen}
          >
            <h2 className="font-display font-bold text-base text-[var(--text-primary)]">Filters</h2>
            <span className={`lg:hidden transition-transform ${mobileOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {/*
            A full-screen sheet needs a way out that is not the chevron. The
            chevron reads as "collapse" when the panel is in flow and as
            nothing at all when it covers the page, so this is mobile-only and
            only while open.
          */}
          {mobileOpen && (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="lg:hidden text-[var(--accent)] text-sm font-semibold px-3 py-1.5 -mr-2"
            >
              Done
            </button>
          )}
          {hasActiveFilters && (
            <button
              onClick={onClearAll}
              className="text-[var(--accent)] text-sm font-semibold hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        <div className={`${mobileOpen ? 'block' : 'hidden'} lg:block`}>
        {SECTIONS.map(({ key, title }) => {
          const selected = filters[key] as string[];
          const { shown, hidden } = visible(key, selected);
          if (!shown.length) return null;
          return (
            <FilterSection key={key} title={title}>
              {shown.map(opt => (
                <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggleArrayFilter(key, opt.value)}
                    className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer shrink-0"
                  />
                  <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors flex-1 min-w-0 truncate">
                    {opt.value}
                  </span>
                  {/*
                    The count is what makes a shortened list honest: it says
                    which choices are worth making, and it is the difference
                    between "Verstappen" and "Kubica" being offered as equals.
                  */}
                  <span className="text-xs text-[var(--text-tertiary)] tabular-nums shrink-0">
                    {opt.count}
                  </span>
                </label>
              ))}
              {hidden > 0 && (
                <p className="text-xs text-[var(--text-tertiary)] pt-1">
                  +{hidden} more in advanced
                </p>
              )}
            </FilterSection>
          );
        })}

        <button
          type="button"
          onClick={() => setAdvanced(a => !a)}
          className="w-full text-sm font-semibold text-[var(--accent)] hover:underline text-left"
          aria-expanded={advanced}
        >
          {advanced ? '← Fewer filters' : 'Advanced filters →'}
        </button>
        </div>
      </div>
    </aside>
  );
}
