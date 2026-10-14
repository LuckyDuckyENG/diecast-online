import type { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import Breadcrumb from '../components/Breadcrumb';
import { getShops, COUNTRY } from '@/lib/shopsData';

/**
 * Which shops this site reads, and what is inside their prices.
 *
 * Asked for on r/Diecast: "If there an easy way to see what retailers your
 * following so we can potentially suggest others?" The existing /retailers
 * page is the opposite thing, a pitch TO shops.
 *
 * Worth more than it looks. The same thread produced spr-models.co.nz, which
 * now holds the cheapest price on 90 models and beat all 47 shops already
 * indexed. That arrived because somebody volunteered it, and until this page
 * existed there was nowhere to see what was already covered.
 */
// One day, matching every other data-backed page here.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: 'Every shop we check for F1 model prices',
  description:
    'The diecast retailers diecasts.app reads prices from, with the country ' +
    'each ships from and whether the listed price already includes sales tax.',
  alternates: { canonical: '/shops' },
};

export default async function ShopsPage() {
  const { shops, totalPrices } = await getShops();

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto w-full px-5 py-10">
        <Breadcrumb items={[{ label: 'Shops', href: '/shops' }]} />

        <h1 className="font-display font-black text-3xl sm:text-4xl text-[var(--text-primary)] mb-3">
          Where the prices come from
        </h1>
        <p className="text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          {shops.length} shops, {totalPrices.toLocaleString()} prices. Every figure on this
          site is read from one of these and linked straight back to it, so the
          price there is always the one that applies.
        </p>

        {/*
          The tax rule, stated once here rather than only as a label on
          individual prices. It is the thing a cross-border buyer most needs
          and the thing a price-comparison site is most likely to get wrong.
        */}
        <p className="mt-4 text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          Prices are shown exactly as each shop lists them. European, British and
          Australian shops are required to show consumer prices with sales tax
          already included, so those figures contain it. Shipping and any import
          duty are extra.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
                <th className="py-2 pr-4 font-semibold">Shop</th>
                <th className="py-2 pr-4 font-semibold">Ships from</th>
                <th className="py-2 pr-4 font-semibold">Prices in</th>
                <th className="py-2 pr-4 font-semibold">Tax included</th>
                <th className="py-2 font-semibold text-right">Models tracked</th>
              </tr>
            </thead>
            <tbody>
              {shops.map(s => (
                <tr key={s.name} className="border-b border-[var(--border-light)]">
                  <td className="py-2.5 pr-4 font-semibold text-[var(--text-primary)]">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-[var(--accent)] hover:underline"
                      >
                        {s.name}
                      </a>
                    ) : s.name}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                    {s.region ? COUNTRY[s.region] ?? s.region : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--text-secondary)] tabular-nums">
                    {s.currency ?? '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-[var(--text-secondary)]">
                    {/*
                      Null renders a dash, never "0%". We have established a
                      rate for some shops and not others, and saying "no tax"
                      about a shop nobody has checked would be a claim rather
                      than a blank. See 025_retailer_vat.sql.
                    */}
                    {s.vatRate == null ? '—' : `${s.vatRate}%`}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {s.prices.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*
          The ask, and the whole reason the page is worth building. A reader
          who collects seriously knows shops we do not, and SPR Models is the
          proof: recommended in a comment, and now the cheapest option on 90
          models.
        */}
        <div className="mt-10 p-5 rounded-xl border border-[var(--border-light)] bg-[var(--surface,#fff)]">
          <h2 className="font-display font-bold text-lg text-[var(--text-primary)] mb-2">
            Know one that is missing?
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Please tell me. The last shop someone suggested turned out to be cheaper
            than every one of the 47 already listed, on 90 different models. There is
            no arrangement with any shop here and nothing is paid for a place on this
            list.{' '}
            <Link href="/contact" className="text-[var(--accent)] font-semibold hover:underline">
              Send it through
            </Link>
            .
          </p>
        </div>

        <p className="mt-8 text-xs text-[var(--text-tertiary)] leading-relaxed">
          <strong className="text-[var(--text-secondary)]">About these counts.</strong>{' '}
          &quot;Models tracked&quot; is how many prices we hold from that shop, not how
          much it stocks. A shop appears here once we read at least one price from it.
          Prices are re-checked periodically and anything older than 30 days stops
          being quoted.
        </p>
      </main>
      <Footer />
    </div>
  );
}
