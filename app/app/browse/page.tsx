'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import FilterSidebar from '../components/FilterSidebar';
import ActiveFilters from '../components/ActiveFilters';
import BrowseGrid from '../components/BrowseGrid';
import Breadcrumb from '../components/Breadcrumb';
import { FilterOptions, SortOption, Model } from '@/lib/types';
import { supabase } from '../../../lib/supabase';
import { ModelWithDetails } from '../../../lib/database.types';

const INITIAL_FILTERS: FilterOptions = {
  years: [],
  teams: [],
  drivers: [],
  scales: [],
  manufacturers: [],
  specialLivery: null,
};

export default function BrowsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<FilterOptions>(INITIAL_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch cars (master pages) instead of individual models
  useEffect(() => {
    async function fetchCars() {
      try {
        setLoading(true);

        // Fetch all cars with their details
        const { data: carsData, error: carsError } = await supabase
          .from('cars')
          .select(`
            id,
            livery_name,
            event_name,
            team:teams(name),
            season:seasons(year),
            car_drivers(
              driver:drivers(name, number)
            )
          `);

        if (carsError) {
          console.error('Error fetching cars:', carsError);
          return;
        }

        // For each car, count manufacturer variants and get sample image
        const carsWithVariants = await Promise.all(
          (carsData || []).map(async (car: any) => {
            const { data: variants } = await supabase
              .from('models')
              .select('id, image_url, manufacturer_sku, scale, manufacturers(name)')
              .eq('car_id', car.id);

            const driver = car.car_drivers?.[0]?.driver;
            const eventName = car.event_name || 'Grand Prix';

            // Find first variant with an image
            const variantWithImage = variants?.find((v: any) => v.image_url);

            return {
              id: car.id, // This is car_id, used for /cars/[id] link
              name: `${eventName} - ${car.livery_name} - ${driver?.name} - ${car.season?.year}`,
              manufacturer: `${variants?.length || 0} manufacturers`, // Show count instead of single manufacturer
              year: car.season?.year || 2024,
              driver: driver?.name,
              team: car.team?.name,
              price: undefined, // Don't show price on browse (shows on master page)
              imageUrl: variantWithImage?.image_url || null,
              releaseDate: null,
              scale: variants?.[0]?.scale || '1:18',
              specialLivery: false,
              variantCount: variants?.length || 0,
            };
          })
        );

        // Filter out cars with no manufacturer variants (safety net)
        const carsWithModels = carsWithVariants.filter(car => car.variantCount > 0);

        setModels(carsWithModels);
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCars();
  }, []);

  // Initialize filters from URL on mount
  useEffect(() => {
    const urlFilters: FilterOptions = {
      years: searchParams.getAll('year'),
      teams: searchParams.getAll('team'),
      drivers: searchParams.getAll('driver'),
      scales: searchParams.getAll('scale'),
      manufacturers: searchParams.getAll('manufacturer'),
      specialLivery: searchParams.get('specialLivery') === 'true'
        ? true
        : searchParams.get('specialLivery') === 'false'
        ? false
        : null,
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

    if (newFilters.specialLivery !== null) {
      params.set('specialLivery', String(newFilters.specialLivery));
    }

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

    if (key === 'specialLivery') {
      newFilters.specialLivery = null;
    } else {
      const currentValues = newFilters[key] as string[];
      newFilters = {
        ...newFilters,
        [key]: currentValues.filter((v) => v !== value),
      };
    }

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
        if (filters.years.includes('Older')) {
          return filters.years.includes(String(model.year)) || model.year < 2018;
        }
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

    if (filters.specialLivery !== null) {
      results = results.filter((model) => model.specialLivery === filters.specialLivery);
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        results.sort((a, b) => b.year - a.year);
        break;
      case 'price-low':
        results.sort((a, b) => {
          const priceA = parseFloat(a.price?.replace(/[€,]/g, '') || '0');
          const priceB = parseFloat(b.price?.replace(/[€,]/g, '') || '0');
          return priceA - priceB;
        });
        break;
      case 'price-high':
        results.sort((a, b) => {
          const priceA = parseFloat(a.price?.replace(/[€,]/g, '') || '0');
          const priceB = parseFloat(b.price?.replace(/[€,]/g, '') || '0');
          return priceB - priceA;
        });
        break;
      case 'popular':
        // Random order for now (would be based on actual popularity data)
        results.sort(() => Math.random() - 0.5);
        break;
    }

    return results;
  }, [models, filters, sortBy]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="max-w-[1440px] mx-auto px-8 py-8">
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
        <div className="flex gap-8">
          {/* Sidebar */}
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            onClearAll={handleClearAll}
          />

          {/* Grid */}
          {loading ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <p className="text-[var(--text-tertiary)]">Loading models...</p>
            </div>
          ) : (
            <BrowseGrid models={filteredModels} sortBy={sortBy} onSortChange={handleSortChange} />
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
