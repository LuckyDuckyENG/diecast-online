'use client';

import { useMemo, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { SavingRow } from '@/lib/savingsData';
import { slugify } from '@/lib/carSlug';

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

function Row({ r }: { r: SavingRow }) {
  return (
    <li className="border border-[var(--border-light)] rounded-xl p-4 hover:border-[var(--accent)] transition-colors">
      {/*
        TWO destinations, because the row answers two questions.
        The body goes to the car page, which is where the comparison lives and
        the reason the site exists. The shop name goes straight to the listing
        being quoted — without it the row names an exact model at an exact shop
        and then makes you open the car page, work out which scale and maker it
        meant, and find that shop in a list.
        A nested <a> inside a <Link> is invalid, so the body link wraps only
        the part that leads inward.
      */}
      <div className="flex gap-4 items-center">
        <Link
          href={r.carSlug ? `/cars/${r.carSlug}` : '#'}
          className="flex gap-4 items-center min-w-0 flex-1"
        >
        {r.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.imageUrl} alt="" loading="lazy"
            className="w-20 h-20 object-cover rounded-lg shrink-0 bg-[var(--border-light)]" />
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
            usually AUD {r.typical.toFixed(2)} across {r.shopCount} shops
          </p>
        </div>
        </Link>

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
        <div className="text-right shrink-0">
          <p className="font-display font-black text-xl text-[var(--text-primary)] whitespace-nowrap">
            AUD {r.price.toFixed(2)}
          </p>
          {/*
            rel matches what the car page sends: "sponsored" on eBay because
            those links are affiliate-tagged, plain noopener for a shop.
          */}
          <a
            href={r.url}
            target="_blank"
            rel={r.kind === 'ebay' ? 'sponsored noopener noreferrer' : 'noopener noreferrer'}
            className="text-xs text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:underline truncate max-w-[10rem] ml-auto block"
          >
            at {r.seller} ↗
          </a>
          <p className="mt-1.5 inline-block rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap">
            AUD {Math.round(r.saving)} below typical
          </p>
        </div>
      </div>
    </li>
  );
}

function Inner({ shop, ebay }: { shop: SavingRow[]; ebay: SavingRow[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [driver, setDriver] = useState('');

  // The URL is the source of truth, so a filtered view can be shared or linked.
  useEffect(() => { setDriver(params.get('driver') || ''); }, [params]);

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
          <ul className="space-y-3">{s.map(r => <Row key={`s-${r.modelId}`} r={r} />)}</ul>
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
          <ul className="space-y-3">{e.map(r => <Row key={`e-${r.modelId}`} r={r} />)}</ul>
        </section>
      )}
    </>
  );
}

export default function SavingsList(props: { shop: SavingRow[]; ebay: SavingRow[] }) {
  // useSearchParams needs a boundary, the same as /browse.
  return (
    <Suspense fallback={null}>
      <Inner {...props} />
    </Suspense>
  );
}
