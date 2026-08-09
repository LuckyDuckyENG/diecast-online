/**
 * Reading a Shopify shop's catalogue from its public product feed.
 *
 * /products.json is a documented Shopify endpoint returning products as JSON,
 * 250 at a time, with title, SKU, price, availability and images already
 * structured. It replaces fetching product pages and parsing HTML.
 *
 * Why this matters beyond speed: the two worst price bugs in this project --
 * EUR 16,995 and EUR 7,995 stored for models costing under EUR 200 -- were both
 * HTML misparses. A feed field cannot produce those.
 *
 * Measured on anthonysdiecasts.com.au: 54 requests returned 13,400 products in
 * 59.8 seconds. Fetching the same catalogue one product page at a time would be
 * 13,400 requests, roughly four hours, and is what needed a scraping proxy.
 *
 * Politeness: one request at a time with a delay between, identifying itself in
 * the User-Agent. This is a shop's own storefront data, offered publicly, and
 * the cost to them is a few dozen JSON responses rather than thousands of
 * rendered pages.
 */

const PAGE_SIZE = 250;
const DELAY_MS = 300;

/**
 * A page that fails once is usually a timeout or a rate limit, not a missing
 * page. Metro Hobbies reported 15,000 products and zero matches with the
 * truncation flag set — one failure partway through, and the rest of the
 * catalogue was never seen. It carries 161 manufacturer-shaped SKUs in its
 * first 2,000 products, so "zero matches" was never a safe conclusion.
 *
 * Retry with a growing pause before giving up. Failing to fetch and failing to
 * find are different answers, and only one of them is worth acting on.
 */
const PAGE_RETRIES = 3;
const RETRY_BACKOFF_MS = 1500;
/**
 * Bounds a runaway feed. Anthony's needs 54 pages, so this is generous — but
 * when it bites, `truncated` says so. A cap that silently returns a partial
 * catalogue reads as "this shop doesn't stock it", which is the same mistake
 * that cost half the eBay matches on the first run.
 */
const MAX_PAGES = 200;

export interface FeedVariant {
  sku: string;
  title: string;
  handle: string;
  productUrl: string;
  price: number | null;
  available: boolean;
  imageUrl: string | null;
  /** Shopify's own "compare at" price, when the item is discounted. */
  compareAtPrice: number | null;
}

export interface FeedResult {
  host: string;
  products: number;
  variants: number;
  requests: number;
  truncated: boolean;
  /** Uppercased SKU -> variant. First occurrence wins. */
  bySku: Map<string, FeedVariant>;
}

const num = (v: any): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * The currency a shop says it trades in, from /meta.json.
 *
 * Worth reading because the stored retailer record can be wrong and quietly
 * corrupt every price: Stone Model is recorded as CAD, advertises USD here,
 * and served AUD to an Australian request. Treat this as better evidence than
 * the database, but not as proof — Shopify presents prices in the currency it
 * infers from the request, and says nothing about it in products.json. The
 * real protection is the stored-price anchor in retailerSweep.
 */
export async function shopCurrency(host: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${host}/meta.json`, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.currency === 'string' ? body.currency : null;
  } catch {
    return null;
  }
}

/** Is this host a Shopify store with a readable feed? One cheap request. */
export async function isShopify(host: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${host}/products.json?limit=1`, {
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return Array.isArray(body?.products);
  } catch {
    return false;
  }
}

const USER_AGENT = 'diecasts.app catalogue matcher (+https://diecasts.app)';

export async function fetchShopifyFeed(rawHost: string): Promise<FeedResult> {
  const host = rawHost.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const bySku = new Map<string, FeedVariant>();

  let products = 0;
  let variants = 0;
  let requests = 0;
  let page = 1;
  let truncated = false;

  while (page <= MAX_PAGES) {
    let body: any = null;

    for (let attempt = 1; attempt <= PAGE_RETRIES && body === null; attempt++) {
      try {
        const res = await fetch(`https://${host}/products.json?limit=${PAGE_SIZE}&page=${page}`, {
          redirect: 'follow',
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(30000),
        });
        requests++;
        if (res.ok) {
          body = await res.json();
        } else if (attempt === PAGE_RETRIES) {
          console.warn(`⚠️ ${host} page ${page}: HTTP ${res.status} after ${attempt} attempts`);
        }
      } catch (err: any) {
        requests++;
        if (attempt === PAGE_RETRIES) {
          console.warn(`⚠️ ${host} page ${page}: ${err.name} after ${attempt} attempts`);
        }
      }
      if (body === null && attempt < PAGE_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt));
      }
    }

    if (body === null) {
      // Genuinely could not read this page. We hold a partial catalogue, so say
      // so rather than letting missing products read as "not stocked".
      truncated = page > 1;
      break;
    }

    const batch: any[] = body?.products || [];
    if (!batch.length) break;

    products += batch.length;

    for (const p of batch) {
      for (const v of p.variants || []) {
        variants++;
        const sku = String(v.sku || '').trim();
        if (!sku) continue;

        const key = sku.toUpperCase();
        if (bySku.has(key)) continue; // first listing of a SKU wins

        bySku.set(key, {
          sku,
          title: p.title || '',
          handle: p.handle || '',
          productUrl: `https://${host}/products/${p.handle}`,
          price: num(v.price),
          available: v.available !== false,
          imageUrl: p.images?.[0]?.src || p.image?.src || null,
          compareAtPrice: num(v.compare_at_price),
        });
      }
    }

    if (batch.length < PAGE_SIZE) break;
    if (page === MAX_PAGES) truncated = true;

    page++;
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  return { host, products, variants, requests, truncated, bySku };
}
