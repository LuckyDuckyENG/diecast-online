'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import { supabase } from '@/lib/supabase';
import { formatAge, shouldHidePrice, freshnessOf } from '@/lib/freshness';
import { isUuid } from '@/lib/carSlug';

// Helper to get manufacturer logo filename
function getManufacturerLogo(name: string): string {
  const logoMap: Record<string, string> = {
    'Spark': '/logos/spark_logo.svg',
    'Minichamps': '/logos/minichamps_logo.png',
    'Solido': '/logos/Solido_Logo.png',
    'Looksmart': '/logos/Looksmart_Logo.png',
    'Bburago': '/logos/Bburago_Logo.png',
    'BBR': '/logos/BBR_Models_Logo.png',
    'Amalgam': '/logos/Amalgam_logo.png',
  };
  return logoMap[name] || '';
}

export default function MasterCarPage() {
  const params = useParams();
  const carId = params.id as string;

  const [carData, setCarData] = useState<any>(null);
  const [variants, setVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');
  const [selectedScale, setSelectedScale] = useState<string>('all');

  useEffect(() => {
    async function fetchCarAndVariants() {
      try {
        setLoading(true);

        // Accept either a slug or a UUID in the URL.
        //
        // /cars/2024-ferrari-sf-24-charles-leclerc-australian-gp   (preferred)
        // /cars/c27037a6-0765-44ce-ba71-541a6f8a0791               (still works)
        //
        // Resolving against the stored slug column rather than regenerating it
        // means a later change to the slug rules can't orphan URLs already in
        // the wild. Old UUID links keep working indefinitely.
        const lookupColumn = isUuid(carId) ? 'id' : 'slug';

        const { data: car, error: carError } = await supabase
          .from('cars')
          .select(`
            *,
            team:teams(name),
            season:seasons(year),
            driver:drivers(name, number)
          `)
          .eq(lookupColumn, carId)
          .single();

        if (carError) {
          console.error('Error fetching car:', carError);
          setCarData(null);
          return;
        }

        // Fetch all manufacturer variants for this car
        const { data: modelVariants, error: variantsError } = await supabase
          .from('models')
          .select(`
            id,
            description,
            manufacturer_sku,
            scale,
            price,
            image_url,
            release_date,
            stock_status,
            manufacturers(id, name, description)
          `)
          // car.id, not carId — the URL param may be a slug, and models are
          // keyed by the car's UUID.
          .eq('car_id', car.id);

        if (variantsError) {
          console.error('Error fetching variants:', variantsError);
        }

        // For each variant, fetch retailer prices AND eBay links
        const variantsWithPrices = await Promise.all(
          (modelVariants || []).map(async (variant: any) => {
            const { data: priceData } = await supabase
              .from('price_history')
              // `*` rather than a column list so this keeps working whether or
              // not migration 009 (last_checked_at) has been applied yet.
              .select(`
                *,
                retailer:retailers(name, url)
              `)
              .eq('model_id', variant.id)
              .order('in_stock', { ascending: false })
              .order('price_aud', { ascending: true });

            // Fetch eBay link for this variant
            const { data: ebayLink } = await supabase
              .from('ebay_links')
              .select('*')
              .eq('model_id', variant.id)
              .single();

            // Build retailers array from price_history.
            // Skip rows with no usable price — a 0 is always a failed extraction,
            // never a real offer, and it would sort first as the "cheapest".
            // The row stays in the DB (it holds a real product URL); it just
            // isn't advertised until someone supplies the price.
            const retailers = (priceData || [])
              .filter((item: any) => parseFloat(item.price) > 0)
              .map((item: any) => {
                // Fall back to recorded_at until migration 009 has run
                const checkedAt = item.last_checked_at || item.recorded_at;
                return {
                  name: item.retailer?.name || 'Unknown',
                  price: parseFloat(item.price) || 0,
                  currency: item.currency || 'AUD',
                  priceAUD: parseFloat(item.price_aud) || parseFloat(item.price) || 0,
                  inStock: item.in_stock !== false, // Default to true if null
                  url: item.product_url || item.retailer?.url || '#',
                  checkedAt,
                  checkedLabel: formatAge(checkedAt),
                  // Too old to quote a number for — we still link to the shop
                  priceHidden: shouldHidePrice(checkedAt),
                };
              });

            // Add eBay as a retailer if eBay link exists
            if (ebayLink) {
              const ebayPrice = parseFloat(ebayLink.ebay_price?.replace(/[^0-9.]/g, '') || '0');
              if (ebayPrice > 0) {
                // eBay links aren't part of the refresh cycle, so their age comes
                // from when the listing was last synced. Same staleness rules —
                // an old eBay price is no more trustworthy than an old shop price.
                const ebayCheckedAt = ebayLink.last_updated || null;
                retailers.push({
                  name: 'eBay',
                  price: ebayPrice,
                  currency: 'USD',
                  priceAUD: ebayPrice, // You may want to convert USD to AUD
                  inStock: true,
                  url: ebayLink.ebay_url,
                  checkedAt: ebayCheckedAt,
                  checkedLabel: formatAge(ebayCheckedAt),
                  priceHidden: shouldHidePrice(ebayCheckedAt),
                });
              }
            }

            return {
              ...variant,
              retailers: retailers,
              // "Cheapest" is the strongest claim on the page, so it may only
              // draw on prices we're still willing to quote — in stock, and
              // verified recently enough. A stale low price is the worst kind
              // of wrong: it sends someone to a shop where it costs more.
              lowestPrice: (() => {
                const quotable = retailers.filter((r: any) => r.inStock && !r.priceHidden);
                return quotable.length > 0
                  ? Math.min(...quotable.map((r: any) => r.priceAUD))
                  : null;
              })(),
            };
          })
        );

        setCarData(car);
        setVariants(variantsWithPrices);
      } catch (err) {
        console.error('Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchCarAndVariants();
  }, [carId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="max-w-[1240px] mx-auto px-8 py-16 text-center">
          <p className="text-[var(--text-tertiary)]">Loading...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (!carData) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <Navbar />
        <div className="max-w-[1240px] mx-auto px-8 py-16 text-center">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-4">
            Car Not Found
          </h1>
          <p className="text-[var(--text-tertiary)] mb-8">
            The car you're looking for doesn't exist.
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

  const driver = carData.driver;
  // Build title with event name as PRIMARY identifier
  const eventName = carData.event_name || 'Grand Prix';
  const masterTitle = `${eventName} - ${carData.chassis_name} - ${driver?.name} - ${carData.season?.year}`;

  // Filter variants by scale AND manufacturer
  let filteredVariants = variants;

  // First filter by scale
  if (selectedScale !== 'all') {
    filteredVariants = filteredVariants.filter((v: any) => v.scale === selectedScale);
  }

  // Then filter by manufacturer
  if (selectedManufacturer !== 'all') {
    filteredVariants = filteredVariants.filter((v: any) => v.manufacturers?.name === selectedManufacturer);
  }

  // Get unique scales and manufacturers for filters
  const scales = Array.from(
    new Set(variants.map((v: any) => v.scale).filter(Boolean))
  ) as string[];

  const manufacturers = Array.from(
    new Set(variants.map((v: any) => v.manufacturers?.name).filter(Boolean))
  ) as string[];

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Browse', href: '/browse' },
    { label: carData.team?.name || 'Team', href: `/browse?team=${encodeURIComponent(carData.team?.name || '')}` },
    { label: masterTitle, href: `/cars/${carId}` },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="max-w-[1240px] mx-auto px-8 py-8">
        <Breadcrumb items={breadcrumbItems} />

        {/* Master Release Header */}
        <div className="mt-8 mb-12">
          <p className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
            Master Release
          </p>
          <h1 className="font-display font-black text-5xl text-[var(--text-primary)] mb-6">
            {masterTitle}
          </h1>

          <div className="flex gap-8">
            {/* Main Image */}
            <div className="w-[400px] h-[300px] bg-[var(--surface)] rounded-lg overflow-hidden">
              <img
                src={variants.find((v: any) => v.image_url)?.image_url || '/placeholder.jpg'}
                alt={masterTitle}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Key Details */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Driver</p>
                  <p className="font-bold text-[var(--text-primary)]">{driver?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Team</p>
                  <p className="font-bold text-[var(--text-primary)]">{carData.team?.name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Season</p>
                  <p className="font-bold text-[var(--text-primary)]">{carData.season?.year || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Available Scales</p>
                  <p className="font-bold text-[var(--text-primary)]">{scales.join(', ') || '1:18'}</p>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Versions Section */}
        <div className="border-t border-[var(--border)] pt-8">
          {/* Scale Filter */}
          {scales.length > 1 && (
            <div className="mb-6">
              <p className="text-sm font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">
                Filter by Scale
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedScale('all')}
                  className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
                    selectedScale === 'all'
                      ? 'bg-[var(--accent)] text-white shadow-lg'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  All Scales
                </button>
                {scales.map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setSelectedScale(scale)}
                    className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
                      selectedScale === scale
                        ? 'bg-[var(--accent)] text-white shadow-lg'
                        : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {scale} Scale
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display font-black text-3xl text-[var(--text-primary)]">
              Versions ({filteredVariants.length})
            </h2>

            {/* Manufacturer Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedManufacturer('all')}
                className={`px-4 py-2 rounded-lg font-bold transition-all ${
                  selectedManufacturer === 'all'
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                All Manufacturers
              </button>
              {manufacturers.map((mfr) => (
                <button
                  key={mfr}
                  onClick={() => setSelectedManufacturer(mfr)}
                  className={`px-4 py-2 rounded-lg font-bold transition-all ${
                    selectedManufacturer === mfr
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {mfr}
                </button>
              ))}
            </div>
          </div>

          {/* Versions Table/List */}
          <div className="space-y-4">
            {filteredVariants.map((variant: any) => (
              <div
                key={variant.id}
                className="bg-[var(--surface)] rounded-lg p-6 border border-[var(--border)] hover:border-[var(--accent)] transition-all"
              >
                <div className="flex items-start justify-between">
                  {/* Manufacturer Info */}
                  <div className="flex-1">
                    <div className="mb-4">
                      {/* Manufacturer Logo */}
                      {variant.manufacturers?.name && getManufacturerLogo(variant.manufacturers.name) && (
                        <img
                          src={getManufacturerLogo(variant.manufacturers.name)}
                          alt={`${variant.manufacturers.name} logo`}
                          className="h-12 object-contain mb-2"
                        />
                      )}
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">
                        <span className="font-bold text-[var(--accent)]">{variant.scale} Scale</span> • SKU: {variant.manufacturer_sku}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {variant.manufacturers?.description || 'Premium diecast model'}
                      </p>
                    </div>

                    {/* Retailers */}
                    {variant.retailers && variant.retailers.length > 0 ? (
                      <div>
                        <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
                          🏪 Available At
                        </p>
                        <div className="space-y-2">
                          {variant.retailers.map((retailer: any, idx: number) => (
                            <a
                              key={idx}
                              href={retailer.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center justify-between bg-[var(--background)] px-4 py-2 rounded hover:bg-[var(--surface-hover)] transition-all group ${
                                !retailer.inStock ? 'opacity-50' : ''
                              }`}
                            >
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[var(--text-primary)]">
                                    {retailer.name}
                                  </span>
                                  {retailer.inStock ? (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                                      ✓ In Stock
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">
                                      ✗ Out of Stock
                                    </span>
                                  )}
                                </div>
                                {/* Freshness sits beside the number it qualifies */}
                                <span
                                  className={`text-[11px] ${
                                    freshnessOf(retailer.checkedAt) === 'fresh'
                                      ? 'text-[var(--text-tertiary)]'
                                      : 'text-amber-600'
                                  }`}
                                >
                                  Price checked {retailer.checkedLabel}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-black ${retailer.inStock ? 'text-[var(--accent)]' : 'text-gray-400'}`}>
                                  {retailer.priceHidden ? (
                                    <span className="text-sm font-semibold text-[var(--text-tertiary)]">
                                      Check price on site
                                    </span>
                                  ) : retailer.currency === 'AUD' ? (
                                    `AUD $${retailer.price.toFixed(2)}`
                                  ) : (
                                    <span>
                                      {retailer.currency} ${retailer.price.toFixed(2)}
                                      <span className="text-sm text-[var(--text-secondary)] ml-2">
                                        (~AUD ${retailer.priceAUD.toFixed(2)})
                                      </span>
                                    </span>
                                  )}
                                </span>
                                <span className={`${retailer.inStock ? 'text-[var(--text-tertiary)]' : 'text-gray-300'} group-hover:text-[var(--accent)] transition-colors`}>
                                  →
                                </span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--text-tertiary)] italic">
                        No retailers found for this variant
                      </p>
                    )}
                  </div>

                  {/* Lowest Price Badge */}
                  {variant.lowestPrice && (
                    <div className="ml-6 text-right">
                      <p className="text-xs text-[var(--text-tertiary)] mb-1">Lowest Price</p>
                      <p className="font-black text-3xl text-[var(--accent)]">
                        AUD {parseFloat(variant.lowestPrice).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredVariants.length === 0 && (
            <p className="text-center text-[var(--text-tertiary)] py-12">
              No variants found for this manufacturer.
            </p>
          )}

          {/* Say plainly where these numbers come from. Prices are parsed from
              retailer pages, which can change without notice — and the visitor
              always sees the real price on the shop's own site before paying. */}
          <div className="mt-10 pt-6 border-t border-[var(--border-light)]">
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-3xl">
              <strong className="text-[var(--text-secondary)]">About these prices.</strong>{' '}
              Prices and stock are collected automatically from each retailer&apos;s website and
              may be out of date or incorrect. Figures shown in AUD for non-Australian shops are
              approximate conversions and exclude shipping, duties and taxes. Always confirm the
              current price on the retailer&apos;s own site before purchasing — the price there is
              the one that applies.
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
