import type { Metadata } from 'next';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Breadcrumb from '../components/Breadcrumb';
import SavingsList from './SavingsList';
import { getSavings } from '@/lib/savingsData';

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
 *
 * The rows are fetched here so the list is in the server-rendered HTML; only
 * the driver filter needs to be interactive, and it works over props.
 */
// One day, not one hour — see the note in app/sitemap.ts.
// Hourly revalidation of pages that each read the whole dataset is what
// exceeded the Supabase egress quota on 2026-09-22.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Best F1 diecast prices right now — below the going rate',
  description:
    'F1 model cars currently selling well below what they normally cost, ' +
    'compared against the typical price across every shop we track.',
  alternates: { canonical: '/savings' },
};

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

        {shop.length === 0 && ebay.length === 0 ? (
          <p className="mt-10 text-[var(--text-secondary)]">
            Nothing is far enough below its usual price to be worth flagging today.
          </p>
        ) : (
          <SavingsList shop={shop} ebay={ebay} />
        )}

        <p className="mt-12 text-xs text-[var(--text-tertiary)] leading-relaxed">
          <strong className="text-[var(--text-secondary)]">About these numbers.</strong>{' '}
          Prices are checked periodically and shown in Australian dollars, converted
          at daily reference rates. They exclude shipping, duties and taxes, so a
          smaller difference may not survive postage. A model only appears here when
          at least three shops sell it — fewer than that and there is no typical
          price to be below.
        </p>
        {/*
          Said plainly because it is the limit a buyer is most likely to be
          caught by, and the one the data genuinely cannot see. eBay tells us
          New or Used and nothing else — not whether the box is missing, the
          model is dusty, or a wing is broken. A cheap used row may be cheap
          for a reason no feed reports.
        */}
        <p className="mt-3 text-xs text-[var(--text-tertiary)] leading-relaxed">
          <strong className="text-[var(--text-secondary)]">What we cannot see.</strong>{' '}
          eBay reports only whether a listing is new or used. It says nothing about
          a missing box, display wear, dust or damage, and any of those can be why
          one is cheaper. Read the listing before comparing it with a boxed model
          from a shop. Always confirm on the seller&rsquo;s own page.
        </p>
      </main>
      <Footer />
    </div>
  );
}
