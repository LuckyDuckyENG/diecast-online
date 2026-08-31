'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import FilterSidebar from '../components/FilterSidebar';
import ActiveFilters from '../components/ActiveFilters';
import BrowseGrid from '../components/BrowseGrid';
import Breadcrumb from '../components/Breadcrumb';
import { FilterOptions, SortOption, Model } from '@/lib/types';

const INITIAL_FILTERS: FilterOptions = {
  years: [],
  teams: [],
  drivers: [],
  scales: [],
  manufacturers: [],
};

/**
 * Filtering and sorting for /browse.
 *
 * The car list is fetched on the server and passed in, so the grid and its
 * links are in the HTML before any JavaScript runs. Only the filter and sort
 * controls need to be interactive, and they work over props.
 */
function BrowseContent({ initialModels }: { initialModels: Model[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterOptions>(INITIAL_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Server-provided; no client fetch and no loading state
  const models = initialModels;

  useEffect(() => {
    const urlFilters: FilterOptions = {
      years: searchParams.getAll('year'),
      teams: searchParams.getAll('team'),
      drivers: searchParams.getAll('driver'),
      scales: searchParams.getAll('scale'),
      manufacturers: searchParams.getAll('manufacturer'),
    };

    const urlSort = searchParams.get('sort') as SortOption;
    if (urlSort) setSortBy(urlSort);

    setFilters(urlFilters);
  }, [searchParams]);

  // Update URL when filters or sort changes
  const updateURL = (newFilters: FilterOptions, newSort: SortOption) => {
    const params = new URLSearchParams();

    newFilters.years.forEach((year) => params.append('year', year));
    newFilters.teams.forEach((team) => params.append('team', team));
    newFilters.drivers.forEach((driver) => params.append('driver', driver));
    newFilters.scales.forEach((scale) => params.append('scale', scale));
    newFilters.manufacturers.forEach((manufacturer) => params.append('manufacturer', manufacturer));

    if (newSort !== 'newest') {
      params.set('sort', newSort);
    }

    const queryString = params.toString();
    router.push(queryString ? `/browse?${queryString}` : '/browse', { scroll: false });
  };

  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    updateURL(newFilters, sortBy);
  };

  const handleRemoveFilter = (key: keyof FilterOptions, value: string) => {
    let newFilters = { ...filters };

    const currentValues = newFilters[key] as string[];
    newFilters = {
      ...newFilters,
      [key]: currentValues.filter((v) => v !== value),
    };

    setFilters(newFilters);
    updateURL(newFilters, sortBy);
  };

  const handleClearAll = () => {
    setFilters(INITIAL_FILTERS);
    updateURL(INITIAL_FILTERS, sortBy);
  };

  const handleSortChange = (newSort: SortOption) => {
    setSortBy(newSort);
    updateURL(filters, newSort);
  };

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let results = [...models];

    // Apply filters
    if (filters.years.length > 0) {
      results = results.filter((model) => {
        // "Older" was an option in the hardcoded list and no longer exists —
        // the years now come from the data, so every one of them is real.
        return filters.years.includes(String(model.year));
      });
    }

    if (filters.teams.length > 0) {
      results = results.filter((model) => model.team && filters.teams.includes(model.team));
    }

    if (filters.drivers.length > 0) {
      results = results.filter((model) => model.driver && filters.drivers.includes(model.driver));
    }

    if (filters.scales.length > 0) {
      results = results.filter((model) => model.scale && filters.scales.includes(model.scale));
    }

    if (filters.manufacturers.length > 0) {
      results = results.filter((model) => filters.manufacturers.includes(model.manufacturer));
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        results.sort((a, b) => b.year - a.year);
        break;
      /**
       * These two sorted nothing at all until now.
       *
       * They read `a.price`, a formatted string that browseData never set — so
       * every comparison was parseFloat('0') against parseFloat('0') and the
       * grid did not move for any of the 729 cars. The control was in the
       * dropdown, people could choose it, and it silently did nothing.
       *
       * Now sorted on the numeric cheapest-anywhere price. Cars with no price
       * always sink to the bottom rather than counting as free, which is what
       * treating a missing price as 0 did.
       */
      case 'price-low':
        results.sort((a, b) => (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity));
        break;
      case 'price-high':
        results.sort((a, b) => (b.lowestPrice ?? -Infinity) - (a.lowestPrice ?? -Infinity));
        break;
      case 'popular':
        // Random order for now (would be based on actual popularity data)
        results.sort(() => Math.random() - 0.5);
        break;
    }

    return results;
  }, [models, filters, sortBy]);

  /**
   * Filter options come from the models on the page, not a hardcoded list.
   *
   * The hardcoded one had drifted badly: no 2025 at all, so the newest season
   * could not be filtered to; 2020/2019/2018/"Older" which the catalogue does
   * not contain; and ten of forty-six drivers, missing AlphaTauri and Alfa
   * Romeo entirely so 2021-2023 could not be filtered by team. Deriving them
   * means the lists cannot go stale again.
   */
  const filterOptions = useMemo(() => {
    const uniq = (xs: (string | undefined)[]) =>
      [...new Set(xs.filter((x): x is string => !!x))];
    return {
      years: uniq(initialModels.map(m => m.year ? String(m.year) : undefined))
        .sort((a, b) => Number(b) - Number(a)),
      teams: uniq(initialModels.map(m => m.team)).sort(),
      drivers: uniq(initialModels.map(m => m.driver)).sort(),
      scales: uniq(initialModels.map(m => m.scale)).sort(),
      manufacturers: uniq(initialModels.map(m => m.manufacturer)).sort(),
    };
  }, [initialModels]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Browse', href: '/browse' }]} />

        {/* Page Header */}
        <div className="mb-8">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-3">
            Browse F1 Models
          </h1>

          {/* Active Filters */}
          <ActiveFilters
            filters={filters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAll}
          />
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Sidebar */}
          <FilterSidebar
            options={filterOptions}
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearAll={handleClearAll}
          />

          {/* Grid */}
          <BrowseGrid models={filteredModels} sortBy={sortBy} onSortChange={handleSortChange} />
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default function BrowseClient({ initialModels }: { initialModels: Model[] }) {
  return (
    <Suspense fallback={null}>
      <BrowseContent initialModels={initialModels} />
    </Suspense>
  );
}
