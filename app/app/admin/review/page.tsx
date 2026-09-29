'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The eBay review queue.
 *
 * Deliberately a separate page rather than another panel in ebay-linking,
 * which is past 7,000 lines. This one does one thing, and the thing it does is
 * a judgement call repeated a few hundred times, so the only design goal is
 * that a single candidate can be read and decided without scrolling.
 *
 * What is on screen is what the decision needs:
 *
 *   - the MODEL, in full. A title saying "Winner Brazilian GP 2013" is only
 *     judgeable against what the model actually is. Season, team, chassis,
 *     driver, event, scale, maker and part number.
 *   - the LISTING, with its photo. Most wrong matches are obvious on sight.
 *   - the REASON it was not trusted to link itself.
 *   - the PRICE beside what this model already costs elsewhere, because a
 *     candidate at four times the median is a different question.
 *   - how many links the model ALREADY has. A third listing is worth less
 *     than a first, and skipping a marginal third is cheap.
 */

type Candidate = {
  id: string;
  model_id: string;
  ebay_item_id: string;
  ebay_url: string | null;
  ebay_title: string | null;
  ebay_image: string | null;
  price_aud: number | null;
  currency: string | null;
  marketplace: string | null;
  item_condition: string | null;
  seller: string | null;
  tier: string | null;
  reason: string | null;
  found_at: string;
  model: {
    scale: string | null;
    sku: string | null;
    manufacturer: string | null;
    year: number | null;
    team: string | null;
    chassis: string | null;
    driver: string | null;
    event: string | null;
    carSlug: string | null;
  } | null;
  peerPrices: { n: number; min: number | null; median: number | null; max: number | null };
  existingLinks: number;
};

const money = (n: number | null) => (n == null ? '--' : `AUD ${Math.round(n)}`);

const age = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'today';
  return `${Math.round(d)}d ago`;
};

export default function ReviewQueuePage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState({ pending: 0, accepted: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which rows are mid-decision, so a double tap cannot fire twice.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/review-candidates?status=pending', {
        cache: 'no-store',
      });
      // Checked before parsing: a stale dev routing table answers /api/admin/*
      // with the site's HTML 404 page, and .json() on that reports only
      // "Unexpected token '<'". Restarting the dev server is the fix.
      if (!res.ok) throw new Error(`/api/admin/review-candidates returned ${res.status}`);
      const data = await res.json();
      setMigrationMissing(!!data.migrationMissing);
      if (data.migrationMissing) setError(data.error);
      setCandidates(data.candidates || []);
      setCounts(data.counts || { pending: 0, accepted: 0, rejected: 0 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, action: 'accept' | 'reject') => {
    setBusy(prev => new Set(prev).add(id));
    try {
      const res = await fetch('/api/admin/review-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `returned ${res.status}`);
      if (data?.warning) console.warn(data.warning);
      /**
       * Removed from the list here rather than by reloading. The queue is
       * hundreds of rows and re-fetching after every decision would make the
       * work feel like waiting; the counts are adjusted locally for the same
       * reason.
       */
      setCandidates(prev => prev.filter(c => c.id !== id));
      setCounts(prev => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        accepted: prev.accepted + (action === 'accept' ? 1 : 0),
        rejected: prev.rejected + (action === 'reject' ? 1 : 0),
      }));
    } catch (e: any) {
      setError(`${action} failed: ${e.message}`);
    } finally {
      setBusy(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const decided = counts.accepted + counts.rejected;
  const total = decided + counts.pending;

  return (
    <div className="min-h-screen bg-[#f7f6f3] p-6">
      <div className="max-w-[1100px] mx-auto">
        <header className="mb-6">
          <h1 className="font-display font-black text-3xl text-[#1a1916]">eBay review queue</h1>
          <p className="mt-2 text-[15px] text-[#6b6862] max-w-[70ch]">
            Listings that name the race and the driver but print no part number.
            They are never linked automatically, because inside a search group
            every model differs only by race, so a wrong link made this way looks
            exactly like a right one.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <span className="font-bold text-[#1a1916]">{counts.pending} pending</span>
            <span className="text-[#6b6862]">{counts.accepted} accepted</span>
            <span className="text-[#6b6862]">{counts.rejected} rejected</span>
            {total > 0 && (
              <span className="text-[#8a857c]">
                {Math.round((decided / total) * 100)}% worked through
              </span>
            )}
            <button
              onClick={load}
              className="ml-auto rounded-lg border border-[#e0ddd6] bg-white px-3 py-1.5 font-semibold hover:bg-[#faf9f7]"
            >
              Reload
            </button>
          </div>
        </header>

        {migrationMissing && (
          <div className="mb-5 rounded-xl border border-[#e8c39a] bg-[#fdf6ec] p-4">
            <p className="font-bold text-[#8a5a1a]">Migration 023 has not been applied.</p>
            <p className="mt-1 text-sm text-[#8a5a1a]">
              Run <code>supabase/migrations/023_ebay_review_candidates.sql</code> in
              the Supabase SQL editor, then run a batch eBay search to fill the
              queue. Until the table exists the search still works and still
              discards its review candidates, which is the old behaviour.
            </p>
          </div>
        )}

        {error && !migrationMissing && (
          <div className="mb-5 rounded-xl border border-[#e0a0a0] bg-[#fdf0f0] p-4 text-sm text-[#8a2a2a]">
            {error}
          </div>
        )}

        {loading && <p className="text-[#6b6862]">Reading the queue...</p>}

        {!loading && !candidates.length && !migrationMissing && (
          <div className="rounded-xl border border-[#e0ddd6] bg-white p-8 text-center">
            <p className="font-bold text-[#1a1916]">Nothing pending.</p>
            <p className="mt-1 text-sm text-[#6b6862]">
              {decided > 0
                ? 'The queue is clear. A new batch eBay search will refill it with anything it has not offered before.'
                : 'Run a batch eBay search to fill the queue. Candidates found before migration 023 was applied were not kept and need the search re-running.'}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {candidates.map(c => {
            const m = c.model;
            const dear =
              c.price_aud != null &&
              c.peerPrices.median != null &&
              c.price_aud > c.peerPrices.median * 2;
            return (
              <div
                key={c.id}
                className="rounded-xl border border-[#e0ddd6] bg-white p-4 flex gap-4"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.ebay_image || ''}
                  alt=""
                  className="w-[120px] h-[90px] object-cover rounded-lg bg-[#f2f1ed] flex-none"
                />

                <div className="min-w-0 flex-1">
                  {/* The model, which is what is really being decided */}
                  <p className="font-display font-bold text-[15px] text-[#1a1916]">
                    {m
                      ? `${m.year ?? '?'} ${m.team ?? '?'} ${m.chassis ?? ''} · ${m.driver ?? 'no driver'}`
                      : 'model missing'}
                  </p>
                  <p className="text-[13px] text-[#6b6862]">
                    {m
                      ? `${m.event ?? 'no event'} · ${m.manufacturer ?? '?'} ${m.scale ?? ''} · SKU ${m.sku ?? '--'}`
                      : ''}
                  </p>

                  {/* The listing */}
                  <a
                    href={c.ebay_url || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 block text-[14px] text-[#1a4fa0] hover:underline break-words"
                  >
                    {c.ebay_title || '(no title)'}
                  </a>

                  <p className="mt-1 text-[13px] text-[#6b6862]">
                    <span className={dear ? 'font-bold text-[#a03a2a]' : 'font-bold text-[#1a1916]'}>
                      {money(c.price_aud)}
                    </span>
                    {c.peerPrices.n > 0 && (
                      <>
                        {'  ·  this model elsewhere: '}
                        {money(c.peerPrices.min)} to {money(c.peerPrices.max)}, median{' '}
                        {money(c.peerPrices.median)}
                      </>
                    )}
                    {c.peerPrices.n === 0 && '  ·  no other price for this model'}
                  </p>

                  <p className="mt-1 text-[12px] text-[#8a857c]">
                    {c.item_condition || 'condition unknown'} · {c.seller || 'seller unknown'} ·{' '}
                    {c.marketplace || '?'} · found {age(c.found_at)}
                    {c.existingLinks > 0 &&
                      ` · model already has ${c.existingLinks} listing${c.existingLinks > 1 ? 's' : ''}`}
                  </p>

                  {c.reason && (
                    <p className="mt-2 text-[12px] text-[#6b6862] italic">{c.reason}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-none justify-center">
                  <button
                    disabled={busy.has(c.id)}
                    onClick={() => decide(c.id, 'accept')}
                    className="rounded-lg bg-[#1a7a3a] px-5 py-2 font-bold text-white hover:brightness-95 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy.has(c.id)}
                    onClick={() => decide(c.id, 'reject')}
                    className="rounded-lg border border-[#e0ddd6] px-5 py-2 font-semibold text-[#6b6862] hover:bg-[#faf9f7] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
