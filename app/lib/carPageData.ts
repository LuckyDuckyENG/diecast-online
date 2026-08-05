import { supabase } from './supabase';
import { formatAge, shouldHidePrice } from './freshness';
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
}

export interface CarPageData {
  car: any;
  variants: CarVariant[];
}

/** Every slug, for generateStaticParams. */
export async function getAllCarSlugs(): Promise<string[]> {
  const { data, error } = await supabase.from('cars').select('slug').not('slug', 'is', null);
  if (error) {
    console.error('Failed to list car slugs:', error.message);
    return [];
  }
  return (data || []).map((c: any) => c.slug).filter(Boolean);
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
  const ebayByModel = new Map<string, any>();
  (allEbay || []).forEach((e: any) => ebayByModel.set(e.model_id, e));

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
          url: item.product_url || item.retailer?.url || '#',
          checkedAt,
          checkedLabel: formatAge(checkedAt),
          priceHidden: shouldHidePrice(checkedAt),
        };
      });

    const ebayLink = ebayByModel.get(variant.id);
    if (ebayLink) {
      const ebayPrice = parseFloat(ebayLink.ebay_price?.replace(/[^0-9.]/g, '') || '0');
      if (ebayPrice > 0) {
        // eBay links aren't part of the refresh cycle, so freshness comes from
        // when the listing was last synced. Same staleness rules apply.
        const ebayCheckedAt = ebayLink.last_updated || null;
        retailers.push({
          name: 'eBay',
          price: ebayPrice,
          currency: 'USD',
          priceAUD: ebayPrice,
          inStock: true,
          url: ebayLink.ebay_url,
          checkedAt: ebayCheckedAt,
          checkedLabel: formatAge(ebayCheckedAt),
          priceHidden: shouldHidePrice(ebayCheckedAt),
        });
      }
    }

    // "Cheapest" is the strongest claim on the page, so it may only draw on
    // prices we're still willing to quote: in stock, and verified recently.
    const quotable = retailers.filter(r => r.inStock && !r.priceHidden);

    return {
      ...variant,
      retailers,
      lowestPrice: quotable.length > 0 ? Math.min(...quotable.map(r => r.priceAUD)) : null,
    };
  });

  return { car, variants };
}

/** "Bahrain GP - W15 - Lewis Hamilton - 2024" */
export function carTitle(car: any): string {
  const event = car?.event_name || 'Grand Prix';
  return `${event} - ${car?.chassis_name} - ${car?.driver?.name} - ${car?.season?.year}`;
}
