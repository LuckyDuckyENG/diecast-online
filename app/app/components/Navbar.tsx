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

        {/* Right Side */}
        <div className="flex items-center gap-3 flex-none">
          {/* Browse lives here as well as in the hidden md: block, because that
              block takes the search box with it below md — which left a phone
              visitor with no route into the catalogue at all. */}
          <Link
            href="/browse"
            className="md:hidden font-bold text-[15px] px-4 py-2 rounded-[10px] text-white hover:brightness-[0.92] transition-all"
            style={{ background: '#cf2f2a' }}
          >
            Browse
          </Link>
          {/*
            About is deliberately NOT here any more. The footer already links
            it, and the slot is worth more as the space that lets the search
            row below breathe. See that row for why search earned it.
          */}
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
