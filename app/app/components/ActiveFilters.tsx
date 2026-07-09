'use client';

import { FilterOptions } from '@/lib/types';

interface ActiveFiltersProps {
  filters: FilterOptions;
  onRemoveFilter: (key: keyof FilterOptions, value: string) => void;
  onClearAll: () => void;
}

export default function ActiveFilters({ filters, onRemoveFilter, onClearAll }: ActiveFiltersProps) {
  const activeFilters: { key: keyof FilterOptions; value: string; label: string }[] = [];

  // Collect all active filters
  filters.years.forEach((year) => activeFilters.push({ key: 'years', value: year, label: year }));
  filters.teams.forEach((team) => activeFilters.push({ key: 'teams', value: team, label: team }));
  filters.drivers.forEach((driver) => activeFilters.push({ key: 'drivers', value: driver, label: driver }));
  filters.scales.forEach((scale) => activeFilters.push({ key: 'scales', value: scale, label: scale }));
  filters.manufacturers.forEach((manufacturer) =>
    activeFilters.push({ key: 'manufacturers', value: manufacturer, label: manufacturer })
  );

  if (activeFilters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-[var(--text-tertiary)]">Active filters:</span>
      {activeFilters.map((filter, index) => (
        <button
          key={`${filter.key}-${filter.value}-${index}`}
          onClick={() => onRemoveFilter(filter.key, filter.value)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--text-primary)] text-white text-sm font-medium rounded-full hover:bg-[var(--accent)] transition-colors"
        >
          {filter.label}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ))}
      {activeFilters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-sm font-semibold text-[var(--accent)] hover:underline ml-2"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
