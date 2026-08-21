import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchShopifyFeed, isShopify, shopCurrency } from '@/lib/shopifyFeed';
import { fetchSitemapFeed, sitemapShopFor, type CandidateModel } from '@/lib/sitemapFeed';
import { classifyMatches, type SweepModel } from '@/lib/retailerSweep';
import { attachRetailerLink, fillMissingModelImage, looksLikePlaceholderImage } from '@/lib/retailerLink';
import { selectAll } from '@/lib/selectAll';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';
// Anthony's takes ~60s for 54 pages; a slower shop could take longer.
export const maxDuration = 300;

/**
 * Sweep one retailer's Shopify feed and reconcile it against the catalogue.
 *
 * Does two jobs in one pass:
 *   - DISCOVERY: models we hold that this shop stocks but we have not linked
 *   - REFRESH:   fresh price and stock for links we already have
 *
 * Both come from the same download, so a sweep costs about the same as
 * refreshing the existing links alone and finds new ones for free.
 *
 * dryRun (the default) writes nothing and returns exactly what a live run
 * would do.
 *
 * GET returns the retailers this can run against, so the admin does not have
 * to hardcode which shops are Shopify.
 */

interface Body {
  retailerId?: string;
  dryRun?: boolean;
}

const readAll = <T = any>(table: string, columns: string) =>
  selectAll<T>(supabase, table, columns);

export async function GET() {
  try {
    const { data: retailers, error } = await supabase
      .from('retailers')
      .select('id, name, url, region');
    if (error) throw new Error(error.message);

    // Every link, not the first 1000 — these become the counts in the dropdown.
    const links = await readAll<any>('price_history', 'retailer_id');
    const counts = new Map<string, number>();
    for (const l of links || []) {
      counts.set(l.retailer_id, (counts.get(l.retailer_id) || 0) + 1);
    }

    // Probe in parallel — one tiny request each, and the answer is cached by
    // nothing, so the admin sees the true current state.
    const probed = await Promise.all(
      (retailers || [])
        .filter(r => r.url)
        .map(async r => {
          const host = r.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          return {
            id: r.id,
            name: r.name,
            host,
            region: r.region,
            links: counts.get(r.id) || 0,
            // Two ways to read a shop now. A sitemap shop has no bulk feed but
            // publishes every product URL, which is enough to narrow before
            // fetching. Checked first because it needs no network call.
            sweepable: !!sitemapShopFor(host) || (await isShopify(host)),
            via: sitemapShopFor(host) ? 'sitemap' : 'shopify',
          };
        })
    );

    probed.sort((a, b) => Number(b.sweepable) - Number(a.sweepable) || b.links - a.links);

    return NextResponse.json({
      success: true,
      retailers: probed,
      sweepable: probed.filter(p => p.sweepable).length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Could not list retailers', details: err.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { retailerId, dryRun = true }: Body = await request.json();
    if (!retailerId) {
      return NextResponse.json({ error: 'retailerId is required' }, { status: 400 });
    }

    const { data: retailer, error: rErr } = await supabase
      .from('retailers')
      .select('id, name, url, currency')
      .eq('id', retailerId)
      .maybeSingle();

    if (rErr) throw new Error(rErr.message);
    if (!retailer?.url) {
      return NextResponse.json({ error: 'Retailer has no URL' }, { status: 400 });
    }

    const host = retailer.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const t0 = Date.now();

    const declared = await shopCurrency(host);

    const sitemapShop = sitemapShopFor(host);

    // The models have to be loaded before the feed for a sitemap shop: the
    // prefilter is what turns 65,000 URLs into a few hundred product fetches,
    // and it needs to know what we are looking for.
    const models = await readAll(
      'models',
      'id, scale, manufacturer_sku, image_url, manufacturer:manufacturers(name), ' +
        'car:cars(event_name, chassis_name, driver:drivers(name), season:seasons(year))'
    );

    const feed = sitemapShop
      ? await fetchSitemapFeed(
          host,
          (models || []).map((m: any): CandidateModel => ({
            sku: m.manufacturer_sku || '',
            scale: m.scale || null,
            manufacturer: m.manufacturer?.name || null,
            driver: m.car?.driver?.name || null,
            event: m.car?.event_name || null,
            year: m.car?.season?.year ?? null,
          })).filter(m => m.sku)
        )
      : await fetchShopifyFeed(host);

    if (feed.bySku.size === 0) {
      return NextResponse.json({
        success: true,
        dryRun,
        retailer: retailer.name,
        message:
          `${host} returned nothing readable. Shopify shops expose /products.json ` +
          `and a few others publish a sitemap we can narrow; this retailer does ` +
          `neither, so it has to be maintained by hand.`,
        totals: { matched: 0, new: 0, refresh: 0, unchanged: 0, review: 0, hold: 0 },
        matches: [],
      });
    }

    const existingRows = await readAll(
      'price_history',
      'model_id, price, in_stock, product_url, price_aud, currency, retailer_id'
    );

    const here = new Map<string, any>();
    for (const row of existingRows || []) {
      if (row.retailer_id === retailerId) here.set(row.model_id, row);
    }

    /**
     * Which currency the feed's numbers are in.
     *
     * Nothing in the feed says. products.json carries no currency, and
     * meta.json reports the shop's BASE currency, not what it presented to this
     * request — Shopify converts by inferred location. Stone Model advertises
     * USD, is recorded as CAD, and served numbers matching our stored AUD
     * prices to within 1%. Believing meta.json would have inflated every one of
     * its prices by about half.
     *
     * So prefer what is already on the rows: those prices were read from the
     * rendered page and checked by a person. Fall back to the shop's
     * declaration only when this retailer has no history to learn from.
     */
    const currencyVotes = new Map<string, number>();
    for (const row of here.values()) {
      if (row.currency) currencyVotes.set(row.currency, (currencyVotes.get(row.currency) || 0) + 1);
    }
    const establishedCurrency =
      [...currencyVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const currency = establishedCurrency || declared || retailer.currency || 'AUD';
    const currencyDisputed =
      !!declared && !!establishedCurrency && declared !== establishedCurrency;

    // Prices we already trust for this scale, so the outlier check has a
    // reference that does not depend on what this one sweep happened to match.
    const scaleOf = new Map<string, string>();
    for (const m of (models || []) as any[]) scaleOf.set(m.id, m.scale || '?');
    const reference = new Map<string, number[]>();
    for (const row of existingRows || []) {
      const p = Number(row.price_aud);
      if (!(p > 0)) continue;
      const scale = scaleOf.get(row.model_id) || '?';
      if (!reference.has(scale)) reference.set(scale, []);
      reference.get(scale)!.push(p);
    }

    const pairs: { model: SweepModel; variant: any }[] = [];
    for (const m of (models || []) as any[]) {
      const sku = (m.manufacturer_sku || '').trim();
      if (!sku) continue;
      const variant = feed.bySku.get(sku.toUpperCase());
      if (!variant) continue;

      const ex = here.get(m.id);
      const car = m.car;
      pairs.push({
        model: {
          id: m.id,
          sku,
          scale: m.scale || null,
          label: `${m.manufacturer?.name || '?'} ${m.scale || ''} ${car?.season?.year || ''} ${car?.chassis_name || ''} ${car?.event_name || ''} / ${car?.driver?.name || ''}`.replace(/\s+/g, ' ').trim(),
          existing: ex
            ? { price: ex.price, inStock: ex.in_stock, productUrl: ex.product_url }
            : undefined,
        },
        variant,
      });
    }

    const matches = classifyMatches(pairs, { reference, currency });

    const totals = {
      matched: matches.length,
      new: matches.filter(m => m.action === 'new').length,
      refresh: matches.filter(m => m.action === 'refresh').length,
      unchanged: matches.filter(m => m.action === 'unchanged').length,
      review: matches.filter(m => m.action === 'review').length,
      hold: matches.filter(m => m.action === 'hold').length,
    };

    let written = 0;
    let imagesFilled = 0;
    const failures: string[] = [];

    /**
     * Images, for EVERY match — not just the ones being written.
     *
     * The write list excludes `unchanged` and `review` rows, so tying image
     * filling to it meant an already-linked model whose price had not moved got
     * nothing. Re-running a shop specifically to pick up images would have
     * filled zero. A row can have a suspect price and a perfectly good photo;
     * they are unrelated facts.
     *
     * The dry run COUNTS rather than writing, so it predicts the real number
     * instead of reporting zero and looking like the feature does nothing.
     */
    const imageless = new Set(
      ((models || []) as any[]).filter(m => !m.image_url).map(m => m.id)
    );
    for (const m of matches) {
      // Skipped in the dry-run count too, so the number it predicts is the
      // number the apply actually fills.
      if (!m.variant.imageUrl || !imageless.has(m.model.id)) continue;
      if (looksLikePlaceholderImage(m.variant.imageUrl)) continue;
      if (dryRun) {
        imagesFilled++;
      } else if (await fillMissingModelImage(supabase, m.model.id, m.variant.imageUrl)) {
        imagesFilled++;
      }
    }
    console.log(`🖼️ ${dryRun ? 'would fill' : 'filled'} ${imagesFilled} missing model image(s)`);

    if (!dryRun) {
      for (const m of matches.filter(x => x.write)) {
        const res = await attachRetailerLink(supabase, {
          modelId: m.model.id,
          retailerUrl: m.variant.productUrl,
          price: m.variant.price!,
          currency,
          inStock: m.variant.available,
          isPreorder: m.isPreorder,
          // A hand-picked URL may point at a specific variant or bundle that a
          // SKU match would not reproduce. Refresh its price, keep its link.
          preserveExistingUrl: true,
        });
        if (res.ok) written++;
        else failures.push(`${m.model.sku}: ${res.reason}`);
      }
    }

    return NextResponse.json({
      success: true,
      dryRun,
      retailer: retailer.name,
      host,
      via: sitemapShop ? 'sitemap' : 'shopify',
      currency,
      currencyDisputed,
      declaredCurrency: declared,
      recordedCurrency: retailer.currency,
      establishedCurrency,
      feed: {
        products: feed.products,
        variants: feed.variants,
        skus: feed.bySku.size,
        requests: feed.requests,
        truncated: feed.truncated,
        seconds: Math.round((Date.now() - t0) / 100) / 10,
      },
      totals,
      written,
      imagesFilled,
      failures,
      matches: matches.map(m => ({
        modelId: m.model.id,
        model: m.model.label,
        sku: m.model.sku,
        action: m.action,
        reason: m.reason,
        title: m.variant.title,
        price: m.variant.price,
        available: m.variant.available,
        url: m.variant.productUrl,
        image: m.variant.imageUrl,
      })),
    });
  } catch (err: any) {
    console.error('💥 retailer sweep failed:', err);
    return NextResponse.json(
      { error: 'Sweep failed', details: err.message },
      { status: 500 }
    );
  }
}
