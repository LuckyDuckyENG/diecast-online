'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
      className={`sticky top-0 z-50 backdrop-blur-xl bg-white/82 transition-all duration-300 ${
        isScrolled ? 'border-b border-[var(--border-light)] shadow-sm' : 'border-b border-transparent'
      }`}
    >
      <div className="max-w-[1240px] mx-auto px-8 h-[72px] flex items-center justify-between gap-6">
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

        {/* Center Navigation */}
        <div className="hidden md:flex items-center justify-center gap-8 flex-1">
          <Link href="/browse" className="text-[var(--text-secondary)] font-semibold text-[15px] hover:text-[var(--text-primary)] transition-colors">
            Browse
          </Link>
          <Link href="/about" className="text-[var(--text-secondary)] font-semibold text-[15px] hover:text-[var(--text-primary)] transition-colors">
            About
          </Link>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3.5 flex-none">
          <Link href="/login" className="text-[var(--text-secondary)] font-semibold text-[15px] hover:text-[var(--text-primary)] transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-[var(--accent)] text-white font-bold text-[15px] px-5 py-2.5 rounded-[10px] hover:brightness-[0.92] transition-all"
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
