import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/selectAll';

/**
 * The eBay review queue: read it, accept from it, reject into it.
 *
 * batch-ebay-search finds two kinds of match. One prints the model's part
 * number in the listing title and writes itself. The other names the race and
 * the driver and must not, because inside a search group every model shares
 * chassis, scale, year and manufacturer and differs only by race — so a wrong
 * link made that way looks exactly like a right one. Those are the rows here.
 *
 * Until migration 023 they were returned in the search response and kept
 * nowhere, so roughly 625 of them were found and thrown away on 2026-09-28.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

/**
 * GET — the pending queue, each candidate carrying the model it would attach
 * to.
 *
 * The model context is the entire point. A title reading "Winner Brazilian GP
 * 2013" is only judgeable against what the model actually IS, so the season,
 * team, chassis, driver, event, scale, maker and SKU all travel with it.
 * Without them the reviewer is agreeing to a listing rather than to a link.
 */
export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get('status') || 'pending';
    const limit = Math.min(500, Number(request.nextUrl.searchParams.get('limit')) || 200);

    const { data: candidates, error } = await supabase
      .from('ebay_review_candidates')
      .select('*')
      .eq('status', status)
      .order('found_at', { ascending: true })
      .limit(limit);

    if (error) {
      // Migration 023 not applied yet. Reported rather than thrown so the admin
      // page renders an explanation instead of a broken panel.
      return NextResponse.json({
        success: false,
        migrationMissing: true,
        error: error.message,
        candidates: [],
        counts: { pending: 0, accepted: 0, rejected: 0 },
      });
    }

    const modelIds = [...new Set((candidates || []).map(c => c.model_id))];

    const models = modelIds.length
      ? (
          await supabase
            .from('models')
            .select(
              'id, scale, manufacturer_sku, manufacturer:manufacturers(name), ' +
                'car:cars!inner(slug, chassis_name, event_name, driver:drivers(name), ' +
                'team:teams(name), season:seasons(year))'
            )
            .in('id', modelIds)
        ).data || []
      : [];

    const byId = new Map(models.map((m: any) => [m.id, m]));

    /**
     * What this model already costs, so the queue can show a candidate's price
     * against its peers. A review row demoted for being far above the median
     * carries that in `reason`, but seeing the numbers side by side is what
     * makes the judgement quick.
     */
    const [retail, ebay] = await Promise.all([
      selectAll<any>(supabase, 'price_history', 'model_id, price_aud'),
      selectAll<any>(supabase, 'ebay_links', 'model_id, price_aud, ebay_item_id'),
    ]);
    const known = new Map<string, number[]>();
    for (const r of [...(retail || []), ...(ebay || [])]) {
      const p = Number(r.price_aud);
      if (!(p > 0)) continue;
      if (!known.has(r.model_id)) known.set(r.model_id, []);
      known.get(r.model_id)!.push(p);
    }
    // Listings this model ALREADY holds, so the queue can say "this model has
    // two links already" — a third is worth less than a first.
    const linkCount = new Map<string, number>();
    for (const r of ebay || []) {
      linkCount.set(r.model_id, (linkCount.get(r.model_id) || 0) + 1);
    }

    const enriched = (candidates || []).map(c => {
      const m: any = byId.get(c.model_id);
      const peers = (known.get(c.model_id) || []).slice().sort((a, b) => a - b);
      return {
        ...c,
        model: m
          ? {
              scale: m.scale,
              sku: m.manufacturer_sku,
              manufacturer: m.manufacturer?.name || null,
              year: m.car?.season?.year ?? null,
              team: m.car?.team?.name || null,
              chassis: m.car?.chassis_name || null,
              driver: m.car?.driver?.name || null,
              event: m.car?.event_name || null,
              carSlug: m.car?.slug || null,
            }
          : null,
        peerPrices: {
          n: peers.length,
          min: peers[0] ?? null,
          median: peers.length ? peers[Math.floor(peers.length / 2)] : null,
          max: peers[peers.length - 1] ?? null,
        },
        existingLinks: linkCount.get(c.model_id) || 0,
      };
    });

    // Counts across every status, so the panel can show progress rather than
    // only what is left.
    const counts: Record<string, number> = { pending: 0, accepted: 0, rejected: 0 };
    for (const s of Object.keys(counts)) {
      const { count } = await supabase
        .from('ebay_review_candidates')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      counts[s] = count || 0;
    }

    return NextResponse.json({ success: true, candidates: enriched, counts });
  } catch (err: any) {
    console.error('review-candidates GET failed:', err);
    return NextResponse.json({ error: 'Failed to read queue', details: err.message }, { status: 500 });
  }
}

/**
 * POST — decide on one candidate. { id, action: 'accept' | 'reject' }
 *
 * Accepting writes an ebay_links row with `auto_linked: false`. That flag is
 * load-bearing: every auto-linked row on the site has the model's part number
 * printed in its listing title, 5,025 of 5,025, and that check is only
 * meaningful while human-accepted rows stay distinguishable from machine ones.
 *
 * Rejecting writes a status and nothing else. It has to persist, or the next
 * search re-offers the same candidate and the queue never shrinks.
 */
export async function POST(request: NextRequest) {
  try {
    const { id, action } = await request.json();
    if (!id || (action !== 'accept' && action !== 'reject')) {
      return NextResponse.json(
        { error: "Send { id, action: 'accept' | 'reject' }" },
        { status: 400 }
      );
    }

    const { data: c, error: readError } = await supabase
      .from('ebay_review_candidates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (readError) throw new Error(readError.message);
    if (!c) return NextResponse.json({ error: 'No such candidate' }, { status: 404 });
    if (c.status !== 'pending') {
      return NextResponse.json(
        { error: `Already ${c.status}`, status: c.status },
        { status: 409 }
      );
    }

    if (action === 'accept') {
      const { error: linkError } = await supabase.from('ebay_links').upsert(
        {
          model_id: c.model_id,
          ebay_item_id: c.ebay_item_id,
          ebay_url: c.ebay_url,
          ebay_title: c.ebay_title,
          ebay_image: c.ebay_image,
          ebay_price: c.ebay_price,
          currency: c.currency,
          price_aud: c.price_aud,
          marketplace: c.marketplace,
          item_condition: c.item_condition,
          seller: c.seller,
          last_checked_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          // Judged by a person, not by a part number. See above.
          auto_linked: false,
        },
        { onConflict: 'model_id,ebay_item_id' }
      );
      if (linkError) throw new Error(`Link write failed: ${linkError.message}`);
    }

    const { error: updateError } = await supabase
      .from('ebay_review_candidates')
      .update({
        status: action === 'accept' ? 'accepted' : 'rejected',
        decided_at: new Date().toISOString(),
      })
      .eq('id', id);

    // The link is already written at this point. Reporting the failure rather
    // than swallowing it matters: a candidate stuck at 'pending' with its link
    // written will be offered again, and accepting twice is a no-op upsert
    // rather than a duplicate, so the safe move is to say so and move on.
    if (updateError) {
      return NextResponse.json({
        success: true,
        action,
        warning: `Link written but status not updated: ${updateError.message}`,
      });
    }

    return NextResponse.json({ success: true, action });
  } catch (err: any) {
    console.error('review-candidates POST failed:', err);
    return NextResponse.json({ error: 'Decision failed', details: err.message }, { status: 500 });
  }
}
