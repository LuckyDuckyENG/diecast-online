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
const MAX_CANDIDATES = 5000;

/**
 * How long the fetch loop may run before it stops and reports where it got to.
 *
 * A COUNT ceiling was the wrong bound. It was set to 800 when the prefilter
 * returned ~530 candidates; importing 179 models into 2022 took that to 884,
 * which is past the ceiling AND past the clock — 800 pages three at a time is
 * about 365s against a 300s route limit. So the count either silently dropped
 * 84 candidates or timed out, and the number to set it to changes every time a
 * season is imported.
 *
 * Time is the thing that actually runs out, so bound that directly. The sweep
 * stops while it can still write what it found, says how many candidates are
 * left, and `offset` picks up from there. Nothing is dropped without being
 * counted, and no import can make this time out again.
 *
 * 240s leaves the sitemap fetch (~10s) and the database writes inside 300s.
 */
const FETCH_BUDGET_MS = 240_000;

export interface SitemapShop {
  /** Where the sitemap index lives, relative to the host. */
  sitemapPath: string;
  /**
   * Which child sitemaps to read. Defaults to any whose URL mentions
   * "product", which is the Shopify convention and was hardcoded until a shop
   * turned up naming them by language instead (`1_gb_0_sitemap.xml`).
   */
  subSitemap?: RegExp;
  /**
   * Only URLs matching this are products. A string is a substring test — the
   * Shopify `/products/` case. A regex is for shops that file products under
   * many category paths and mark them some other way.
   */
  product: string | RegExp;
  /**
   * The URL's last token is the manufacturer's part number.
   *
   * Worth a flag because it makes the prefilter exact. The default path has to
   * guess from slug tokens and needs the SCALE among them; a shop that omits
   * scale from its URLs matches nothing at all that way. When the part number
   * is right there, the candidate list is just the SKUs we already hold.
   */
  skuInUrl?: boolean;
}

/**
 * Shops readable this way. Adding one is a line here, not new code — the
 * pipeline is generic once the sitemap path is known.
 */
export const SITEMAP_SHOPS: Record<string, SitemapShop> = {
  'livecarmodel.com': { sitemapPath: '/xmlsitemap.php', product: '/products/' },
  /**
   * PrestaShop, and unlike the Shopify shops it differs in every respect the
   * pipeline used to assume: the sitemap path comes from robots.txt rather
   * than convention, the child sitemaps are named by language (and publish the
   * same catalogue twice, so French is skipped), every `<loc>` is CDATA-
   * wrapped, products live under a dozen category paths instead of one marker,
   * and the slugs carry no scale.
   *
   * Worth the work: 8,024 F1 products, 3,597 of them pre-1995 — the era no
   * shop we track stocks at all.
   */
  'miniatures-minichamps.com': {
    sitemapPath: '/1_index_sitemap.xml',
    subSitemap: /_gb_\d+_sitemap\.xml$/,
    product: /\/gb\/[^/]+\/[^/]+\.html$/,
    skuInUrl: true,
  },
};

/** Substring for the Shopify case, regex for everything else. */
const isProduct = (u: string, shop: SitemapShop): boolean =>
  typeof shop.product === 'string' ? u.includes(shop.product) : shop.product.test(u);

/** The slug, for display and for the token prefilter to read. */
const handleOf = (u: string, shop: SitemapShop): string =>
  typeof shop.product === 'string'
    ? u.split(shop.product)[1] || ''
    : (u.split('/').pop() || '').replace(/\.html.*$/, '');

/** The trailing part number, when the shop puts one there. */
const skuOf = (u: string): string => {
  const t = (u.split('/').pop() || '').replace(/\.html.*$/, '').split('-');
  return (t[t.length - 1] || '').toUpperCase();
};

export function sitemapShopFor(host: string): SitemapShop | null {
  const bare = host.replace(/^www\./, '').toLowerCase();
  return SITEMAP_SHOPS[bare] || SITEMAP_SHOPS[host.toLowerCase()] || null;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/**
 * Every <loc> in a sitemap, CDATA or not.
 *
 * `<loc>([^<]+)</loc>` cannot read `<loc><![CDATA[https://…]]></loc>`, because
 * the character class stops dead at the `<` that opens the CDATA. It does not
 * error — it returns zero URLs, so a shop that wraps its locs looks exactly
 * like a shop with an empty sitemap.
 */
const locsIn = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?([^\]<]+?)(?:\]\]>)?\s*<\/loc>/g)]
    .map(m => decodeEntities(m[1].trim()));

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
  const subs = locsIn(index).filter(u => (shop.subSitemap || /product/i).test(u));

  const urls: string[] = [];
  for (const sub of subs) {
    const body = await getText(sub);
    requests++;
    if (!body) continue;
    urls.push(...locsIn(body));
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return { urls: urls.filter(u => isProduct(u, shop)), requests };
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
export function prefilter(
  urls: string[],
  models: CandidateModel[],
  shop: SitemapShop
): string[] {
  /**
   * When the shop puts the part number in the URL, the candidate list is an
   * intersection rather than a guess: the SKUs we hold, against the SKUs it
   * publishes. Exact, and it fetches nothing we cannot already identify.
   *
   * This is not an optimisation, it is the only thing that works for such a
   * shop. The token path below REQUIRES the scale among the slug's words, and
   * these slugs carry no scale at all — "…-monaco-1989-ayrton-senna-tsm124331"
   * — so it would keep zero URLs and the sweep would report a clean run over
   * an empty catalogue.
   */
  if (shop.skuInUrl) {
    const want = models
      .map(m => (m.sku || '').trim().toUpperCase())
      .filter(s => s.length >= 4);
    if (!want.length) return [];
    const exact = new Set(want);
    /**
     * A tolerant tail match as well as an exact one, because the URL carries a
     * SHORTENED part number for some makers: the page states
     * `F1BRACOL001-51589` and publishes it at `…-51589`, `GP12-29AWD` at
     * `…-29awd`. Our catalogue holds the short form, so an exact-only test
     * silently drops every Edicola and GP Replicas model on the site.
     *
     * Only tails at a separator boundary count, so `51589` cannot match
     * `4451589`.
     *
     * FIVE CHARACTERS MINIMUM, measured rather than guessed. Across the
     * 35,767 product URLs, four-character trailing tokens are ambiguous on 12%
     * of URLs; five-character ones on 1%. A wrong match here misprices a model
     * rather than wasting a fetch, so the short ones are left out.
     *
     * The cost is known: Tecnomodel and GP Replicas publish four-character
     * tails (`TM18-385E` at `…-385e`, `GP43-046A` at `…-046a`), 11 of the 191
     * Senna pages. Those models are reachable only if the catalogue holds the
     * full form. Worth revisiting by normalising those SKUs at import, not by
     * lowering this number.
     */
    const tails = want.filter(s => s.length >= 5);
    return urls.filter(u => {
      const t = skuOf(u);
      if (exact.has(t)) return true;
      return t.length >= 5 && tails.some(s => s.endsWith(t) && /[^A-Z0-9]/.test(s[s.length - t.length - 1] || ''));
    });
  }

  const docs = urls.map(u => ({ u, w: normaliseForSlug(handleOf(u, shop)) }));

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

/**
 * Repair a PrestaShop image URL the shop publishes without its image id.
 *
 * miniatures-minichamps's JSON-LD states
 *   https://…/-large_default/mclaren-…-tsm124331.jpg
 * and that 404s. The id is missing. The correct URL is on the same page, in
 * the markup rather than the structured data:
 *   https://…/1276-large_default/mclaren-…-tsm124331.jpg   → 200, 16 KB
 *
 * So the shop's own structured data is wrong, and we stored it faithfully --
 * 245 models ended up with an image that renders as the grey "?" placeholder.
 * Given the filename is identical, the id can be recovered by looking for the
 * same file WITH one, which is what this does.
 *
 * Returns the original URL untouched when it already has an id, or when the
 * page offers no better candidate: a broken image is still better than none,
 * because `image_url` being set is what stops a later sweep overwriting it
 * with something worse.
 */
function repairImageUrl(url: string | null, html: string): string | null {
  if (!url || !/\/-[a-z_]+_default\//.test(url)) return url;
  const file = url.split('/').pop();
  if (!file) return url;
  const size = url.match(/\/-([a-z_]+_default)\//)?.[1] || 'large_default';
  const rx = new RegExp(
    `https?://[^"'\\s]+?/(\\d+)-${size}/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
  );
  const found = html.match(rx);
  return found ? found[0] : url;
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
          image: repairImageUrl(
            (Array.isArray(node.image) ? node.image[0] : node.image) || null,
            html
          ),
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
  models: CandidateModel[],
  opts: { offset?: number; budgetMs?: number } = {}
): Promise<FeedResult> {
  const host = rawHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const shop = sitemapShopFor(host);
  const bySku = new Map<string, FeedVariant>();

  if (!shop) return { host, products: 0, variants: 0, requests: 0, truncated: false, bySku };

  const { urls, requests: sitemapRequests } = await fetchSitemapUrls(host, shop);
  const candidates = prefilter(urls, models, shop);

  // Sorted so `offset` means the same thing across runs. prefilter builds a Set
  // and Set order depends on which model matched first, which changes whenever
  // the catalogue does -- resuming from an offset into an unstable order would
  // re-read some pages and skip others.
  candidates.sort();

  const offset = Math.max(0, opts.offset || 0);
  const budgetMs = opts.budgetMs ?? FETCH_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const toFetch = candidates.slice(offset, offset + MAX_CANDIDATES);
  let stoppedAt = offset + toFetch.length;

  let requests = sitemapRequests;
  let variants = 0;

  // Batched rather than one-at-a-time. The pause is between batches and never
  // skipped: an earlier version paused only after a page that yielded a new
  // SKU, so pages that parsed to nothing were hammered with no gap at all —
  // fastest exactly where we were getting no value.
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    // Checked before the batch, not after, so the run always ends with time
    // left to write what it has. Stopping here is a normal outcome, not a
    // failure: `nextOffset` says where to resume.
    if (Date.now() > deadline) {
      stoppedAt = offset + i;
      break;
    }
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

      /**
       * Also filed under the part number the URL used, when that is a tail of
       * the page's own SKU.
       *
       * The caller matches these keys against catalogue SKUs by exact string,
       * and for 32 of 191 cached Senna pages the two forms differ — we hold
       * `51589`, the page says `F1BRACOL001-51589`. Without the alias the
       * fetch succeeds, the variant is stored, and the model it belongs to
       * never finds it: a silent miss that looks like the shop not stocking
       * the model.
       *
       * Never overwrites. An alias that is already a real SKU belongs to
       * whichever product claimed it first, exactly as duplicates are handled
       * above.
       */
      const alias = skuOf(url);
      if (alias.length >= 5 && alias !== key && key.endsWith(alias) && !bySku.has(alias)) {
        bySku.set(alias, {
          sku: p.sku.trim(),
          title: p.name || handleOf(url, shop),
          handle: handleOf(url, shop),
          productUrl: url,
          price: p.price,
          available: p.available,
          imageUrl: p.image,
          compareAtPrice: null,
        });
      }

      bySku.set(key, {
        sku: p.sku.trim(),
        title: p.name || handleOf(url, shop),
        handle: handleOf(url, shop),
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

  const done = stoppedAt >= candidates.length;

  return {
    host,
    products: urls.length,
    variants,
    requests,
    // Still true when the run is partial, so every existing caller and the
    // admin's "results incomplete" warning keep working unchanged.
    truncated: !done,
    candidates: candidates.length,
    scanned: stoppedAt,
    nextOffset: done ? null : stoppedAt,
    bySku,
  };
}
