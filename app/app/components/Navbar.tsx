'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SearchBox from './SearchBox';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 backdrop-blur-xl bg-white/85 transition-all duration-300 border-b`}
      style={{ borderColor: '#ecebe6' }}
    >
      <div className="max-w-[1240px] mx-auto px-4 sm:px-8 h-[64px] flex items-center justify-between gap-3 sm:gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-none">
          {/* Checkered flag icon */}
          <div className="w-[16px] h-[16px] grid grid-cols-2 grid-rows-2 gap-[1px] rounded-[3px] overflow-hidden">
            <span className="bg-[var(--text-primary)]" />
            <span className="bg-white border border-[var(--border-light)]" />
            <span className="bg-white border border-[var(--border-light)]" />
            <span className="bg-[var(--text-primary)]" />
          </div>
          <span className="font-display font-extrabold text-[19px] tracking-tight text-[var(--text-primary)]">
            Diecasts
          </span>
        </Link>

        {/* Center Navigation + Search */}
        <div className="hidden md:flex items-center gap-6 flex-1">
          <Link href="/browse" className="font-semibold text-[15px] hover:text-[var(--accent)] transition-colors flex-none" style={{ color: '#3a3833' }}>
            Browse
          </Link>
          <Link href="/savings" className="font-semibold text-[15px] hover:text-[var(--accent)] transition-colors flex-none" style={{ color: '#3a3833' }}>
            Best prices
          </Link>

          {/* Search Bar. Suggestions live in SearchBox; see that file
              for why they cost no database queries. */}
          <SearchBox className="flex-1 max-w-[448px]" />

          <Link href="/about" className="font-semibold text-[15px] hover:text-[var(--accent)] transition-colors flex-none" style={{ color: '#3a3833' }}>
            About
          </Link>
        </div>

        {/*
          BEST PRICES — its own child, not grouped with Browse.

          It lived inside the right-hand group first, which meant
          justify-between pushed a plain text link hard against a red button
          while the whole middle of the bar sat empty. They read as one
          smudged cluster rather than two destinations.

          As a sibling, the three visible children on mobile — logo, this,
          Browse — spread across the bar on their own, and the gap does the
          separating without a divider.

          Why it is in the header at all: the footer link was not enough. On
          /browse you had to pass 48 cards to reach the one page whose subject
          is the thing the site is for. Reachable is not visible.

          A text link rather than a second button. Two buttons do not fit at
          360px, and would compete for the same attention if they did; Browse
          keeps the emphasis. About stays in the footer, which is where
          genuinely secondary things belong.
        */}
        {/*
          OUTLINED, NOT BARE TEXT.

          As plain text beside a filled red button it read as promotional copy
          rather than a destination — the eye sorts "button = navigation,
          loose text = a message". A border makes it the same kind of object
          as Browse.

          Secondary on purpose, and in three ways: no fill, a lighter weight
          of border than the accent, and slightly less vertical padding than
          Browse. Browse keeps the emphasis because the catalogue is the main
          route; this is the alternative, not a rival.
        */}
        <Link
          href="/savings"
          className="md:hidden font-semibold text-sm px-3 py-1.5 rounded-[10px] border transition-colors whitespace-nowrap hover:border-[var(--accent)] hover:text-[var(--accent)]"
          style={{ color: '#3a3833', borderColor: '#e0ddd6' }}
        >
          Best prices
        </Link>

        {/* Right Side */}
        <div className="flex items-center gap-3 flex-none">
          {/* Browse lives here as well as in the hidden md: block, because that
              block takes the search box with it below md — which left a phone
              visitor with no route into the catalogue at all. */}
          <Link
            href="/browse"
            className="md:hidden font-bold text-sm sm:text-[15px] px-3 sm:px-4 py-2 rounded-[10px] text-white hover:brightness-[0.92] transition-all"
            style={{ background: '#cf2f2a' }}
          >
            Browse
          </Link>
        </div>
      </div>

      {/*
        SEARCH ON MOBILE — a second row, because it had none at all.

        The desktop search lives in the `hidden md:flex` block above, so below
        768px the site rendered a search field into the HTML and then hid it
        with CSS. Every page except the home page had no way to search, and the
        home page's own field is a separate plain input with no suggestions. The
        typeahead was, in effect, desktop-only.

        That matters more than it sounds. Search Console shows visitors arrive
        from Google onto a DEEP page — a car page converting at 29% — not onto
        the home page. So the one screen a mobile visitor actually lands on was
        the one with no route onward except Browse.

        It is a row rather than an icon on purpose. Search is the primary
        navigation of a catalogue, not a utility hiding behind a magnifying
        glass, and nobody taps an icon for a feature they do not know exists.
        The cost is honest: ~48px of a ~650px screen, permanently, on top of
        the 64px bar.
      */}
      <div className="md:hidden border-t px-4 py-2" style={{ borderColor: '#f2f1ed' }}>
        <SearchBox className="w-full" />
      </div>
    </nav>
  );
}
