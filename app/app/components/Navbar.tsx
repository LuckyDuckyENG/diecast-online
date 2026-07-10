'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <nav
      className={`sticky top-0 z-50 backdrop-blur-xl bg-white/85 transition-all duration-300 border-b`}
      style={{ borderColor: '#ecebe6' }}
    >
      <div className="max-w-[1240px] mx-auto px-8 h-[64px] flex items-center justify-between gap-6">
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

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex-1 max-w-[448px]">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search drivers, teams, events, or SKUs..."
                className="w-full px-4 py-2 pl-10 rounded-lg border bg-white/50 text-sm focus:outline-none transition-all"
                style={{ borderColor: '#e0ddd6', color: '#1a1916', fontFamily: "'Hanken Grotesk', sans-serif" }}
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                fill="none"
                stroke="#8a857c"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </form>

          <Link href="/about" className="font-semibold text-[15px] hover:text-[var(--accent)] transition-colors flex-none" style={{ color: '#3a3833' }}>
            About
          </Link>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3.5 flex-none">
          <Link href="/login" className="font-semibold text-[15px] transition-colors" style={{ color: '#3a3833' }}>
            Log in
          </Link>
          <Link
            href="/signup"
            className="font-bold text-[15px] px-5 py-2.5 rounded-[10px] hover:brightness-[0.92] transition-all text-white"
            style={{ background: '#cf2f2a' }}
          >
            Sign up
          </Link>
        </div>
      </div>
    </nav>
  );
}
