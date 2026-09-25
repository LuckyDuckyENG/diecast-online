import { Metadata } from 'next';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getAboutStats } from '@/lib/aboutStats';

export const metadata: Metadata = {
  title: 'About | Diecasts',
  description:
    'Who built the F1 diecast price index, where the prices come from, and what the site will not tell you.',
};

/**
 * Daily, not hourly. The counts move when a season is imported, which is
 * weeks apart, and every hub page reading the whole database hourly is what
 * exceeded the Supabase egress quota on 2026-09-22.
 */
export const revalidate = 86400;

export default async function AboutPage() {
  const s = await getAboutStats();
  const n = (x: number) => x.toLocaleString('en-AU');

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <Navbar />

      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="font-display font-black text-[44px] md:text-[56px] leading-[1.05] tracking-tight text-[var(--text-primary)] mb-10">
          About
        </h1>

        {/*
          ELIAS'S WORDS. Not edited here — if this needs changing, it is his
          change to make. The sections below are the mechanical parts he should
          not have to write or keep up to date.
        */}
        <div className="space-y-5 text-[17px] leading-[1.7] text-[var(--text-secondary)]">
          <p>
            Hi there everyone. My name is Elias Nowak-Green, and I am a diecast
            collector. I have been collecting models since I was 11 years old, and
            my first ever F1 model was Ayrton Senna&rsquo;s McLaren MP4/4 from the
            1988 season.
          </p>
          <p>
            I go searching for hours trying to go through eBay or other sites,
            finding models that I want for my shelf, but it is always so hard to
            find all the listings and see what the best price is for that model.
            What just started as a cool idea of mine, something I felt deep down as
            a collector, turned into a real site with thousands of models, and one
            page that puts all of the listings together.
          </p>
          <p>
            My goal is adding as many models as possible from every year since
            1950, when Formula One as we know it was established. But that is not
            going to be easy. Yes, I have built the infrastructure to get models in
            myself, but I know I will be missing some. If you spot a model that
            isn&rsquo;t here,{' '}
            <Link href="/contact" className="text-[var(--accent)] underline hover:no-underline">
              tell me
            </Link>
            . That is genuinely the most useful thing you can do. I believe with
            having a community, we can make this work.
          </p>
          <p>
            Thank you all for reading, and I hope this site is for you.
          </p>
          <p className="text-[var(--text-tertiary)]">
            If you want to see my progress on this project and the videos that I
            make, find me on TikTok at{' '}
            <a
              href="https://www.tiktok.com/@elias.nowakgreen"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] underline hover:no-underline"
            >
              @elias.nowakgreen
            </a>
            .
          </p>
        </div>

        {/*
          Everything below is generated. The old page typed "four seasons from
          2021 to 2024" and was still saying it when the catalogue held thirty
          seasons and three thousand models.
        */}
        <h2 className="font-display font-bold text-[28px] text-[var(--text-primary)] mt-14 mb-4">
          What&rsquo;s in it
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          {[
            [n(s.cars), 'cars'],
            [n(s.models), 'models'],
            [String(s.seasons), 'seasons'],
            [s.firstYear && s.lastYear ? `${s.firstYear} to ${s.lastYear}` : '', 'covered'],
          ].map(([big, small]) => (
            <div key={small} className="rounded-xl border border-[var(--border-light)] p-4">
              <p className="font-display font-black text-2xl text-[var(--text-primary)]">{big}</p>
              <p className="text-sm text-[var(--text-tertiary)]">{small}</p>
            </div>
          ))}
        </div>
        <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)]">
          Prices come from <strong>{s.shops} shops</strong>{' '}that have supplied
          at least one. That is {n(s.shopPrices)} retailer prices and{' '}
          {n(s.ebayListings)} eBay listings. The same model often costs very
          different money in different places: a 1:18 Looksmart Hamilton has been
          AUD 419 at one shop and AUD 1,036 at another on the same day.
        </p>

        <h2 className="font-display font-bold text-[28px] text-[var(--text-primary)] mt-12 mb-4">
          How the prices work
        </h2>
        <ul className="space-y-3 text-[17px] leading-[1.7] text-[var(--text-secondary)] list-disc pl-5">
          <li>
            Every price is read from the shop&rsquo;s own product page, not from a
            single affiliate feed.
          </li>
          <li>
            <strong>Nothing older than 30 days is quoted.</strong> A price that has
            not been re-checked in a month is hidden rather than shown, because a
            stale price is worse than no price.
          </li>
          <li>
            Foreign prices are converted to AUD using real exchange rates at the
            moment you read the page, so a shop is not made to look cheap by an old
            conversion.
          </li>
          <li>
            Sold-out listings still appear. Knowing a model exists, and what it
            went for, is worth something even when nobody has one today.
          </li>
        </ul>

        <h2 className="font-display font-bold text-[28px] text-[var(--text-primary)] mt-12 mb-4">
          What it won&rsquo;t tell you
        </h2>
        <ul className="space-y-3 text-[17px] leading-[1.7] text-[var(--text-secondary)] list-disc pl-5">
          <li>
            <strong>Postage is not included.</strong> A cheaper model from further
            away can easily end up costing more, so always check shipping before
            deciding.
          </li>
          <li>
            <strong>eBay figures are asking prices, not sold prices.</strong> They
            say what a seller wants, not what anyone paid.
          </li>
          <li>
            Condition varies on the secondary market, and a used model is not the
            same thing as a new one even when the part number matches.
          </li>
        </ul>

        <h2 className="font-display font-bold text-[28px] text-[var(--text-primary)] mt-12 mb-4">
          How this is paid for
        </h2>
        <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)]">
          Some links to eBay are affiliate links, which means I may earn a small
          commission if you buy through one. It costs you nothing extra. It does
          not change which price is shown as cheapest either. The ranking is done
          on price alone, and shop links carry no commission at all.
        </p>

        <div className="mt-14 rounded-xl border border-[var(--border-light)] p-6">
          <p className="text-[17px] leading-[1.7] text-[var(--text-secondary)]">
            Found a model that isn&rsquo;t here, or a price that looks wrong?{' '}
            <Link href="/contact" className="text-[var(--accent)] underline hover:no-underline">
              Get in touch
            </Link>
            . If you sell F1 diecast,{' '}
            <Link href="/retailers" className="text-[var(--accent)] underline hover:no-underline">
              there&rsquo;s a page for you too
            </Link>
            .
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
