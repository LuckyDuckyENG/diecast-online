'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SavingRow } from '@/lib/savingsData';
import { slugify } from '@/lib/carSlug';
import { logClick } from '@/lib/logClick';
import { useCurrency } from '@/app/components/CurrencyProvider';

/**
 * The driver filter, and why this page needs one when /browse already sorts.
 *
 * /browse can sort a driver's cars price low to high. That answers "which
 * Leclerc is cheapest", which is a different question and mostly returns his
 * cheapest MODELS — the 1:43s and the Bburagos. This page answers "which
 * Leclerc is furthest below what it normally costs", which can put a AUD 400
 * Looksmart at the top precisely because it usually costs AUD 500.
 *
 * Sorting cannot express that, so the filter is what stops the page collapsing
 * into a worse version of browse.
 *
 * A dropdown rather than chips: 21 drivers have rows and 10 of them have
 * exactly one, so chips would either wrap into a wall or hide the long tail.
 * Every driver stays reachable.
 */

/**
 * Rows rendered before "Show more", per section.
 *
 * Lower than browse's 48 because these are full-width list rows rather than
 * grid cards — a phone shows two or three at a time, so Baymard's 15-30
 * mobile figure lands at the bottom of its range rather than the top.
 *
 * It also fixes something else. The two sections are never merged, because a
 * retail price and a used asking price are different kinds of number — but
 * that left "Cheaper on eBay" sitting below 208 shop rows, which on a phone
 * is a scroll nobody completes. Those 91 eBay rows are the affiliate half.
 * Capping the first section puts the second one a screen away instead.
 */
const PAGE = 24;

/** One section's worth of rows, with its own Show more. */
function RowList({ rows, prefix }: { rows: SavingRow[]; prefix: string }) {
  const [shown, setShown] = useState(PAGE);
  // Back to the top of the list when the driver filter changes it.
  useEffect(() => { setShown(PAGE); }, [rows.length]);
  const visible = rows.slice(0, shown);
  const remaining = rows.length - visible.length;
  return (
    <>
      <ul className="space-y-3">
        {visible.map(r => <Row key={`${prefix}-${r.modelId}`} r={r} />)}
      </ul>
      {remaining > 0 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => setShown(s => s + PAGE)}
            className="rounded-lg bg-[var(--accent)] px-6 py-3 font-bold text-white hover:brightness-[0.92] transition-all"
          >
            Show more
          </button>
          <p className="text-sm text-[var(--text-tertiary)]">
            Showing {visible.length} of {rows.length}
          </p>
        </div>
      )}
    </>
  );
}

function Row({ r }: { r: SavingRow }) {
  // Every figure on this page is an AUD amount from the database, so all three
  // follow the reader's currency. The shop's own quoted price is not shown
  // here -- this page is about the gap, not the till.
  const { format: money, amount: inCurrency, code: moneyCode } = useCurrency();
  return (
    <li className="border border-[var(--border-light)] rounded-xl p-4 hover:border-[var(--accent)] transition-colors">
      {/*
        TWO destinations, and the BODY GOES TO THE SHOP.

        It used to be the other way round: the image, title and comparison
        line — the whole left side, flex-1 — linked to the car page, while the
        shop was twelve pixels of text on the right. On a desktop you can aim
        at that. On a phone you cannot, so every tap landed on the car page,
        which is the one destination this page's visitor did not ask for.

        The premise of the row decides it. It says "this exact model is AUD 70
        below what it usually costs, at this exact shop", and it already
        summarises the comparison inline — "usually AUD 389 across 5 shops".
        The question it leaves is "where", and the answer is the shop.

        The car page is still one tap away, as an explicit link rather than an
        accidental one. 71% of visitors are on a phone and this is the page
        whose entire subject is acting on a price.
      */}
      {/*
        STACKS BELOW sm, BECAUSE THREE COLUMNS DO NOT FIT A PHONE.

        At 360px: 296px survives the page and row padding, the image takes 80
        and the gap 16, and the price column needs ~125 because "AUD 70 below
        typical" is whitespace-nowrap. That leaves 75px for the title, the
        scale-and-race line and "usually AUD 389 across 5 shops" — all three
        of which are `truncate`, so they were being chopped to a few
        characters each. The row's entire content is those three lines.

        Stacked, the text gets the full width and the price block sits under
        it on its own line. Unchanged from sm up.
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-center">
        <a
          href={r.url}
          onClick={() => logClick({
            modelId: r.modelId,
            carSlug: r.carSlug,
            retailer: r.seller,
            kind: r.kind === 'ebay' ? 'ebay' : 'shop',
            priceAud: r.price,
            // Every row on this page IS the cheapest found for its model --
            // that is the page's whole premise.
            wasCheapest: true,
            // Without this, a click here is indistinguishable from one on the
            // car's own page: both write that car's slug. This is the field
            // that will say whether /savings earns its place.
            source: 'savings',
          })}
          target="_blank"
          rel={r.kind === 'ebay' ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
          className="flex gap-4 items-center min-w-0 flex-1"
        >
        {r.imageUrl ? (
          /**
           * No "eBay listing photo" caption here, unlike the cards: at 80px it
           * would be illegible, and it would also be redundant. A model with no
           * retailer has no shop prices, so it can only ever reach the eBay
           * section, and those rows already say they are eBay listings.
           *
           * Contained rather than cropped though, for the same reason as the
           * cards -- a seller's photo is not framed for a square.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.imageUrl} alt="" loading="lazy"
            className={`w-20 h-20 rounded-lg shrink-0 bg-[var(--border-light)] ${
              r.imageFromEbay ? 'object-contain' : 'object-cover'
            }`} />
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
          {/*
            The comparison, not the price. The price lives on the right where a
            reader looks for it; repeating it here is what made the row read as
            two competing figures.
          */}
          <p className="text-sm text-[var(--text-tertiary)] mt-1 truncate">
            usually {money(r.typical)} across {r.shopCount} shops
          </p>
        </div>
        </a>

        {/*
          THE PRICE IS THE BIG NUMBER, not the saving.

          It was the other way round, and at a glance "−AUD 320" read as the
          cost of the model — the largest, boldest figure on the row, in the
          same accent as the real price it sat beside. The number a buyer acts
          on is what they would pay, so that is the one that gets the weight.

          The saving keeps its own line underneath, worded rather than signed:
          "AUD 320 below typical" cannot be misread as a price the way "−AUD
          320" can. Still never "save AUD 320" — postage is not in the data.
        */}
        <div className="shrink-0 sm:text-right">
          {/*
            Price and saving share a line on a phone, where there is width to
            spare once stacked, and go back to stacked from sm — which is the
            desktop arrangement that put the price above the pill deliberately.
          */}
          <div className="flex items-center gap-3 sm:block">
            <p className="font-display font-black text-xl text-[var(--text-primary)] whitespace-nowrap">
              {money(r.price)}
            </p>
            <p className="inline-block rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap sm:mt-1.5">
              {moneyCode} {Math.round(inCurrency(r.saving))} below typical
            </p>
          </div>
          {/*
            Not a link any more — the whole row is. Saying where it goes is
            still essential: the row states a saving outright, 47% of cheapest
            offers are Belgian and 28% Chinese, and postage is not in the data.
            The origin is the one fact that stops "AUD 70 below typical"
            implying a comparison postage may reverse. Stated, never warned
            about. The arrow marks that the row leaves the site.

            max-w only from sm: stacked on a phone it has the full width and
            does not need truncating, and "Miniatures Minichamps (BE)" is
            exactly the kind of name that loses its country to an ellipsis.
          */}
          <p className="text-xs text-[var(--text-tertiary)] truncate sm:max-w-[10rem] sm:ml-auto">
            at {r.seller}
            {r.region ? ` (${r.region.toUpperCase()})` : ''} ↗
          </p>
        </div>
      </div>

      {/*
        The way back in, explicit rather than accidental.
        It cannot live inside the row above — that is one big anchor to the
        shop now, and an <a> inside an <a> is invalid — so it sits underneath
        on its own line with a thumb-sized target.
      */}
      {r.carSlug && (
        <Link
          href={`/cars/${r.carSlug}`}
          className="mt-2 inline-block py-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:underline"
        >
          Compare all prices for this model →
        </Link>
      )}
    </li>
  );
}

export default function SavingsList({ shop, ebay }: { shop: SavingRow[]; ebay: SavingRow[] }) {
  const router = useRouter();
  const [driver, setDriver] = useState('');

  /**
   * The URL is read here, not with useSearchParams, and that is the whole
   * point.
   *
   * useSearchParams makes Next bail out of prerendering the component. Wrapped
   * in the Suspense boundary it then requires, the STATIC HTML CONTAINS
   * NOTHING — the live page shipped with zero rows, no sections, not even the
   * empty-state line, and only filled in after hydration. Invisible to a
   * crawler, on the one page whose content is the reason it would rank.
   *
   * /browse has the same defect and has had it all along; its own comment
   * claims "the grid and its links are in the HTML before any JavaScript
   * runs", and in production that is false. There the sitemap covers for it by
   * listing every car URL directly. Nothing covers for this page.
   *
   * Reading window.location in an effect keeps the URL working — shareable
   * links, back button — while letting the whole list prerender. The effect
   * runs after paint, so an unfiltered page is what a crawler sees, which is
   * also the honest thing to serve.
   */
  useEffect(() => {
    const read = () =>
      setDriver(new URLSearchParams(window.location.search).get('driver') || '');
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const drivers = useMemo(() => {
    const tally = new Map<string, { name: string; n: number }>();
    for (const r of [...shop, ...ebay]) {
      if (!r.driver) continue;
      const slug = slugify(r.driver);
      const cur = tally.get(slug);
      if (cur) cur.n++;
      else tally.set(slug, { name: r.driver, n: 1 });
    }
    return [...tally].map(([slug, v]) => ({ slug, ...v })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }, [shop, ebay]);

  const keep = (rows: SavingRow[]) =>
    driver ? rows.filter(r => r.driver && slugify(r.driver) === driver) : rows;

  const s = keep(shop);
  const e = keep(ebay);

  const choose = (slug: string) => {
    setDriver(slug);
    router.replace(slug ? `/savings?driver=${slug}` : '/savings', { scroll: false });
  };

  const chosen = drivers.find(d => d.slug === driver);

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <label htmlFor="driver" className="text-sm font-semibold text-[var(--text-secondary)]">
          Driver
        </label>
        <select
          id="driver"
          value={driver}
          onChange={ev => choose(ev.target.value)}
          className="rounded-lg border border-[var(--border-medium)] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <option value="">Every driver ({shop.length + ebay.length})</option>
          {drivers.map(d => (
            <option key={d.slug} value={d.slug}>{d.name} ({d.n})</option>
          ))}
        </select>
        {driver && (
          <button
            type="button"
            onClick={() => choose('')}
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {driver && s.length + e.length === 0 && (
        <p className="mt-8 text-[var(--text-secondary)]">
          Nothing for {chosen?.name || 'that driver'} is far enough below its usual
          price today.
        </p>
      )}

      {s.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)] mb-1">
            Cheaper at a shop
          </h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            {s.length} {s.length === 1 ? 'model' : 'models'} a retailer is selling below the usual price.
          </p>
          <RowList rows={s} prefix="s" />
        </section>
      )}

      {e.length > 0 && (
        <section className="mt-12">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-[var(--text-primary)] mb-1">
            Cheaper on eBay
          </h2>
          {/*
            Never merged with the shop list. A retail price and a used asking
            price are different kinds of number — the same reason the car page
            carries two ranges rather than one.
          */}
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            {e.length} {e.length === 1 ? 'model' : 'models'} listed on eBay below what the
            shops charge. A used or private sale — check condition and postage
            before comparing.
          </p>
          <RowList rows={e} prefix="e" />
        </section>
      )}
    </>
  );
}
