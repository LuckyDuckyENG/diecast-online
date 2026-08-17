import type { FeedResult, FeedVariant } from './shopifyFeed';

/**
 * Reading a shop that has no bulk feed, via its sitemap.
 *
 * LIVECARMODEL is BigCommerce and publishes nothing wholesale: /products.json,
 * the WooCommerce endpoints and the PrestaShop API all 404. But /xmlsitemap.php
 * is a sitemap index, and that changes the economics completely — 65,168 product
 * URLs in eight requests.
 *
 * The URLs alone are not enough to identify anything, but they are enough to
 * NARROW. A slug carries scale, manufacturer, year, team, chassis, driver and
 * event:
 *
 *   /products/1-43-looksmart-2024-formula-1-ferrari-sf-24-monaco-gp-winner-16-charles-leclerc
 *
 * So: prefilter 65,000 URLs down to a few hundred candidates for free, then
 * fetch only those product pages and read the SKU out of their Product JSON-LD.
 * That is ~370 requests rather than 65,000, and the SKU makes the match as
 * certain as a Shopify feed match rather than a guess from the slug.
 *
 * The slug is NOT trusted on its own, and it should not be. Tested against three
 * real listings, two confirmed and one was correctly rejected: a slug reading
 * "minichamps 2024 mercedes w15 george russell" looked right for 410241163, but
 * the page's own SKU was 410240163 — one digit apart, a different round.
 *
 * Returns the same shape as fetchShopifyFeed so matching, price guards, the
 * currency anchor, pre-order detection and the admin panel all work unchanged.
 */

const UA = 'diecasts.app catalogue matcher (+https://diecasts.app)';
const DELAY_MS = 250;
const PAGE_TIMEOUT = 25000;

/**
 * Product pages read at once, and the pause between batches.
 *
 * Sequential was too slow to finish: the prefilter returns 528 candidates for
 * LIVECARMODEL, and 528 round trips 250ms apart is ~6.2 minutes — past the
 * route's 300s ceiling, so the sweep died before writing anything.
 *
 * Three at a time with a 300ms gap is about four requests a second and brings
 * the same run to roughly two minutes. Deliberately modest: this is someone
 * else's shop, the work is entirely on their side, and there is no deadline
 * worth being rude for.
 */
const CONCURRENCY = 3;
const BATCH_DELAY_MS = 300;

/**
 * Bounds the number of product pages fetched in one sweep.
 *
 * A prefilter that suddenly matches thousands would otherwise turn a five-minute
 * sweep into an hour of requests against someone else's server. When it bites,
 * `truncated` says so rather than letting a partial answer read as complete.
 */
const MAX_CANDIDATES = 800;

export interface SitemapShop {
  /** Where the sitemap index lives, relative to the host. */
  sitemapPath: string;
  /** Only URLs containing this are products. */
  productMarker: string;
}

/**
 * Shops readable this way. Adding one is a line here, not new code — the
 * pipeline is generic once the sitemap path is known.
 */
export const SITEMAP_SHOPS: Record<string, SitemapShop> = {
  'livecarmodel.com': { sitemapPath: '/xmlsitemap.php', productMarker: '/products/' },
};

export function sitemapShopFor(host: string): SitemapShop | null {
  const bare = host.replace(/^www\./, '').toLowerCase();
  return SITEMAP_SHOPS[bare] || SITEMAP_SHOPS[host.toLowerCase()] || null;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

async function getText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(PAGE_TIMEOUT),
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** Every product URL the shop publishes. */
export async function fetchSitemapUrls(
  host: string,
  shop: SitemapShop
): Promise<{ urls: string[]; requests: number }> {
  let requests = 0;

  const index = await getText(`https://${host}${shop.sitemapPath}`);
  requests++;
  if (!index) return { urls: [], requests };

  // The index's own <loc> values arrive HTML-escaped, so `&amp;` has to be
  // decoded before fetching or the query string breaks and every sub-sitemap
  // silently returns nothing.
  const subs = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(m => decodeEntities(m[1]))
    .filter(u => /product/i.test(u));

  const urls: string[] = [];
  for (const sub of subs) {
    const body = await getText(sub);
    requests++;
    if (!body) continue;
    urls.push(...[...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => decodeEntities(m[1])));
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return { urls: urls.filter(u => u.includes(shop.productMarker)), requests };
}

/**
 * Country adjectives folded onto one token, so a model's "Spanish GP" can meet
 * a slug's "spanish". Both sides go through the SAME normaliser — the first
 * attempt at this scored zero matches out of 65,000 URLs because slugs were
 * flattened to spaces while the query still contained "1-18", and country
 * adjectives were folded on one side only.
 */
const COUNTRY_FORMS: [RegExp, string][] = [
  [/\bsaudi arabian\b/g, 'saudi'], [/\bunited states\b/g, 'usa'],
  [/\bemilia romagna\b/g, 'imola'], [/\bmexico city\b/g, 'mexico'],
  [/\bbrazilian\b/g, 'brazil'], [/\bitalian\b/g, 'italy'], [/\bspanish\b/g, 'spain'],
  [/\bmexican\b/g, 'mexico'], [/\baustrian\b/g, 'austria'], [/\baustralian\b/g, 'australia'],
  [/\bhungarian\b/g, 'hungary'], [/\bjapanese\b/g, 'japan'], [/\bchinese\b/g, 'china'],
  [/\bbritish\b/g, 'britain'], [/\bbelgian\b/g, 'belgium'], [/\bdutch\b/g, 'netherlands'],
  [/\bcanadian\b/g, 'canada'], [/\bbahraini\b/g, 'bahrain'], [/\bqatari\b/g, 'qatar'],
  [/\bazerbaijani\b/g, 'azerbaijan'], [/\bsingaporean\b/g, 'singapore'], [/\bamerican\b/g, 'usa'],
];

export function normaliseForSlug(text: string): string {
  let x = (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\bgrand prix\b/g, 'gp');
  for (const [re, token] of COUNTRY_FORMS) x = x.replace(re, token);
  return ' ' + x.replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

export interface CandidateModel {
  sku: string;
  scale: string | null;
  manufacturer: string | null;
  driver: string | null;
  event: string | null;
  year: number | null;
}

/** Slugs that could plausibly be one of these models. Free — no network. */
export function prefilter(urls: string[], models: CandidateModel[], marker: string): string[] {
  const docs = urls.map(u => ({
    u,
    w: normaliseForSlug(u.split(marker)[1]?.replace(/\.html.*$/, '') || ''),
  }));

  const keep = new Set<string>();
  for (const m of models) {
    const [a, b] = (m.scale || '').split(':');
    const scaleTok = a && b ? ` ${a} ${b} ` : null;
    const mfr = normaliseForSlug(m.manufacturer || '').trim().split(' ')[0];
    const surnames = normaliseForSlug(m.driver || '')
      .trim()
      .split(/[+/&,]/)
      .map(p => p.trim().split(' ').pop())
      .filter(Boolean) as string[];
    const eventTokens = normaliseForSlug(m.event || '')
      .trim()
      .split(' ')
      .filter(t => t.length > 2 && t !== 'gp');

    if (!scaleTok || !mfr || !surnames.length) continue;

    for (const d of docs) {
      if (!d.w.includes(scaleTok)) continue;
      if (!d.w.includes(' ' + mfr + ' ')) continue;
      if (!surnames.every(sn => d.w.includes(' ' + sn + ' '))) continue;
      if (m.year && !d.w.includes(' ' + m.year + ' ')) continue;
      if (eventTokens.length && !eventTokens.some(t => d.w.includes(' ' + t + ' '))) continue;
      keep.add(d.u);
    }
  }
  return [...keep];
}

/** Product JSON-LD: the shop's own statement of what this page is. */
function readProductJsonLd(html: string): {
  sku: string | null;
  price: number | null;
  currency: string | null;
  available: boolean;
  image: string | null;
  name: string | null;
} | null {
  for (const m of html.matchAll(
    /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (node?.['@type'] !== 'Product') continue;
        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
        const price = offer?.price != null ? parseFloat(String(offer.price)) : null;
        return {
          sku: node.sku || node.mpn || null,
          price: Number.isFinite(price) ? price : null,
          currency: offer?.priceCurrency || null,
          available: !/OutOfStock|SoldOut|Discontinued/i.test(String(offer?.availability || '')),
          image: Array.isArray(node.image) ? node.image[0] : node.image || null,
          name: node.name || null,
        };
      }
    } catch {
      /* a malformed block is not a reason to abandon the page */
    }
  }
  return null;
}

export async function fetchSitemapFeed(
  rawHost: string,
  models: CandidateModel[]
): Promise<FeedResult> {
  const host = rawHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const shop = sitemapShopFor(host);
  const bySku = new Map<string, FeedVariant>();

  if (!shop) return { host, products: 0, variants: 0, requests: 0, truncated: false, bySku };

  const { urls, requests: sitemapRequests } = await fetchSitemapUrls(host, shop);
  const candidates = prefilter(urls, models, shop.productMarker);

  const truncated = candidates.length > MAX_CANDIDATES;
  const toFetch = candidates.slice(0, MAX_CANDIDATES);

  let requests = sitemapRequests;
  let variants = 0;

  // Batched rather than one-at-a-time. The pause is between batches and never
  // skipped: an earlier version paused only after a page that yielded a new
  // SKU, so pages that parsed to nothing were hammered with no gap at all —
  // fastest exactly where we were getting no value.
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const pages = await Promise.all(batch.map(async url => ({ url, html: await getText(url) })));
    requests += batch.length;

    for (const { url, html } of pages) {
      if (!html) continue;

      const p = readProductJsonLd(html);
      if (!p?.sku) continue;

      variants++;
      const key = p.sku.trim().toUpperCase();
      if (bySku.has(key)) continue;

      bySku.set(key, {
        sku: p.sku.trim(),
        title: p.name || url.split(shop.productMarker)[1] || '',
        handle: url.split(shop.productMarker)[1] || '',
        productUrl: url,
        price: p.price,
        available: p.available,
        imageUrl: p.image,
        compareAtPrice: null,
      });
    }

    if (i + CONCURRENCY < toFetch.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return { host, products: urls.length, variants, requests, truncated, bySku };
}
