'use client';

import { useState } from 'react';

const filters = ['All', 'Formula 1', 'V8 Supercars', 'MotoGP', 'Aviation', 'Le Mans'];

export default function SearchHero() {
  const [activeFilter, setActiveFilter] = useState('All');

  return (
    <header className="bg-gradient-to-b from-[var(--background)] to-[var(--section-bg)] px-8 py-20">
      <div className="max-w-4xl mx-auto text-center">
        {/* Overline */}
        <div className="inline-block mb-6">
          <span className="text-[var(--accent)] font-display font-bold text-sm tracking-wide uppercase">
            • The Scale Model Catalogue
          </span>
        </div>

        {/* Main Heading */}
        <h1 className="font-display font-black text-[48px] md:text-[64px] leading-[1.05] tracking-tight text-[var(--text-primary)] mb-5">
          Every F1 Model<br />Ever Made. In One Place.
        </h1>

        {/* Subheading */}
        <p className="text-[var(--text-muted)] text-lg mb-8 max-w-2xl mx-auto">
          Find, track and discover premium scale models from Spark, Minichamps, and every maker collectors trust.
        </p>

        {/* Search Bar */}
        <div className="flex items-center gap-2.5 h-[60px] px-4 pr-2 bg-white border-[1.5px] border-[var(--border-default)] rounded-[14px] max-w-[640px] mx-auto shadow-sm mb-6">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="2.2"
            strokeLinecap="round"
            className="flex-none"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.5" y2="16.5" />
          </svg>
          <input
            type="text"
            placeholder="Search any car, driver, season or model..."
            className="flex-1 border-none bg-transparent outline-none text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button className="bg-[var(--accent)] text-white font-bold text-[14px] h-[46px] px-6 rounded-[11px] hover:brightness-[0.92] transition-all">
            Search
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                activeFilter === filter
                  ? 'bg-[var(--text-primary)] text-white'
                  : 'bg-white text-[var(--text-secondary)] border border-[var(--border-default)] hover:border-[var(--text-muted)]'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Stats */}
        <p className="text-[var(--text-muted)] text-sm">
          Tracking <span className="font-semibold text-[var(--text-primary)]">62 models</span> from{' '}
          <span className="font-semibold text-[var(--text-primary)]">5 manufacturers</span>
        </p>
      </div>
    </header>
  );
}
