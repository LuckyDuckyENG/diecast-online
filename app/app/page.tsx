'use client';

import Navbar from './components/Navbar';
import SearchHero from './components/SearchHero';
import Footer from './components/Footer';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState, useRef } from 'react';

export default function Home() {
  const [cars, setCars] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 340; // card width (320px) + gap (20px)
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    async function fetchCars() {
      // Get cars with team and driver info
      const { data: carsData, error: carsError } = await supabase
        .from('cars')
        .select(`
          id,
          event_name,
          livery_name,
          created_at,
          team:teams(name),
          season:seasons(year),
          car_drivers(
            driver:drivers(name)
          )
        `)
        .order('created_at', { ascending: false });

      if (carsError) {
        console.error('Error fetching cars:', carsError);
        return;
      }

      // Then get models for each car
      const carsWithModels = [];
      for (const car of carsData || []) {
        const { data: models } = await supabase
          .from('models')
          .select(`
            id,
            image_url,
            scale,
            manufacturer:manufacturers(name)
          `)
          .eq('car_id', car.id);

        if (models && models.length > 0) {
          // Get driver name from car_drivers
          const driverName = (car.car_drivers as any)?.[0]?.driver?.name || '';

          carsWithModels.push({
            ...car,
            models,
            team_name: (car.team as any)?.name || '',
            driver_name: driverName,
            year: (car.season as any)?.year || ''
          });
        }
      }

      console.log('Fetched cars with models:', carsWithModels.length);
      setCars(carsWithModels);
    }

    fetchCars();
  }, []);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />
      <SearchHero />

      {/* Latest Models Carousel */}
      <section id="cars" className="py-16 bg-white">
        <div className="max-w-[1240px] mx-auto px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="font-display font-bold text-[32px] text-[var(--text-primary)] mb-2">
                Latest Models
              </h2>
              <p className="text-[var(--text-muted)] text-[15px]">
                Recently added to the catalogue
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => scroll('left')}
                className="w-10 h-10 rounded-full border border-[var(--border-default)] flex items-center justify-center hover:border-[var(--text-muted)] hover:bg-gray-50 transition-all"
                aria-label="Scroll left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-10 h-10 rounded-full border border-[var(--border-default)] flex items-center justify-center hover:border-[var(--text-muted)] hover:bg-gray-50 transition-all"
                aria-label="Scroll right"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Horizontal Scroll Container */}
        <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
          <div className="flex gap-6 px-8 pb-4" style={{ width: 'max-content' }}>
            {cars.slice(0, 10).map((car) => {
              const image = car.models.find((m: any) => m.image_url)?.image_url;

              return (
                <Link
                  key={car.id}
                  href={`/cars/${car.id}`}
                  className="group bg-white border border-[var(--border-default)] rounded-[16px] overflow-hidden hover:shadow-lg transition-all flex-none w-[320px]"
                >
                  {/* Image */}
                  <div className="relative w-full h-[200px] bg-gray-50">
                    {image ? (
                      <Image
                        src={image}
                        alt={`${car.event_name} - ${car.livery_name}`}
                        fill
                        className="object-contain p-4"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[var(--accent)] font-bold text-[13px] uppercase tracking-wide">
                        {car.event_name}
                      </span>
                      {car.year && (
                        <span className="text-[var(--text-muted)] font-semibold text-[13px]">
                          • {car.year}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-bold text-[18px] text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent)] transition-colors">
                      {car.driver_name || car.team_name}
                    </h3>
                    <p className="text-[var(--text-muted)] text-[14px] mb-3">
                      {car.team_name} • {car.livery_name}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[var(--text-secondary)] text-[13px]">
                        {car.models.length} model{car.models.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[var(--accent)] font-semibold text-[14px] group-hover:underline">
                        Compare Prices →
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
