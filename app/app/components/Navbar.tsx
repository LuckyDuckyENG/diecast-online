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
            href="/savings"
            className="md:hidden font-semibold text-sm text-[#3a3833] hover:text-[var(--accent)] transition-colors whitespace-nowrap"
          >
            Best prices
          </Link>
          <Link
            href="/browse"
            className="md:hidden font-bold text-sm sm:text-[15px] px-3 sm:px-4 py-2 rounded-[10px] text-white hover:brightness-[0.92] transition-all"
            style={{ background: '#cf2f2a' }}
          >
            Browse
          </Link>
          {/*
            BEST PRICES IS HERE BECAUSE THE FOOTER WAS NOT ENOUGH.

            It was added to the footer first, on the reasoning that the mobile
            header was full and the footer is where mobile navigation lives.
            That was wrong in practice: the footer sits below the whole page,
            so on /browse you now have to pass 48 cards to reach a link to the
            one page whose subject is the thing the site is for. Looking at
            the top of /browse on a phone, it is simply not there.

            It fits as a text link beside the button, measured at 360px:
            logo ~102, gap 12, "Best prices" at text-sm ~77, gap 12, Browse at
            px-3 ~72 — 275 of the 328 available. The Browse button drops to
            px-3 and text-sm below sm to buy that room, which is also why this
            is a text link rather than a second button: two buttons would not
            fit, and would compete for the same attention anyway.

            About stays in the footer. It is genuinely secondary and the slot
            is worth more here.
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
