import { supabase } from './supabase';
import { selectAll } from './selectAll';
import { priceSpan, type PriceSpan } from './priceSpan';
import { formatAge, shouldHidePrice } from './freshness';
import { toAud } from './currency';
import { ebayAffiliateUrl } from './ebayAffiliate';
import { isUuid } from './carSlug';

/**
 * Data loading for the car detail page.
 *
 * Runs on the server so the HTML contains the actual content. Previously this
 * lived in a useEffect, which meant a crawler received an empty shell — a car
 * page contained zero mentions of its own car — and the page could not export
 * generateMetadata, so all 164 shared one title.
 *
 * Uses the anon/publishable key deliberately, not the service key: RLS grants
 * anon SELECT, which is everything a public page needs, and it means a bug here
 * can never write.
 */

export interface CarRetailer {
  name: string;
  price: number;
  currency: string;
  priceAUD: number;
  inStock: boolean;
  url: string;
  checkedAt: string | null;
  checkedLabel: string;
  priceHidden: boolean;
  /** eBay, not a shop — one seller's listing on a used/auction market. */
  isSecondary?: boolean;
  /** Orderable, but not yet shipping. */
  isPreorder?: boolean;
  /** EBAY_AU / EBAY_US, so the page can distinguish local from imported. */
  marketplace?: string | null;
  /**
   * eBay's own condition string (New, Used, ...), shown as a badge.
   *
   * Recorded for honesty rather than filtering. Used listings are frequently
   * DEARER than new ones — AUD 255.70 used against 124.87 new on one model,
   * because the new one came from a cheaper seller — so "used" is not a signal
   * that a price is not comparable, and it is not excluded from anything.
   */
  condition?: string | null;
  /** eBay seller username. Listings are deduped to the cheapest per seller. */
  seller?: string | null;
  /**
   * Listed, but nothing left to sell.
   *
   * A separate axis from inStock, and the only eBay state we can state
   * truthfully: a listing that has VANISHED returns 404 with no detail — sold,
   * expired and delisted are identical — but one that is sold out while still up
   * says so, and its link still works. Kept visible with its price, because for
   * older models eBay is often the only evidence a model exists at all.
   */
  soldOut?: boolean;
}

export interface CarVariant {
  id: string;
  description: string | null;
  manufacturer_sku: string | null;
  scale: string | null;
  price: number | null;
  image_url: string | null;
  release_date: string | null;
  stock_status: string | null;
  manufacturers: any;
  retailers: CarRetailer[];
  lowestPrice: number | null;
  /** Cheapest and dearest SHOP price, on the same terms as lowestPrice. */
  shopRange: PriceSpan | null;
  /** Cheapest and dearest live eBay listing. Never merged with shopRange. */
  ebayRange: PriceSpan | null;
}


export interface CarPageData {
  car: any;
  variants: CarVariant[];
}

/**
 * Every slug, for generateStaticParams.
 *
 * Paged before it needs to be. `cars` is at 736 and the 1000-row PostgREST cap
 * arrives without an error — and the symptom here would be car pages quietly
 * dropping out of the prerender and the sitemap, which is the last place anyone
 * would look for a truncated database read.
 */
export async function getAllCarSlugs(): Promise<string[]> {
  try {
    const rows = await selectAll<any>(supabase, 'cars', 'slug', q => q.not('slug', 'is', null));
    return rows.map(c => c.slug).filter(Boolean);
  } catch (err: any) {
    console.error('Failed to list car slugs:', err.message);
    return [];
  }
}

/**
 * Load a car and its variants by slug or UUID.
 *
 * Resolves against the stored slug column rather than regenerating it, so a
 * later change to the slug rules can't orphan URLs already in the wild.
 * Returns null when nothing matches, which the page turns into a 404.
 */
export async function getCarPageData(param: string): Promise<CarPageData | null> {
  const lookupColumn = isUuid(param) ? 'id' : 'slug';

  const { data: car, error: carError } = await supabase
    .from('cars')
    .select(`
      *,
      team:teams(name),
      season:seasons(year),
      driver:drivers(name, number)
    `)
    .eq(lookupColumn, param)
    .maybeSingle();

  if (carError || !car) return null;

  const { data: modelVariants } = await supabase
    .from('models')
    .select(`
      id,
      description,
      manufacturer_sku,
      scale,
      price,
      image_url,
      release_date,
      stock_status,
      manufacturers(id, name, description)
    `)
    .eq('car_id', car.id);

  const variantIds = (modelVariants || []).map((v: any) => v.id);
  if (variantIds.length === 0) return { car, variants: [] };

  // Two batched queries rather than one pair per variant
  const [{ data: allPrices }, { data: allEbay }] = await Promise.all([
    supabase
      .from('price_history')
      // `*` so this survives whether or not a migration has added columns
      .select('*, retailer:retailers(name, url)')
      .in('model_id', variantIds)
      .order('in_stock', { ascending: false })
      .order('price_aud', { ascending: true }),
    supabase.from('ebay_links').select('*').in('model_id', variantIds),
  ]);

  const pricesByModel = new Map<string, any[]>();
  (allPrices || []).forEach((p: any) => {
    if (!pricesByModel.has(p.model_id)) pricesByModel.set(p.model_id, []);
    pricesByModel.get(p.model_id)!.push(p);
  });
  /**
   * Every eBay listing for a model, cheapest first — not one.
   *
   * This was `Map<string, any>` with a plain `.set()` per row, so once a model
   * could hold several listings the last row read silently won and the page
   * showed an arbitrary seller's price. That is the same defect migration 015
   * exists to remove, so collapsing it here would have quietly undone the fix.
   */
  const ebayByModel = new Map<string, any[]>();
  (allEbay || []).forEach((e: any) => {
    if (!ebayByModel.has(e.model_id)) ebayByModel.set(e.model_id, []);
    ebayByModel.get(e.model_id)!.push(e);
  });
  // Buyable first, then cheapest. Sorting on price alone would let a sold-out
  // listing head the list purely for being cheap, which reads as the best offer
  // and is the one thing you cannot act on.
  const isSoldOut = (r: any) => /OUT_OF_STOCK/i.test(r.availability || '');
  for (const list of ebayByModel.values()) {
    list.sort((a: any, b: any) => {
      if (isSoldOut(a) !== isSoldOut(b)) return isSoldOut(a) ? 1 : -1;
      return (parseFloat(a.price_aud) || Infinity) - (parseFloat(b.price_aud) || Infinity);
    });
  }

  const variants: CarVariant[] = (modelVariants || []).map((variant: any) => {
    // Skip rows with no usable price — a 0 is a failed extraction, never an
    // offer, and it would sort first as the cheapest.
    const retailers: CarRetailer[] = (pricesByModel.get(variant.id) || [])
      .filter((item: any) => parseFloat(item.price) > 0)
      .map((item: any) => {
        const checkedAt = item.last_checked_at || item.recorded_at || null;
        return {
          name: item.retailer?.name || 'Unknown',
          price: parseFloat(item.price) || 0,
          currency: item.currency || 'AUD',
          priceAUD: parseFloat(item.price_aud) || parseFloat(item.price) || 0,
          inStock: item.in_stock !== false,
          isPreorder: item.is_preorder === true,
          url: item.product_url || item.retailer?.url || '#',
          checkedAt,
          checkedLabel: formatAge(checkedAt),
          priceHidden: shouldHidePrice(checkedAt),
        };
      });

    for (const ebayLink of ebayByModel.get(variant.id) || []) {
      const ebayPrice = parseFloat(String(ebayLink.ebay_price ?? '').replace(/[^0-9.]/g, '')) || 0;
      if (!(ebayPrice > 0)) continue;

      // Currency used to be hardcoded to USD and priceAUD left unconverted,
      // which understated every US listing. Both are stored properly now.
      const ebayCurrency = ebayLink.currency || 'USD';
      const ebayCheckedAt = ebayLink.last_checked_at || ebayLink.last_updated || null;

      retailers.push({
        name: ebayLink.marketplace === 'EBAY_AU' ? 'eBay Australia' : 'eBay',
        price: ebayPrice,
        currency: ebayCurrency,
        priceAUD: parseFloat(ebayLink.price_aud) || toAud(ebayPrice, ebayCurrency),
        inStock: true,
        // Affiliate tracking is applied here rather than at render time so
        // every surface that shows this link gets it. Returns the URL
        // unchanged when EBAY_CAMPAIGN_ID is not set.
        url: ebayAffiliateUrl(ebayLink.ebay_url, {
          marketplace: ebayLink.marketplace,
          customId: variant.manufacturer_sku,
        }),
        checkedAt: ebayCheckedAt,
        checkedLabel: formatAge(ebayCheckedAt),
        priceHidden: shouldHidePrice(ebayCheckedAt),
        isSecondary: true,
        marketplace: ebayLink.marketplace || null,
        condition: ebayLink.item_condition || null,
        seller: ebayLink.seller || null,
        soldOut: isSoldOut(ebayLink),
      });
    }

    // "Cheapest" is the strongest claim on the page, so it may only draw on
    // prices we're still willing to quote: in stock, and verified recently.
    //
    // eBay is excluded deliberately. It's a used/auction market where a
    // discontinued model can trade ABOVE its original retail, and a single
    // seller's asking price isn't a comparison. Letting one listing set
    // "Lowest Price" would misrepresent both the number and the claim.
    // Pre-orders are excluded too. "From $X" is the strongest claim on the
    // page and should mean buyable now — a price you cannot receive for months
    // sitting under that heading is the same overstatement as quoting an
    // out-of-stock shop. The row still shows its price, badged.
    const quotable = retailers.filter(
      r => r.inStock && !r.priceHidden && !r.isSecondary && !r.isPreorder
    );

    /**
     * What the same model costs at the cheapest and the dearest place selling it.
     *
     * The point of the site, stated rather than left to be inferred. Across the
     * catalogue the gap is 24% between shops and 38% between eBay sellers, and
     * a visitor currently has to read the list and work that out themselves.
     *
     * Kept as two separate ranges, never merged. A shop price and a used eBay
     * asking price are not the same kind of number, and one span covering both
     * would put a "from" against a floor no shop offers. The shop range uses
     * EXACTLY the filter that produced lowestPrice above, so the range can never
     * disagree with the figure printed beside it.
     *
     * Emitted only at two or more prices. A "range" over one listing is not a
     * range, it is the price again in a costume.
     */
    const span = (rows: CarRetailer[]) => priceSpan(rows.map(r => r.priceAUD));

    // Sold-out listings stay visible on the page but cannot bound a range: an
    // asking price nobody can accept is not what the model costs.
    const ebayLive = retailers.filter(r => r.isSecondary && !r.soldOut && !r.priceHidden);

    return {
      ...variant,
      retailers,
      lowestPrice: quotable.length > 0 ? Math.min(...quotable.map(r => r.priceAUD)) : null,
      shopRange: span(quotable),
      ebayRange: span(ebayLive),
    };
  });

  return { car, variants };
}

/** "Bahrain GP - W15 - Lewis Hamilton - 2024" */
export function carTitle(car: any): string {
  const event = car?.event_name || 'Grand Prix';
  return `${event} - ${car?.chassis_name} - ${car?.driver?.name} - ${car?.season?.year}`;
}
