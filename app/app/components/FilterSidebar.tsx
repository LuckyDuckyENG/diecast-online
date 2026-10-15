'use client';

import { useEffect, useRef, useState } from 'react';
import { FilterOptions } from '@/lib/types';

interface FilterSidebarProps {
  /**
   * Derived from the models on the page, so the lists cannot go stale.
   * Memoised against the committed filters, which is what desktop shows.
   */
  options: FilterOptionLists;
  /**
   * The same lists for a set of filters nobody has committed to.
   *
   * The sheet's counts have to narrow as you tick, or ticking Ferrari would
   * leave every driver reading its pre-Ferrari number and the facet counts
   * would be wrong in exactly the situation they exist for.
   */
  optionsFor: (filters: FilterOptions) => FilterOptionLists;
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  onClearAll: () => void;
  /**
   * Phone sheet only. Owned by BrowseClient rather than here, because the
   * button that opens it is portalled into the navbar and the two have to
   * agree. Desktop ignores all three.
   */
  open: boolean;
  onClose: () => void;
  /**
   * How many cars a set of filters WOULD leave, without rendering them.
   *
   * The sheet labels its button "Show 412 cars" while the grid behind still
   * shows the old 2,437, so it needs the answer for filters nobody has
   * committed to. BrowseClient owns the predicate, so it answers.
   */
  countFor: (filters: FilterOptions) => number;
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


/**
 * How long the sheet takes to slide, in ms.
 *
 * Named because two places have to agree: the CSS transition, and the timer
 * that unmounts the sheet once it has finished leaving. 280ms is the long end
 * of what still reads as instant and the short end of what reads as
 * deliberate; iOS sheets sit around 300.
 */
const SHEET_MS = 280;

/**
 * The curve. Fast off the mark, long soft landing.
 *
 * This is the iOS sheet easing rather than a stock ease-out, and the
 * difference is the whole feel of it: the sheet should look like it was
 * thrown and caught, not driven. A linear or ease-in-out slide reads as
 * mechanical at this distance.
 */
const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

/** How far down you have to drag before releasing closes it. */
const DISMISS_PX = 110;

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

export default function FilterSidebar({
  options,
  optionsFor,
  filters,
  onFilterChange,
  onClearAll,
  open,
  onClose,
  countFor,
}: FilterSidebarProps) {
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
  const visible = (lists: FilterOptionLists, key: keyof FilterOptionLists, selected: string[]) => {
    const all = lists[key];
    const live = all.filter(o => o.count > 0 || selected.includes(o.value));
    const limit = SHORT_LIST[key];
    if (advanced || limit === undefined || live.length <= limit) {
      return { shown: live, hidden: 0 };
    }
    const head = live.slice(0, limit);
    const ticked = live.slice(limit).filter(o => selected.includes(o.value));
    return { shown: [...head, ...ticked], hidden: live.length - head.length - ticked.length };
  };

  /**
   * WHAT THE PHONE SHEET IS EDITING: a draft, not the live filters.
   *
   * Desktop applies on every tick, which is right there — the grid is beside
   * the checkbox and watching it narrow IS the feedback. On a phone the grid
   * is behind the sheet and mostly covered, so the same tick buys nothing
   * visible and costs a re-render of up to 2,437 cards. Five ticks, five full
   * re-renders, every one of them underneath a panel.
   *
   * So the sheet collects changes and commits once, on Show N. The count on
   * that button is what replaces the live feedback, and it is an array pass
   * rather than a render.
   */
  const [draft, setDraft] = useState<FilterOptions>(filters);

  /**
   * Seeded on open, and re-seeded if the live filters move under it.
   *
   * The second half matters for the back button: popstate rewrites `filters`
   * from the URL, and a draft still holding the old set would quietly undo
   * that the moment anyone pressed Show.
   */
  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  /**
   * TWO FLAGS, NOT ONE, SO THE SHEET CAN ANIMATE ON THE WAY OUT.
   *
   * `open` alone cannot do it: the moment it goes false React unmounts the
   * element, and there is nothing left in the DOM to slide anywhere. An exit
   * animation needs the thing to still exist while it leaves.
   *
   *   mounted  in the DOM at all
   *   shown    slid up into place
   *
   * Opening sets both, a frame apart. Closing drops `shown` first, waits out
   * the slide, then drops `mounted`.
   */
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      /**
       * TWO frames, deliberately.
       *
       * The element has to be painted at translateY(100%) before it is told
       * to go to 0, or the browser never sees a starting value and the sheet
       * is simply there -- no transition at all. One rAF is not reliably
       * enough: it can land in the same frame as the mount, which is the
       * exact race this is avoiding.
       */
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); };
    }

    setShown(false);
    // Matches the transition below. If the two ever disagree, too short
    // truncates the slide and too long leaves an invisible overlay
    // swallowing taps, so they are commented on both sides.
    const t = setTimeout(() => setMounted(false), SHEET_MS);
    return () => clearTimeout(t);
  }, [open]);

  /** Escape closes it, as a dialog should. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /**
   * DRAG TO DISMISS, WRITTEN STRAIGHT TO THE DOM RATHER THAN THROUGH STATE.
   *
   * A pointermove fires every frame. Putting the offset in React state would
   * re-render this component 60 times a second, and this component renders
   * BOTH the sheet and the desktop aside -- which is still in the DOM on a
   * phone, just display:none. That is ~60 elements reconciled per frame to
   * move one box, on the low-end Android where the original freeze was
   * reported.
   *
   * So the drag writes transform directly and React never hears about it.
   * The class-driven transform takes back over the moment the inline one is
   * cleared.
   */
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLButtonElement>(null);
  const dragFrom = useRef<number | null>(null);
  const dragBy = useRef(0);

  const dragStart = (e: React.PointerEvent) => {
    // Let the buttons in the header be buttons.
    if ((e.target as HTMLElement).closest('button')) return;
    dragFrom.current = e.clientY;
    dragBy.current = 0;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const dragMove = (e: React.PointerEvent) => {
    if (dragFrom.current === null) return;
    const raw = e.clientY - dragFrom.current;
    // Upward drags resist rather than lift the sheet off the bottom edge,
    // which would show the page through the gap underneath it.
    dragBy.current = raw > 0 ? raw : raw / 5;
    const sheet = sheetRef.current;
    if (!sheet) return;
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${dragBy.current}px)`;
    // The backdrop's transition has to be killed as well, or it spends the
    // whole drag easing towards an opacity the finger has already left.
    if (backdropRef.current) {
      backdropRef.current.style.transition = 'none';
      backdropRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dragBy.current) / 420));
    }
  };

  const dragEnd = () => {
    if (dragFrom.current === null) return;
    const dismiss = dragBy.current > DISMISS_PX;
    dragFrom.current = null;

    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = '';
      /**
       * Driven to the same place the class would put it, rather than
       * cleared.
       *
       * Clearing it would hand control back mid-gesture and the sheet would
       * animate UP to its resting place while React, a tick later, told it
       * to go down -- a visible stutter at the one moment the thing is
       * meant to feel physical. Setting the identical value means the
       * inline and class transforms agree and it is one movement.
       */
      sheet.style.transform = dismiss ? 'translateY(100%)' : '';
    }
    if (backdropRef.current) {
      backdropRef.current.style.transition = '';
      backdropRef.current.style.opacity = dismiss ? '0' : '';
    }

    if (dismiss) onClose();
  };

  /**
   * Counted only while the sheet is up, so desktop never pays for it.
   *
   * An array pass over models already in memory, once per tick. That is the
   * trade this whole thing is built on: a few milliseconds of counting in
   * place of a re-render of every card on the page.
   */
  const draftCount = open ? countFor(draft) : 0;

  const toggle = (
    current: FilterOptions,
    emit: (next: FilterOptions) => void,
    key: keyof FilterOptions,
    value: string,
  ) => {
    const currentValues = current[key] as string[];
    const newValues = currentValues.includes(value)
      ? currentValues.filter((v) => v !== value)
      : [...currentValues, value];

    emit({ ...current, [key]: newValues });
  };

  const anyActive = (f: FilterOptions) =>
    f.years.length > 0 ||
    f.teams.length > 0 ||
    f.drivers.length > 0 ||
    f.scales.length > 0 ||
    f.manufacturers.length > 0;

  const hasActiveFilters = anyActive(filters);

  /**
   * The checkbox lists, written once and rendered in two places.
   *
   * Desktop and the phone sheet differ only in their frame — where the box
   * sits, how it scrolls, what the header does — and in what they write to:
   * desktop straight through to the grid, the sheet into the draft. The
   * choices themselves are the same choices, so they are built here rather
   * than duplicated into both branches, where the two copies would drift
   * apart on the first edit.
   */
  const sectionsFor = (
    current: FilterOptions,
    emit: (next: FilterOptions) => void,
    lists: FilterOptionLists,
  ) => (
    <>
      {SECTIONS.map(({ key, title }) => {
        const selected = current[key] as string[];
        const { shown, hidden } = visible(lists, key, selected);
        if (!shown.length) return null;
        return (
          <FilterSection key={key} title={title}>
            {shown.map(opt => (
              <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggle(current, emit, key, opt.value)}
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
    </>
  );

  return (
    <>
      {/*
        DESKTOP ONLY, AND THAT IS THE POINT.

        Two attempts put a filter control above the grid on a phone. Opening it
        pushed 2,437 cards down; making the panel `fixed` collapsed the aside
        and snapped them up. Both are a full relayout -- content-visibility
        skips offscreen PAINT, it does not excuse a box from layout -- and both
        hung the browser hard enough for "wait for the page or close it".

        `hidden md:block` means that on a phone there is nothing above the grid
        at all, so nothing can change size and there is nothing to relayout.
        The mobile control lives in the sticky navbar instead, out of this
        document flow entirely. See MobileFilterTrigger.

        THE BREAKPOINT IS md TO MATCH THE NAVBAR, not because 768px is a good
        width for a 250px sidebar. The navbar's search row -- which holds the
        slot the phone button portals into -- is `md:hidden`. Had this stayed
        at `lg`, every width from 768 to 1023 would have had no sidebar AND no
        button: filters unreachable, silently, on exactly the devices nobody
        tests on. The two breakpoints have to be the same one.
      */}
      <aside className="hidden md:block md:w-[250px] md:flex-none">
        {/*
          The panel scrolls inside itself rather than with the page.

          It was sticky but unbounded, so as soon as the filters were taller
          than the viewport the only way to reach Driver -- the last and
          longest section -- was to scroll the whole page, which scrolls the
          car grid away at the same time.
        */}
        <div className="md:sticky md:top-[88px] md:max-h-[calc(100vh-7rem)] md:overflow-y-auto md:overscroll-contain bg-white border border-[var(--border-light)] rounded-xl p-5">
          <div className="flex items-center justify-between sticky top-0 z-10 bg-white -mt-5 pt-5 mb-5 pb-5 border-b border-[var(--border-light)]">
            <h2 className="font-display font-bold text-base text-[var(--text-primary)]">Filters</h2>
            {hasActiveFilters && (
              <button onClick={onClearAll} className="text-[var(--accent)] text-sm font-semibold hover:underline">
                Clear all
              </button>
            )}
          </div>
          <div>
            {/* Straight through to the grid: it is right there, beside it. */}
            {sectionsFor(filters, onFilterChange, options)}
          </div>
        </div>
      </aside>

      {/*
        THE PHONE SHEET. A separate fixed overlay, never part of the grid's
        column, so opening and closing it moves nothing behind it.

        Height-capped rather than full screen, which is what the Klarna
        reference does well: the catalogue stays visible behind it, so you can
        see that something IS there to filter.
      */}
      {mounted && (
        <div className="md:hidden">
          {/*
            TRANSFORM AND OPACITY ONLY, on both of these.

            Not height, not bottom, not max-height. Those are the properties
            that animate by relaying the page out sixty times a second, which
            is the exact cost that froze this page twice already. transform
            and opacity are handled on the compositor: the sheet is painted
            once and then moved, and the 2,437 cards behind it are not
            consulted at any point.
          */}
          <button
            ref={backdropRef}
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            /*
              pointer-events-none while it is not shown, which is not
              cosmetic. The sheet stays mounted for SHEET_MS after closing so
              it can slide out, and for that whole window this is a
              full-screen, invisible, still-clickable button sitting over the
              catalogue. One tap on a car would land on the backdrop instead.
              Worse under prefers-reduced-motion, where it is invisible
              immediately and the window is the full 280ms.
            */
            className={`fixed inset-0 z-40 bg-black/40 transition-opacity ease-out motion-reduce:transition-none ${shown ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            style={{ transitionDuration: `${SHEET_MS}ms` }}
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            /*
              flex-col so the sheet has three parts: a header and a Show
              button that stay put, and a scrolling middle. It scrolled as
              one piece before, which put the apply button below thirty
              checkboxes -- on a deferred sheet, where that button is the
              only way to see the result, it has to be on screen the whole
              time.
            */
            className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-2xl bg-white shadow-[0_-8px_32px_-12px_rgba(26,25,22,0.35)] transition-transform will-change-transform motion-reduce:transition-none ${shown ? 'translate-y-0' : 'translate-y-full'}`}
            style={{ transitionDuration: `${SHEET_MS}ms`, transitionTimingFunction: SHEET_EASE }}
          >
            {/*
              The header is also the drag handle, hence touch-none: without
              it the browser claims the gesture for scrolling or pull-to-
              refresh and the sheet never sees the move at all.
            */}
            <div
              onPointerDown={dragStart}
              onPointerMove={dragMove}
              onPointerUp={dragEnd}
              onPointerCancel={dragEnd}
              className="flex-none touch-none px-5 pb-3 pt-2.5"
            >
              {/*
                The grab pill. It is here because the sheet really can be
                dragged down -- a handle on something that does not move is
                a promise the interface does not keep.
              */}
              <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--border-medium)]" />
              <div className="flex items-center justify-between">
                <h2 className="font-display font-bold text-base text-[var(--text-primary)]">Filters</h2>
                {/*
                  Clears the DRAFT, not the grid. Everything in this sheet is
                  provisional until Show, and a Clear all that reached past it
                  to the live filters would be the one control that did not
                  wait -- the sheet would still show the old ticks while the
                  page behind had already emptied.
                */}
                {anyActive(draft) && (
                  <button
                    onClick={() => setDraft({ years: [], teams: [], drivers: [], scales: [], manufacturers: [] })}
                    className="text-[var(--accent)] text-sm font-semibold"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-[var(--border-light)] px-5 pt-4">
              {sectionsFor(draft, setDraft, optionsFor(draft))}
            </div>

            {/*
              THE COMMIT. One re-render of the grid per visit to the sheet,
              instead of one per tick.

              The count is what makes that bearable: without the grid
              narrowing underneath, this number is the only evidence a tick
              did anything, and it also catches the dead end -- nobody taps
              "Show 0 cars" and then wonders where the catalogue went.

              The safe-area term in the padding does nothing TODAY: the site
              does not set viewport-fit=cover, so the browser insets the
              viewport itself and env(safe-area-inset-bottom) is 0. It is
              written as max(0.75rem, env(...)) so that if cover is ever
              turned on, this button does not end up under the home
              indicator -- which is exactly where a bottom-pinned control
              lands when it is not asked for.
            */}
            <div className="flex-none border-t border-[var(--border-light)] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => { onFilterChange(draft); onClose(); }}
                className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white active:brightness-90"
              >
                Show {draftCount} {draftCount === 1 ? 'car' : 'cars'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
