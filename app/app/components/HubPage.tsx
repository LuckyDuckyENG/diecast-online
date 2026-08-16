import Navbar from './Navbar';
import Footer from './Footer';
import Breadcrumb from './Breadcrumb';
import ModelCard from './ModelCard';
import type { HubData } from '@/lib/hubData';

/**
 * Shared layout for driver, team and season hubs.
 *
 * The summary line matters as much as the grid: a hub that's only cards has
 * nothing to rank on and nothing to tell a visitor. Stating the count, the
 * manufacturers, the scales and the cheapest price is the thing no individual
 * retailer can say, because each only stocks a fraction of the range.
 */
export default function HubPage({
  hub,
  breadcrumb,
  summary,
}: {
  hub: HubData;
  breadcrumb: { label: string; href: string }[];
  summary: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="max-w-[1440px] mx-auto px-8 py-8">
        <Breadcrumb items={breadcrumb} />

        <div className="mb-10 max-w-3xl">
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] mb-4">
            {hub.title}
          </h1>
          <p className="text-[var(--text-secondary)] leading-relaxed">{summary}</p>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 text-sm text-[var(--text-tertiary)]">
            <span>
              <strong className="text-[var(--text-primary)]">{hub.cars.length}</strong> cars
            </span>
            {hub.manufacturers.length > 0 && (
              <span>
                <strong className="text-[var(--text-primary)]">{hub.manufacturers.length}</strong>{' '}
                manufacturers
              </span>
            )}
            {hub.scales.length > 0 && <span>{hub.scales.join(' · ')}</span>}
            {hub.lowestPrice !== null && (
              <span>
                from{' '}
                <strong className="text-[var(--accent)]">AUD ${hub.lowestPrice.toFixed(2)}</strong>
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-5">
          {hub.cars.map(car => (
            <ModelCard key={car.id} {...car} />
          ))}
        </div>

        <div className="mt-12 pt-6 border-t border-[var(--border-light)]">
          <p className="text-xs text-[var(--text-tertiary)] leading-relaxed max-w-3xl">
            <strong className="text-[var(--text-secondary)]">About these prices.</strong> Prices and
            stock are collected automatically from each retailer&apos;s website and may be out of
            date or incorrect. Figures shown in AUD for non-Australian shops are approximate
            conversions and exclude shipping, duties and taxes. Always confirm the current price on
            the retailer&apos;s own site before purchasing.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
