'use client';

import { SortOption, Model } from '@/lib/types';
import ModelCard from './ModelCard';

interface BrowseGridProps {
  models: Model[];
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

export default function BrowseGrid({ models, sortBy, onSortChange }: BrowseGridProps) {
  return (
    <div className="flex-1">
      {/* Results Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[var(--text-primary)] font-semibold">
            Showing {models.length} model{models.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Sort Dropdown */}
        <div className="flex items-center gap-3">
          <label htmlFor="sort" className="text-sm text-[var(--text-tertiary)] font-medium">
            Sort by:
          </label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="px-4 py-2 bg-white border border-[var(--border-default)] rounded-lg text-sm text-[var(--text-primary)] font-medium focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent cursor-pointer"
          >
            <option value="newest">Newest First</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="popular">Most Popular</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {models.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {models.map((model) => (
            <ModelCard key={model.id} {...model} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto mb-4"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <h3 className="font-display font-bold text-xl text-[var(--text-primary)] mb-2">
            No models found
          </h3>
          <p className="text-[var(--text-tertiary)]">
            Try adjusting your filters to see more results
          </p>
        </div>
      )}
    </div>
  );
}
