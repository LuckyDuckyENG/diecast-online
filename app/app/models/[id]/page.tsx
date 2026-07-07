'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import ModelHero from '../../components/ModelHero';
import KeyDetails from '../../components/KeyDetails';
import PriceHistory from '../../components/PriceHistory';
import WhereToBuy from '../../components/WhereToBuy';
import CollectorReviews from '../../components/CollectorReviews';
import RelatedModels from '../../components/RelatedModels';
import { supabase } from '@/lib/supabase';

export default function ModelDetailPage() {
  // Get id from URL params
  const params = useParams();
  const id = params.id as string;

  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Fetch model data from Supabase
  useEffect(() => {
    async function fetchModel() {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('models')
          .select(`
            *,
            manufacturer:manufacturers(name),
            car:cars(
              livery_name,
              team:teams(name),
              season:seasons(year),
              car_drivers(
                driver:drivers(name, number)
              )
            )
          `)
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching model:', error);
          setModel(null);
          return;
        }

        // Fetch retailer pricing data
        const { data: priceData } = await supabase
          .from('price_history')
          .select(`
            price,
            recorded_at,
            product_url,
            retailer:retailers(name, url)
          `)
          .eq('model_id', id);

        // Transform retailer data
        const retailers = (priceData || []).map((item: any) => ({
          name: item.retailer?.name || 'Unknown',
          price: parseFloat(item.price) || 0,
          currency: 'AUD',
          availability: 'In Stock' as const,
          url: item.product_url || item.retailer?.url || '#', // Use product_url if available, fallback to homepage
        }));

        // Transform to expected format
        const driver = data.car?.car_drivers?.[0]?.driver;
        const imageUrl = data.image_url || '/placeholder.jpg';
        const transformedModel = {
          id: data.id,
          name: data.description || `${data.car?.livery_name} - ${driver?.name}`,
          manufacturer: data.manufacturer?.name || '',
          year: data.car?.season?.year || 2024,
          driver: driver?.name,
          team: data.car?.team?.name,
          grandPrix: data.description?.split(' - ')[2] || 'Grand Prix 2024',
          scale: data.scale,
          material: 'Die-cast metal',
          priceRange: {
            low: parseFloat(data.price) || 0,
            high: parseFloat(data.price) || 0,
            currency: '€',
          },
          images: {
            main: imageUrl,
            thumbnails: [imageUrl],
          },
          articleNumber: 'N/A',
          productionNumber: 'Limited Edition',
          releaseDate: data.release_date,
          specialLivery: false,
          priceHistory: [],
          retailers: retailers,
          rating: { average: 0, count: 0 },
          reviews: [],
          relatedModels: [],
        };

        setModel(transformedModel);
      } catch (err) {
        console.error('Unexpected error:', err);
        setModel(null);
      } finally {
        setLoading(false);
      }
    }

    fetchModel();
  }, [id]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="max-w-[1240px] mx-auto px-8 py-16 text-center">
          <p className="text-[var(--text-tertiary)]">Loading model...</p>
        </div>
        <Footer />
      </div>
    );
  }

  // If model not found, show not found message
  if (!model) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="max-w-[1240px] mx-auto px-8 py-16 text-center">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-4">
            Model Not Found
          </h1>
          <p className="text-[var(--text-tertiary)] mb-8">
            The model you're looking for doesn't exist.
          </p>
          <a
            href="/browse"
            className="inline-block bg-[var(--accent)] text-white font-bold px-6 py-3 rounded-lg hover:brightness-[0.92] transition-all"
          >
            Back to Browse
          </a>
        </div>
        <Footer />
      </div>
    );
  }

  // Extract car name from model name (first part before " - ")
  const carName = model.name.split(' - ')[0];

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Browse', href: '/browse' },
    { label: carName, href: `/browse?team=${encodeURIComponent(model.team)}` },
    {
      label: `${model.grandPrix} — ${model.driver} — ${model.manufacturer} ${model.scale}`,
      href: `/models/${id}`,
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="max-w-[1240px] mx-auto px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        {/* Hero Section */}
        <ModelHero
          name={model.name}
          manufacturer={model.manufacturer}
          scale={model.scale}
          material={model.material}
          priceRange={model.priceRange}
          images={model.images}
        />

        {/* Key Details */}
        <KeyDetails
          year={model.year}
          driver={model.driver}
          team={model.team}
          grandPrix={model.grandPrix}
          scale={model.scale}
          material={model.material}
          manufacturer={model.manufacturer}
          articleNumber={model.articleNumber}
          productionNumber={model.productionNumber}
          releaseDate={model.releaseDate}
          specialLivery={model.specialLivery}
        />

        {/* Price History */}
        <PriceHistory priceHistory={model.priceHistory} currency={model.priceRange.currency} />

        {/* Where to Buy */}
        <WhereToBuy retailers={model.retailers} />

        {/* Collector Reviews */}
        <CollectorReviews rating={model.rating} reviews={model.reviews} />

        {/* Related Models */}
        <RelatedModels models={model.relatedModels} />
      </div>

      <Footer />
    </div>
  );
}
