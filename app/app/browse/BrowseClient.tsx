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
 * Drivers people recognise, in the order they would be recognised.
 *
 * The short driver list cannot be "the eight with the most models", because
 * fame and catalogue size disagree exactly where it matters: Alonso has 26
 * cars and ranks 11th, Ricciardo 20th at 15th, Vettel 15 at 18th, Raikkonen 7
 * at 29th. A pure count list drops four of the most recognisable names in the
 * sport because they are retired or only raced part of the covered era.
 *
 * Names absent from the catalogue are dropped rather than rendered, which is
 * not hypothetical: Michael Schumacher and Senna are both obvious entries for
 * a list like this and NEITHER is in the data, which only runs from 2019. A
 * curated list that is not intersected with reality shows filters that match
 * nothing.
 *
 * Short lists are then topped up by count, so a rookie who becomes a household
 * name — Antonelli, Bortoleto, Hadjar — appears on merit without anyone
 * editing this array.
 */
const HOUSEHOLD_DRIVERS = [
  'Lewis Hamilton',
  'Max Verstappen',
  'Fernando Alonso',
  'Charles Leclerc',
  'Lando Norris',
  'Daniel Ricciardo',
  'Sebastian Vettel',
  'Kimi Raikkonen',
];

function orderDrivers(opts: { value: string; count: number }[]) {
  const rank = new Map(HOUSEHOLD_DRIVERS.map((n, i) => [n, i]));
  return [...opts].sort((a, b) => {
    const ra = rank.get(a.value), rb = rank.get(b.value);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return b.count - a.count;
  });
}

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

    /**
     * ANY overlap, not equality.
     *
     * A car offered in both 1:18 and 1:43 matches either tick. Testing one
     * value meant ticking 1:18 returned 284 cars when about 498 have a 1:18
     * model — the filter hid 43% of its own matches and looked authoritative
     * doing it.
     */
    if (filters.scales.length > 0) {
      results = results.filter((model) => model.scales.some(s => filters.scales.includes(s)));
    }

    if (filters.manufacturers.length > 0) {
      results = results.filter((model) => model.manufacturers.some(m => filters.manufacturers.includes(m)));
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
   *
   * COUNTED PER FACET, against everything EXCEPT that facet.
   *
   * They used to be derived from every model regardless of what was selected,
   * which offered combinations that return nothing: ticking 1:12 still listed
   * all 41 drivers, and almost every one of them led to an empty grid.
   *
   * Each facet is therefore counted against the models passing all the OTHER
   * facets. Counting against the fully filtered set instead would zero every
   * unticked driver the moment one driver was ticked, making multi-select
   * impossible — which is how faceted search is meant to work.
   */
  const filterOptions = useMemo(() => {
    const passes = (m: Model, skip: keyof FilterOptions) => {
      if (skip !== 'years' && filters.years.length && !filters.years.includes(String(m.year))) return false;
      if (skip !== 'teams' && filters.teams.length && !(m.team && filters.teams.includes(m.team))) return false;
      if (skip !== 'drivers' && filters.drivers.length && !(m.driver && filters.drivers.includes(m.driver))) return false;
      if (skip !== 'scales' && filters.scales.length && !m.scales.some(s => filters.scales.includes(s))) return false;
      if (skip !== 'manufacturers' && filters.manufacturers.length && !m.manufacturers.some(x => filters.manufacturers.includes(x))) return false;
      return true;
    };

    /**
     * `values` returns a LIST, because a car can belong to several buckets of
     * the same facet — three scales, two makers. Each distinct value counts the
     * car once, so a count is always "cars you would be left with".
     */
    const tally = (key: keyof FilterOptions, values: (m: Model) => (string | undefined)[]) => {
      const counts = new Map<string, number>();
      for (const m of initialModels) {
        if (!passes(m, key)) continue;
        for (const v of new Set(values(m))) if (v) counts.set(v, (counts.get(v) || 0) + 1);
      }
      // A ticked value must survive even at zero, or it cannot be unticked.
      for (const v of filters[key] as string[]) if (!counts.has(v)) counts.set(v, 0);
      return [...counts].map(([value, count]) => ({ value, count }));
    };

    const byCount = (a: { count: number }, b: { count: number }) => b.count - a.count;

    return {
      // Recency, not count. Count would lead with 2023 and bury 2026, and
      // nobody thinks about seasons in order of how many models exist.
      years: tally('years', m => [m.year ? String(m.year) : undefined])
        .sort((a, b) => Number(b.value) - Number(a.value)),
      teams: tally('teams', m => [m.team]).sort(byCount),
      drivers: orderDrivers(tally('drivers', m => [m.driver])),
      scales: tally('scales', m => m.scales).sort(byCount),
      manufacturers: tally('manufacturers', m => m.manufacturers).sort(byCount),
    };
  }, [initialModels, filters]);

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
