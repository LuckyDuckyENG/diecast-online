'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ModelCard from '../components/ModelCard';
import { supabase } from '@/lib/supabase';
import { fetchModelIdsWithStore } from '@/lib/storeCoverage';
import { Model } from '@/lib/types';

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function searchCars() {
      if (!query.trim()) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const searchTerm = query.toLowerCase();

        // Get ALL cars with their details
        const { data: allCars, error: carsError } = await supabase
          .from('cars')
          .select(`
            id,
            slug,
            chassis_name,
            event_name,
            team:teams(name, primary_color, text_color),
            season:seasons(year),
            driver:drivers(name, number)
          `);

        if (carsError) {
          console.error('Error fetching cars:', carsError.message || carsError);
          setResults([]);
          return;
        }

        // Get all models with SKUs
        const { data: allModels } = await supabase
          .from('models')
          .select('id, car_id, manufacturer_sku, image_url, scale');

        // Filter in JavaScript for better control
        const matchedCars = (allCars || []).filter((car: any) => {
          const driver = car.driver?.name?.toLowerCase() || '';
          const team = car.team?.name?.toLowerCase() || '';
          const event = car.event_name?.toLowerCase() || '';
          const livery = car.chassis_name?.toLowerCase() || '';

          // Check if query matches driver, team, event, or livery
          const textMatch =
            driver.includes(searchTerm) ||
            team.includes(searchTerm) ||
            event.includes(searchTerm) ||
            livery.includes(searchTerm);

          // Check if query matches any SKU for this car
          const skuMatch = (allModels || []).some((m: any) =>
            m.car_id === car.id &&
            m.manufacturer_sku?.toLowerCase().includes(searchTerm)
          );

          return textMatch || skuMatch;
        });

        const uniqueCars = matchedCars;

        // Group the models we already fetched by car — no extra round trips
        const modelsByCar = new Map<string, any[]>();
        (allModels || []).forEach((m: any) => {
          if (!modelsByCar.has(m.car_id)) modelsByCar.set(m.car_id, []);
          modelsByCar.get(m.car_id)!.push(m);
        });

        // Search deliberately does NOT filter by retailer — someone typing a
        // driver's name meant it, and empty results would look broken. Mark the
        // ones nobody sells yet instead.
        const modelIdsWithStore = await fetchModelIdsWithStore();

        const carsWithData = uniqueCars.map((car: any) => {
          const variants = modelsByCar.get(car.id) || [];
          const driver = car.driver;
          const eventName = car.event_name || 'Grand Prix';
          const variantWithImage = variants.find((v: any) => v.image_url);
          const hasStore = variants.some((v: any) => modelIdsWithStore.has(v.id));

          return {
            id: car.id,
            slug: car.slug,
            name: `${eventName} - ${car.chassis_name} - ${driver?.name} - ${car.season?.year}`,
            manufacturer: `${variants.length} manufacturers`,
            year: car.season?.year || 2024,
            driver: driver?.name,
            team: car.team?.name,
            imageUrl: variantWithImage?.image_url || null,
            scale: variants[0]?.scale || '1:18',
            liveryName: car.chassis_name,
            teamPrimaryColor: car.team?.primary_color,
            teamTextColor: car.team?.text_color,
            hasStore,
          };
        });

        // Buyable results first, but keep the rest reachable
        carsWithData.sort((a: any, b: any) => Number(b.hasStore) - Number(a.hasStore));

        setResults(carsWithData);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }

    searchCars();
  }, [query]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="mb-8">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-2">
            Search Results
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            {loading ? (
              'Searching...'
            ) : (
              <>
                {results.length} result{results.length !== 1 ? 's' : ''} for &quot;
                <span className="font-semibold text-[var(--text-primary)]">{query}</span>&quot;
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-tertiary)]">Loading...</div>
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white rounded-xl border border-[var(--border-light)] p-12 text-center">
            <h2 className="font-display font-bold text-2xl text-[var(--text-primary)] mb-3">
              No results found
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Try searching for a driver name, team, event, or model SKU
            </p>
            <p className="text-sm text-[var(--text-tertiary)]">
              Examples: &quot;Hamilton&quot;, &quot;Ferrari&quot;, &quot;Monaco GP&quot;,
              &quot;LSF1070&quot;
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {results.map((model) => (
              <ModelCard
                key={model.id}
                {...model}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex flex-col bg-[var(--bg-secondary)]">
        <Navbar />
        <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
          <div className="flex items-center justify-center py-20">
            <div className="text-[var(--text-tertiary)]">Loading...</div>
          </div>
        </main>
        <Footer />
      </div>
    }>
      <SearchResults />
    </Suspense>
  );
}
