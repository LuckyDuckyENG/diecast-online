import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Breadcrumb from '../components/Breadcrumb';
import { getSavings, type SavingRow } from '@/lib/savingsData';

/**
 * The site's claim, stated on one page.
 *
 * Every car page already shows that a model costs different money in different
 * places. Finding the big gaps meant opening 777 of them. This collects the
 * ones worth knowing about.
 *
 * It is also the only page here that can be POSTED rather than merely
 * published — "these twelve F1 models are well under the going rate" is a
 * thing someone shares, which matters when the constraint is that nobody knows
 * the site exists.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Best F1 diecast prices right now — below the going rate',
  description:
    'F1 model cars currently selling well below what they normally cost, ' +
    'compared against the typical price across every shop we track.',
  alternates: { canonical: '/savings' },
};

function Row({ r }: { r: SavingRow }) {
  return (
    <li className="border border-[var(--border-light)] rounded-xl p-4 hover:border-[var(--accent)] transition-colors">
      <Link href={r.carSlug ? `/cars/${r.carSlug}` : '#'} className="flex gap-4 items-center">
        {r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={r.imageUrl}
            alt=""
            loading="lazy"
            className="w-20 h-20 object-cover rounded-lg shrink-0 bg-[var(--border-light)]"
          />
        ) : (
          <div className="w-20 h-20 rounded-lg shrink-0 bg-[var(--border-light)]" />
        )}

        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-[var(--text-primary)] truncate">
            {r.year} {r.driver}
          </p>
          <p className="text-sm text-[var(--text-tertiary)] truncate">
            {r.label}
            {r.event ? ` · ${r.event}` : ''}
            {r.condition ? ` · ${r.condition}` : ''}
          </p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            <strong className="text-[var(--accent)]">AUD {r.price.toFixed(2)}</strong>
            {' at '}{r.seller}
            <span className="text-[var(--text-tertiary)]">
              {' · typically AUD '}{r.typical.toFixed(2)}{' across '}{r.shopCount}{' shops'}
            </span>
          </p>
        </div>

        {/*
          "below typical", never "save AUD X". Postage is not in the data, so a
          saving cannot be promised — the same wording rule the car page uses
          for its two price ranges.
        */}
        <div className="text-right shrink-0">
          <p className="font-display font-black text-xl text-[var(--accent)] whitespace-nowrap">
            −AUD {Math.round(r.saving)}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
            {(r.pct * 100).toFixed(0)}% below typical
          </p>
        </div>
      </Link>
    </li>
  );
}

export default async function SavingsPage() {
  const { shop, ebay } = await getSavings();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-10">
        <Breadcrumb items={[{ label: 'Best prices', href: '/savings' }]} />

        <h1 className="font-display font-black text-3xl sm:text-4xl text-[var(--text-primary)] mb-3">
          Below the going rate
        </h1>
        <p className="text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          The same model costs different money in different places. These are the
          ones currently well under what they normally go for — measured against
          the <strong>typical</strong> price across every shop we track selling
          that exact model, not against the most expensive one.
        </p>

        {shop.length === 0 && ebay.length === 0 && (
          <p className="mt-10 text-[var(--text-secondary)]">
            Nothing is far enough below its usual price to be worth flagging today.
          </p>
        )}

        {shop.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)] mb-1">
              Cheaper at a shop
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              {shop.length} models a retailer is selling below the usual price.
            </p>
            <ul className="space-y-3">
              {shop.map(r => <Row key={`s-${r.modelId}`} r={r} />)}
            </ul>
          </section>
        )}

        {ebay.length > 0 && (
          <section className="mt-12">
            <h2 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)] mb-1">
              Cheaper on eBay
            </h2>
            {/*
              Kept separate, never merged into one list. A shop price and a used
              asking price are different kinds of number — the same reason the
              car page carries two ranges rather than one.
            */}
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              {ebay.length} models listed on eBay below what the shops charge. A
              used or private sale — check condition and postage before comparing.
            </p>
            <ul className="space-y-3">
              {ebay.map(r => <Row key={`e-${r.modelId}`} r={r} />)}
            </ul>
          </section>
        )}

        <p className="mt-12 text-xs text-[var(--text-tertiary)] leading-relaxed">
          <strong className="text-[var(--text-secondary)]">About these numbers.</strong>{' '}
          Prices are checked periodically and shown in Australian dollars, converted
          at daily reference rates. They exclude shipping, duties and taxes, so a
          smaller difference may not survive postage. A model only appears here when
          at least three shops sell it — fewer than that and there is no typical
          price to be below. Always confirm on the retailer&rsquo;s own page.
        </p>
      </main>
      <Footer />
    </div>
  );
}
