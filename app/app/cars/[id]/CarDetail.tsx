'use client';

import Link from 'next/link';
import TeamColorFallback from '../../components/TeamColorFallback';

import { useState } from 'react';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import Breadcrumb from '../../components/Breadcrumb';
import { freshnessOf } from '@/lib/freshness';
import type { CarVariant } from '@/lib/carPageData';
import type { RelatedGroup } from '@/lib/relatedCars';
import RelatedCars from './RelatedCars';

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

/**
 * The interactive half of the car page.
 *
 * Data is fetched on the server and passed in, so the HTML a crawler receives
 * already contains the content. Only the scale/manufacturer filters need to be
 * client-side, and they operate on props rather than fetching anything.
 */
export default function CarDetail({
  car,
  variants,
  urlParam,
  related,
  hubLinks,
}: {
  car: any;
  variants: CarVariant[];
  urlParam: string;
  related: RelatedGroup[];
  hubLinks: { driver: string | null; team: string | null; season: string | null };
}) {
  const [selectedManufacturer, setSelectedManufacturer] = useState<string>('all');
  const [selectedScale, setSelectedScale] = useState<string>('all');

  // Names the moved-over JSX below still uses
  const carData = car;
  const carId = urlParam;

  const driver = carData.driver;
  // Build title with event name as PRIMARY identifier
  const eventName = carData.event_name || 'Grand Prix';
  const masterTitle = `${eventName} - ${carData.chassis_name} - ${driver?.name} - ${carData.season?.year}`;
  const heroImage = variants.find((v: any) => v.image_url)?.image_url || null;

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
    // Prefer the team hub over a ?team= filter — query-param URLs aren't indexed
    {
      label: carData.team?.name || 'Team',
      href: hubLinks.team || `/browse?team=${encodeURIComponent(carData.team?.name || '')}`,
    },
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
              {/* Fall back to the team-coloured panel rather than a placeholder
                  file — /placeholder.jpg never existed, so a car with no image
                  rendered a broken-image icon. Matches what ModelCard does. */}
              {heroImage ? (
                <img src={heroImage} alt={masterTitle} className="w-full h-full object-cover" />
              ) : (
                <TeamColorFallback
                  teamName={carData.team?.name || ''}
                  liveryName={carData.chassis_name || ''}
                  primaryColor={carData.team?.primary_color || '#cf2f2a'}
                  textColor={carData.team?.text_color || '#ffffff'}
                  eventName={eventName}
                />
              )}
            </div>

            {/* Key Details */}
            <div className="flex-1">
              <div className="grid grid-cols-2 gap-4">
                {/* Linked to their hub pages where one exists, so a visitor can
                    go from one car to everything by that driver, team or season.
                    Also gives crawlers a path upward, not just sideways. */}
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Driver</p>
                  {hubLinks.driver ? (
                    <Link
                      href={hubLinks.driver}
                      className="font-bold text-[var(--accent)] hover:underline"
                    >
                      {driver?.name}
                    </Link>
                  ) : (
                    <p className="font-bold text-[var(--text-primary)]">{driver?.name || 'Unknown'}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Team</p>
                  {hubLinks.team ? (
                    <Link
                      href={hubLinks.team}
                      className="font-bold text-[var(--accent)] hover:underline"
                    >
                      {carData.team?.name}
                    </Link>
                  ) : (
                    <p className="font-bold text-[var(--text-primary)]">{carData.team?.name || 'Unknown'}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-[var(--text-tertiary)] mb-1">Season</p>
                  {hubLinks.season ? (
                    <Link
                      href={hubLinks.season}
                      className="font-bold text-[var(--accent)] hover:underline"
                    >
                      {carData.season?.year}
                    </Link>
                  ) : (
                    <p className="font-bold text-[var(--text-primary)]">{carData.season?.year || 'Unknown'}</p>
                  )}
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
                                  {retailer.isSecondary ? (
                                    /* eBay is a used/auction market, not a shop.
                                       Saying "In Stock" would imply retail
                                       availability it doesn't have. */
                                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                                      Secondary market
                                    </span>
                                  ) : retailer.inStock ? (
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
                                  {retailer.isSecondary
                                    ? `One seller's listing · checked ${retailer.checkedLabel}`
                                    : `Price checked ${retailer.checkedLabel}`}
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

          <RelatedCars groups={related} />

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
