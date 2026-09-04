import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toAud, primeRates } from '@/lib/currency';
import { selectAll } from '@/lib/selectAll';
import { recordObservations, newBatchId, type Observation } from '@/lib/priceObservation';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Re-check eBay listings, and record what we saw.
 *
 * WHY THIS EXISTS, precisely: not because listings rot. Measured twice on
 * 2026-08-17, 0 of 77 dead in the morning and 1 of 54 by the afternoon, with
 * listing ages of 231 days median and 922 max — these are Good-'Til-Cancelled
 * and live for years.
 *
 * It exists because NOTHING has ever re-checked an eBay link, and the site
 * refuses to quote a price older than STALE_DAYS = 30. The first of the 430
 * links goes stale on 2026-09-06 and all of them by 2026-09-16, at which point
 * every eBay price on the site renders "Check price on site" instead of a
 * number. Retailer links sit at zero stale purely because refresh-prices keeps
 * them alive.
 *
 * Mirrors refresh-prices' contract deliberately, including plan mode: the route
 * returns an ordered list of ids and the admin walks it in small batches. One
 * request per 430 listings would be a multi-minute call with no feedback and
 * nothing to show if it died half way, and the retailer sweep already hit that
 * ceiling for real.
 */

/** Third copy of this token dance (batch-ebay-search and search-ebay-api have the
 *  others). Worth extracting to lib/ebayAuth.ts once something needs a fourth. */
async function ebayToken(): Promise<string> {
  const auth = Buffer.from(
    `${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`
  ).toString('base64');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`eBay auth failed: ${json.error_description || res.status}`);
  }
  return json.access_token;
}

/**
 * A price move small enough to be noise rather than news.
 *
 * Measured across 64 listings: median drift 0.2%, p90 1.6%, and 33 of 36 changes
 * under 2%. That is eBay converting a USD or GBP listing at the day's rate, not
 * a seller repricing — only 2 of 64 moved for real. Without this threshold every
 * run rewrites nearly every row and last_updated stops distinguishing "we
 * checked" from "it changed".
 *
 * last_checked_at is stamped regardless. That stamp is the entire point.
 */
const NOISE_THRESHOLD = 0.02;

/**
 * A move this large is not a price change.
 *
 * Same reasoning as refresh-prices' IMPLAUSIBLE_RATIO: real prices do not move
 * fivefold. Report it, refuse to write it, let a person look.
 */
const IMPLAUSIBLE_RATIO = 5;

/**
 * Sold-out-but-still-listed rows kept per model, newest first.
 *
 * An unbuyable listing is worth keeping — for older models eBay is often the
 * only source, and "this existed at this price" beats nothing. But it must not
 * crowd out buyable ones. At the measured turnover this cap will be dormant for
 * a long time; bounding it now is cheaper than discovering the pile later.
 */
const MAX_SOLD_OUT_PER_MODEL = 3;

const DELAY_MS = 120;

const bareItemId = (id: string) =>
  String(id).replace(/^v1\|/, '').replace(/\|\d+$/, '');

interface Body {
  plan?: boolean;
  ebayLinkIds?: string[];
  dryRun?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Real FX rates before any conversion. price_aud decides which shop the
    // site calls cheapest, and the fallback constants were 7.9% wrong on USD.
    await primeRates(supabase);
    const { plan, ebayLinkIds, dryRun = true }: Body = await request.json();

    // ------------------------------------------------------------------
    // Plan mode: what to check, oldest first, and no work done.
    // ------------------------------------------------------------------
    if (plan) {
      const rows = await selectAll<any>(
        supabase,
        'ebay_links',
        'id, last_checked_at, last_updated'
      );

      // Oldest first, so a cancelled run has still rescued the links closest to
      // going stale rather than a random slice.
      const ordered = rows.sort((a, b) => {
        const ta = new Date(a.last_checked_at || a.last_updated || 0).getTime();
        const tb = new Date(b.last_checked_at || b.last_updated || 0).getTime();
        return ta - tb;
      });

      return NextResponse.json({
        success: true,
        total: ordered.length,
        ids: ordered.map(r => r.id),
      });
    }

    if (!Array.isArray(ebayLinkIds) || ebayLinkIds.length === 0) {
      return NextResponse.json(
        { error: 'ebayLinkIds is required (call with { plan: true } first)' },
        { status: 400 }
      );
    }

    // .returns<any[]>() because `availability` arrives with migration 016 and the
    // client's inferred column set does not know it yet.
    const { data: links, error: linkError } = await supabase
      .from('ebay_links')
      .select(
        'id, model_id, ebay_item_id, ebay_url, ebay_price, price_aud, currency, ' +
          'marketplace, item_condition, seller, availability, ' +
          // Needed to date a rescued observation honestly: when a dead listing's
          // last price is preserved, it is stamped with when we actually read it.
          'last_checked_at, last_updated'
      )
      .in('id', ebayLinkIds)
      .returns<any[]>();

    if (linkError) throw new Error(`Could not load links: ${linkError.message}`);

    const token = await ebayToken();

    const summary = {
      checked: 0,
      unchanged: 0,
      updated: 0,
      soldOut: 0,
      dead: 0,
      failed: 0,
      observations: 0,
      backfilled: 0,
    };
    const suspicious: any[] = [];
    const deadListings: any[] = [];
    const observations: Observation[] = [];
    /** One id for this whole run, so a bad run can be deleted and nothing else. */
    const batchId = newBatchId();

    for (const link of links || []) {
      summary.checked++;

      try {
        const res = await fetch(
          `https://api.ebay.com/buy/browse/v1/item/v1|${bareItemId(link.ebay_item_id)}|0`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'X-EBAY-C-MARKETPLACE-ID': link.marketplace || 'EBAY_AU',
            },
          }
        );

        // ----------------------------------------------------------------
        // Gone. 404 errorId 11001 is returned for sold, expired AND delisted
        // alike — verified identical for a fabricated id — so this listing
        // cannot be labelled "Sold". Its price survives as an observation,
        // which is the part worth keeping; the row goes, because a dead link
        // sends a visitor to "this listing has ended".
        // ----------------------------------------------------------------
        if (res.status === 404 || res.status === 400) {
          summary.dead++;
          deadListings.push({
            id: link.id,
            modelId: link.model_id,
            itemId: link.ebay_item_id,
            lastPrice: link.ebay_price,
            url: link.ebay_url,
          });

          /**
           * Rescue the last price we knew before deleting the row.
           *
           * Deleting a dead listing is only defensible because its price lives
           * on as history — but for every link created before this table
           * existed, no observation had ever been recorded, so the delete was
           * quietly destroying the only record of what the thing cost. Found by
           * testing the 404 path against a throwaway listing and noticing zero
           * observations came out of it.
           *
           * Stamped with `last_checked_at`, not now: we did read this price, but
           * we read it then. Claiming we saw it today would be false.
           */
          const lastPrice = parseFloat(String(link.ebay_price ?? '').replace(/[^0-9.]/g, ''));
          const rescued: Observation | null =
            Number.isFinite(lastPrice) && lastPrice > 0
              ? {
                  modelId: link.model_id,
                  ebayItemId: link.ebay_item_id,
                  batchId,
                  // Not 'refresh-ebay': this price was read on some EARLIER run
                  // and never recorded, and observedAt is backdated to match.
                  // Filing it as read-today would misdescribe it twice.
                  source: 'rescue',
                  price: lastPrice,
                  currency: link.currency || 'AUD',
                  priceAud:
                    Number(link.price_aud) > 0
                      ? Number(link.price_aud)
                      : toAud(lastPrice, link.currency || 'AUD'),
                  inStock: null,
                  availability: link.availability ?? null,
                  observedAt: link.last_checked_at || link.last_updated || null,
                }
              : null;

          if (dryRun) {
            if (rescued) summary.observations++;
          } else {
            // Written HERE rather than batched with the rest at the end of the
            // loop, because the delete below is in between. Batching would mean
            // a failed insert after a successful delete, which is precisely the
            // data loss this rescue exists to prevent. Order over efficiency —
            // dead listings are about 1 in 54, so the extra inserts are few.
            if (rescued) {
              const rec = await recordObservations(supabase, [rescued]);
              summary.observations += rec.written;
              if (!rec.written) {
                // Could not preserve the price, so do not destroy the row that
                // still holds it. It will be retried on the next run.
                console.warn(
                  `⚠️ keeping dead listing ${link.ebay_item_id}: its price could not be saved`
                );
                summary.failed++;
                await new Promise(r => setTimeout(r, DELAY_MS));
                continue;
              }
            }
            await supabase.from('ebay_links').delete().eq('id', link.id);
          }
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        if (!res.ok) {
          summary.failed++;
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        const item = await res.json();
        const livePrice = parseFloat(item?.price?.value ?? 'NaN');
        const liveCurrency = item?.price?.currency || link.currency || 'AUD';

        if (!Number.isFinite(livePrice) || livePrice <= 0) {
          summary.failed++;
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        const avail = (item?.estimatedAvailabilities || [])[0] || {};
        const status: string | null = avail.estimatedAvailabilityStatus || null;
        const soldOut = /OUT_OF_STOCK/i.test(status || '');
        const priceAud = toAud(livePrice, liveCurrency);
        const stored = parseFloat(String(link.ebay_price ?? '').replace(/[^0-9.]/g, ''));

        // Every successful read is an observation, including an unchanged one —
        // that is the most common case and just as real as a change.
        observations.push({
          modelId: link.model_id,
          ebayItemId: link.ebay_item_id,
          batchId,
          source: 'refresh-ebay',
          price: livePrice,
          currency: liveCurrency,
          priceAud,
          inStock: !soldOut,
          availability: status,
        });

        const ratio = stored > 0 ? livePrice / stored : 1;
        if (ratio > IMPLAUSIBLE_RATIO || ratio < 1 / IMPLAUSIBLE_RATIO) {
          suspicious.push({
            id: link.id,
            itemId: link.ebay_item_id,
            stored,
            live: livePrice,
            currency: liveCurrency,
            url: link.ebay_url,
            reason: `${stored} → ${livePrice} is a ${ratio.toFixed(1)}x move — not a price change`,
          });
          summary.failed++;
          await new Promise(r => setTimeout(r, DELAY_MS));
          continue;
        }

        const moved =
          !(stored > 0) || Math.abs(livePrice - stored) / stored > NOISE_THRESHOLD;

        // Condition and seller were added by migration 015, so the 387 rows that
        // predate it have neither and a re-search never revisits them (the pool
        // excludes listings we already hold). This read has both, so fill them.
        const backfill =
          (!link.item_condition && item?.condition) || (!link.seller && item?.seller?.username);
        if (backfill) summary.backfilled++;

        const patch: Record<string, any> = {
          last_checked_at: new Date().toISOString(),
          availability: status,
          sold_quantity: avail.estimatedSoldQuantity ?? null,
          available_qty: avail.estimatedAvailableQuantity ?? null,
          item_condition: link.item_condition || item?.condition || null,
          seller: link.seller || item?.seller?.username || null,
        };

        if (moved) {
          // ebay_price, not price — ebay_links has no `price` column, and naming
          // one in the patch fails the whole update.
          patch.ebay_price = String(livePrice);
          patch.price_aud = priceAud;
          patch.currency = liveCurrency;
          patch.last_updated = new Date().toISOString();
          summary.updated++;
        } else {
          summary.unchanged++;
        }
        if (soldOut) summary.soldOut++;

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('ebay_links')
            .update(patch)
            .eq('id', link.id);
          if (updateError) {
            console.error(`⚠️ update failed for ${link.ebay_item_id}: ${updateError.message}`);
            summary.failed++;
          }
        }
      } catch (err: any) {
        console.error(`❌ ${link.ebay_item_id}: ${err.message}`);
        summary.failed++;
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    // History is a secondary job and must not be able to fail the refresh —
    // recordObservations swallows its own errors and reports a count.
    // `+=`, not `=`. The dead-listing branch writes its rescued observation
    // immediately and has already counted it, so assigning here clobbered that
    // and reported 0 history rows on a run that had written one.
    if (!dryRun && observations.length) {
      const rec = await recordObservations(supabase, observations);
      summary.observations += rec.written;
    } else {
      summary.observations += observations.length;
    }

    // Trim sold-out rows per model, newest kept. Only for models this batch
    // actually touched, so a batched walk does not rescan the whole table.
    const trimmed: string[] = [];
    if (!dryRun) {
      const models = [...new Set((links || []).map(l => l.model_id))];
      for (const modelId of models) {
        const { data: outRows } = await supabase
          .from('ebay_links')
          .select('id, last_checked_at')
          .eq('model_id', modelId)
          .eq('availability', 'OUT_OF_STOCK')
          .order('last_checked_at', { ascending: false });

        const excess = (outRows || []).slice(MAX_SOLD_OUT_PER_MODEL);
        for (const row of excess) {
          await supabase.from('ebay_links').delete().eq('id', row.id);
          trimmed.push(row.id);
        }
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      summary: { ...summary, trimmedSoldOut: trimmed.length },
      suspicious,
      deadListings,
    });
  } catch (err: any) {
    console.error('💥 eBay refresh failed:', err);
    return NextResponse.json(
      { error: 'eBay refresh failed', details: err.message },
      { status: 500 }
    );
  }
}
