import { isQuotable, type CarPageData, type CarVariant } from './carPageData';

/**
 * Product / AggregateOffer JSON-LD for a car page.
 *
 * The site's whole claim is "here is what this model costs in several places",
 * and AggregateOffer is the schema.org shape for exactly that: a low price, a
 * high price, and how many offers it was drawn from. It is what lets a search
 * result read "from AUD 199.54 · 4 offers" instead of just a page title.
 *
 * WHAT IS MARKED UP, AND WHAT IS NOT
 *
 * The unit is the MODEL, not the car. A car page is several products — a
 * Bburago at AUD 22.99 and a hand-built BBR of the same Ferrari at AUD 831.78 —
 * so one Product covering the page would describe nothing that exists. Same
 * conclusion the browse cards reached by a different route.
 *
 * Offers come only from `isQuotable`: in stock, checked recently, a shop rather
 * than eBay, not a pre-order. That is the identical predicate behind the
 * visible "Lowest shop price", so the markup cannot contradict the page.
 * Claiming a price where the page says "Check price on site" would be a lie to
 * a reader and, to Google, markup that disagrees with its own page.
 *
 * eBay is excluded deliberately. Those are one seller's asking prices on a used
 * market; presenting them as retail offers would put a "from" against a floor
 * no shop honours. The car page shows them separately for the same reason.
 */

/** schema.org wants an absolute URL. */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://diecasts.app';

function productFor(variant: CarVariant, carName: string, slug: string) {
  const offers = variant.retailers.filter(isQuotable);
  const maker = variant.manufacturers?.name || null;

  const name = [maker, variant.scale, carName].filter(Boolean).join(' ');

  const product: Record<string, unknown> = {
    '@type': 'Product',
    name,
    // The anchor lets several Products on one page be told apart, and gives
    // each a stable identity across crawls.
    '@id': `${SITE}/cars/${slug}#model-${variant.id}`,
    url: `${SITE}/cars/${slug}`,
  };

  if (variant.manufacturer_sku) product.sku = variant.manufacturer_sku;
  if (maker) product.brand = { '@type': 'Brand', name: maker };
  if (variant.image_url) product.image = variant.image_url;
  if (variant.description) product.description = variant.description;

  /**
   * No offers, no offer block.
   *
   * An empty or zero-priced AggregateOffer is worse than none: it invites a
   * search result advertising a price that does not exist. A Product with no
   * offers is still valid markup and still describes the model honestly.
   */
  if (offers.length) {
    const prices = offers.map(o => o.priceAUD).filter(p => p > 0);
    // Every offer here passed isQuotable, so in-stock is true by construction
    // rather than by assertion.
    const availability = 'https://schema.org/InStock';

    if (prices.length === 1) {
      /**
       * One shop is an Offer, not an AggregateOffer.
       *
       * "lowPrice 152.85, highPrice 152.85, offerCount 1" is legal and slightly
       * absurd — a range across a single number, which is the same thing
       * priceSpan refuses to draw. Offer says the true thing in the shape a
       * reader of the markup expects.
       */
      product.offers = {
        '@type': 'Offer',
        priceCurrency: 'AUD',
        price: Number(prices[0].toFixed(2)),
        availability,
        url: offers[0].url || undefined,
      };
    } else if (prices.length > 1) {
      product.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'AUD',
        lowPrice: Number(Math.min(...prices).toFixed(2)),
        highPrice: Number(Math.max(...prices).toFixed(2)),
        offerCount: prices.length,
        availability,
      };
    }
  }

  return product;
}

/**
 * The page's structured data: one Product per variant that has something to
 * say, wrapped in an ItemList so the page is described as a set of models
 * rather than pretending to be a single product.
 */
export function carPageJsonLd(data: CarPageData, slug: string, carName: string) {
  const products = data.variants
    // A variant with no maker AND no SKU is not identifiable enough to mark up.
    .filter(v => v.manufacturers?.name || v.manufacturer_sku)
    .map(v => productFor(v, carName, slug));

  if (!products.length) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: carName,
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: p,
    })),
  };
}

/**
 * Serialise for a <script> tag.
 *
 * `<` becomes <, per the Next.js JSON-LD guidance: JSON.stringify does not
 * escape it, so a product name containing "</script>" would otherwise close the
 * tag and inject markup. Nothing in this data is user-supplied today, but the
 * names come from shop feeds, which is other people's text.
 */
export function jsonLdScript(payload: unknown): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}
