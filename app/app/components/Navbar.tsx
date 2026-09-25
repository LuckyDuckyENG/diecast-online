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
          {/*
            Desktop only, beside Browse. The mobile bar stays as it is — it
            already carries a logo, Browse and a search field in a row that has
            no space left, and a fourth item there would cost more than the
            page is worth on a phone.
          */}
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
          <Link
            href="/about"
            className="md:hidden font-semibold text-[15px] transition-colors"
            style={{ color: '#3a3833' }}
          >
            About
          </Link>
        </div>
      </div>
    </nav>
  );
}
