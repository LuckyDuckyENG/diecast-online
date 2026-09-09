import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAll } from './selectAll';
import { primeRates, toAud } from './currency';

/**
 * Price history for a model, as a series per SELLER.
 *
 * WHY PER SELLER AND NOT "CHEAPEST"
 *
 * A "cheapest anywhere" line moves when the number of shops we looked at
 * changes, which is not the same thing as a price changing. Measured on this
 * data: of 379 models with two readings, 237 had a different number of sources
 * on the two days, and 45% of those would have drawn a move of more than 10%
 * that never happened. The worst example moved AUD 338.07 -> 164.93 purely
 * because the second reading saw three shops instead of one.
 *
 * A per-seller line cannot do that. A shop we did not check that day leaves a
 * gap in its own line rather than moving a combined number.
 *
 * WHY IT CONVERTS HERE AND NOT FROM price_aud
 *
 * price_aud is frozen at the rate that applied the day the row was written, and
 * the USD rate changed from a hardcoded 1.5 to an ECB 1.3902 on 2026-09-03. A
 * series drawn from it shows every American shop dropping ~7% on one day — a
 * correlated, market-looking event that is entirely a code edit. Measured: 362
 * of 363 USD sources "moved" in price_aud; 7 of 363 moved in the shop's own
 * number.
 *
 * So this reads the raw `price` and `currency` and converts every point with
 * ONE current rate. The line then shows what the seller did, which is the only
 * thing we can honestly claim to have observed.
 */

export interface PricePoint {
  /** YYYY-MM-DD. What we know is the day we LOOKED, never the day it changed. */
  day: string;
  /** Converted at read time, current rate, same rate for every point. */
  priceAud: number;
  inStock: boolean | null;
}

export interface PriceSeries {
  /** Retailer name, or an eBay seller. */
  label: string;
  kind: 'shop' | 'ebay';
  points: PricePoint[];
  /** Movement across the series, as a fraction of the higher price. */
  change: number;
}

export interface ModelHistory {
  modelId: string;
  series: PriceSeries[];
  /** Earliest and latest day observed across all series. */
  from: string;
  to: string;
}

/**
 * A series needs two readings on two DIFFERENT days.
 *
 * Two readings on one day is one observation repeated, and a single point is
 * not a history — drawing either would imply a trend from nothing, which is the
 * same objection as a "range" over one price.
 */
const MIN_DAYS = 2;

/**
 * The one series to draw, given which shop the page is headlining.
 *
 * The default ordering picks the best-EVIDENCED line — shops before eBay, most
 * readings first — which is the right default when nothing else is known and
 * the wrong one directly under a price. A page headlining AUD 347.48 at
 * LIVECARMODEL drew "-2% at Motorsport Model Shop", a shop that was out of
 * stock at nearly twice that. Both figures were true; stacked, they read as
 * "347.48, down 2%", which is a claim neither of them makes.
 *
 * So the headline shop wins when it has a series of its own. It often does not
 * — a shop we have only checked once has no line — and then this falls back to
 * the best-evidenced series, which is still labelled with its own name and so
 * is still a claim the reader can check against the list.
 */
export function pickSeries(
  history: ModelHistory | undefined,
  headlineSeller: string | null
): PriceSeries | null {
  if (!history?.series.length) return null;
  if (headlineSeller) {
    const own = history.series.find(s => s.kind === 'shop' && s.label === headlineSeller);
    if (own) return own;
  }
  return history.series[0];
}

export async function getPriceHistory(
  supabase: SupabaseClient,
  modelIds: string[]
): Promise<Map<string, ModelHistory>> {
  const out = new Map<string, ModelHistory>();
  if (!modelIds.length) return out;

  // One current rate for every point in every series.
  await primeRates(supabase);

  /**
   * Ids are requested in chunks.
   *
   * PostgREST puts `.in()` in the query string, so a long list becomes a very
   * long URL and the request fails — with an EMPTY error message, which is a
   * miserable thing to debug. A car page asks for two to eight models and would
   * never hit it; a hub page or a script asking for all 1,788 does, immediately.
   *
   * 200 keeps the URL well inside any limit while still being one round trip
   * for every realistic page.
   */
  const CHUNK = 200;
  const rows: any[] = [];
  for (let i = 0; i < modelIds.length; i += CHUNK) {
    const batch = modelIds.slice(i, i + CHUNK);
    rows.push(...await selectAll<any>(
      supabase,
      'price_observations',
      'model_id, retailer_id, ebay_item_id, price, currency, in_stock, observed_at',
      q => q.in('model_id', batch).order('observed_at', { ascending: true })
    ));
  }
  if (!rows.length) return out;

  // Names, so a line can be labelled with a shop rather than a uuid.
  const retailerIds = [...new Set(rows.map(r => r.retailer_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (retailerIds.length) {
    const { data } = await supabase.from('retailers').select('id, name').in('id', retailerIds);
    for (const r of data || []) names.set(r.id, r.name);
  }

  /** model -> source -> day -> price. */
  const byModel = new Map<string, Map<string, { kind: 'shop' | 'ebay'; days: Map<string, PricePoint> }>>();

  for (const r of rows) {
    const price = parseFloat(r.price);
    if (!(price > 0)) continue;

    const sourceId = r.retailer_id || r.ebay_item_id;
    if (!sourceId) continue;

    if (!byModel.has(r.model_id)) byModel.set(r.model_id, new Map());
    const sources = byModel.get(r.model_id)!;
    if (!sources.has(sourceId)) {
      sources.set(sourceId, { kind: r.retailer_id ? 'shop' : 'ebay', days: new Map() });
    }

    const day = String(r.observed_at).slice(0, 10);
    // Two readings on one day: the later one wins. Rows arrive oldest-first, so
    // an overwrite is the newer reading — the last thing we saw that day.
    sources.get(sourceId)!.days.set(day, {
      day,
      priceAud: Number(toAud(price, r.currency).toFixed(2)),
      inStock: r.in_stock ?? null,
    });
  }

  for (const [modelId, sources] of byModel) {
    const series: PriceSeries[] = [];

    for (const [sourceId, s] of sources) {
      if (s.days.size < MIN_DAYS) continue;
      const points = [...s.days.values()].sort((a, b) => a.day.localeCompare(b.day));
      const first = points[0].priceAud;
      const last = points[points.length - 1].priceAud;
      series.push({
        label: s.kind === 'shop' ? names.get(sourceId) || 'A shop' : 'eBay seller',
        kind: s.kind,
        points,
        change: first > 0 ? (last - first) / Math.max(first, last) : 0,
      });
    }

    if (!series.length) continue;

    // Shops before eBay, then most points first: the fullest line reads as the
    // main one, and a shop price is the more comparable number.
    series.sort((a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'shop' ? -1 : 1) || b.points.length - a.points.length
    );

    const allDays = series.flatMap(s => s.points.map(p => p.day)).sort();
    out.set(modelId, { modelId, series, from: allDays[0], to: allDays[allDays.length - 1] });
  }

  return out;
}
