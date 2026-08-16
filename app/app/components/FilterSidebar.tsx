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

export interface FilterOptionLists {
  years: string[];
  teams: string[];
  drivers: string[];
  scales: string[];
  manufacturers: string[];
}


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
      <div className={`lg:sticky lg:top-[88px] bg-white border border-[var(--border-light)] rounded-xl p-5 ${mobileOpen ? "" : "py-3 lg:py-5"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between lg:mb-5 lg:pb-5 lg:border-b border-[var(--border-light)] ${mobileOpen ? "mb-5 pb-5 border-b" : ""}`}>
          <button
            type="button"
            onClick={() => setMobileOpen(o => !o)}
            className="flex items-center gap-2 lg:cursor-default"
            aria-expanded={mobileOpen}
          >
            <h2 className="font-display font-bold text-base text-[var(--text-primary)]">Filters</h2>
            <span className={`lg:hidden transition-transform ${mobileOpen ? 'rotate-180' : ''}`}>▾</span>
          </button>
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
        {/* Year */}
        <FilterSection title="Year">
          {options.years.map((year) => (
            <label key={year} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.years.includes(year)}
                onChange={() => toggleArrayFilter('years', year)}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {year}
              </span>
            </label>
          ))}
        </FilterSection>

        {/* Team */}
        <FilterSection title="Team">
          {options.teams.map((team) => (
            <label key={team} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.teams.includes(team)}
                onChange={() => toggleArrayFilter('teams', team)}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {team}
              </span>
            </label>
          ))}
        </FilterSection>

        {/* Driver */}
        <FilterSection title="Driver">
          {options.drivers.map((driver) => (
            <label key={driver} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.drivers.includes(driver)}
                onChange={() => toggleArrayFilter('drivers', driver)}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {driver}
              </span>
            </label>
          ))}
        </FilterSection>

        {/* Scale */}
        <FilterSection title="Scale">
          {options.scales.map((scale) => (
            <label key={scale} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.scales.includes(scale)}
                onChange={() => toggleArrayFilter('scales', scale)}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {scale}
              </span>
            </label>
          ))}
        </FilterSection>

        {/* Manufacturer */}
        <FilterSection title="Manufacturer">
          {options.manufacturers.map((manufacturer) => (
            <label key={manufacturer} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.manufacturers.includes(manufacturer)}
                onChange={() => toggleArrayFilter('manufacturers', manufacturer)}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)] focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {manufacturer}
              </span>
            </label>
          ))}
        </FilterSection>
        </div>
      </div>
    </aside>
  );
}
