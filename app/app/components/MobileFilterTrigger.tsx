'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The filter button on a phone, rendered into the sticky search row.
 *
 * WHY IT IS A PORTAL
 *
 * The control has to stay reachable 200 cards down, and the only thing on a
 * phone that is already sticky and already costs nothing extra is the navbar's
 * search row. But the filter state lives in BrowseClient, two levels away
 * through a layout boundary, and the button has to show how many filters are
 * on -- so data flows both ways.
 *
 * A portal keeps one owner of that state. The navbar renders an empty slot;
 * this puts a button in it. No context provider wrapping every page for the
 * sake of one, and no window events to keep in sync.
 *
 * WHY IT IS NOT IN THE PAGE FLOW
 *
 * Every previous attempt put the control above the grid, and both times
 * opening it moved 2,437 cards and hung the browser. First by pushing them
 * down, then -- after `fixed` collapsed the aside -- by snapping them up.
 * Living in the navbar means there is nothing above the grid to change size,
 * so the whole class of fault stops existing rather than being fixed again.
 */
export default function MobileFilterTrigger({
  activeCount,
  onOpen,
}: {
  activeCount: number;
  onOpen: () => void;
}) {
  /**
   * The slot only exists after the navbar has mounted, and createPortal needs
   * a real node. Resolved in an effect so the server render emits nothing and
   * hydration has something stable to match.
   */
  const [slot, setSlot] = useState<Element | null>(null);
  useEffect(() => {
    setSlot(document.getElementById('browse-filter-slot'));
  }, []);

  if (!slot) return null;

  return createPortal(
    <button
      type="button"
      onClick={onOpen}
      aria-label={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
      className="flex items-center gap-1.5 rounded-[10px] border px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors"
      style={{
        color: activeCount ? '#fff' : '#3a3833',
        borderColor: activeCount ? '#cf2f2a' : '#e0ddd6',
        background: activeCount ? '#cf2f2a' : 'transparent',
      }}
    >
      {/*
        Inline rather than an icon file: this is the one page being made
        lighter, and a sprite or an <img> would be a request to save a dozen
        lines of markup.
      */}
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 5h18l-7 8v6l-4 2v-8z" />
      </svg>
      {/*
        Labelled, not a bare glyph. The navbar already makes this argument
        about search: "nobody taps an icon for a feature they do not know
        exists". The count replaces the word once something is on, because by
        then the reader knows what the control is.
      */}
      {activeCount ? activeCount : 'Filters'}
    </button>,
    slot
  );
}
