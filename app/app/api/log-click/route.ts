import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Records one outbound click. Fire and forget, same shape as log-search.
 *
 * Runs on the server because the two facts worth having alongside the click --
 * the visitor's country and whether the request looks automated -- live in
 * request headers the browser cannot be trusted to report, and because the
 * table is closed to anon by RLS.
 *
 * Volume is one row per CLICK, which is rarer than a search and far rarer than
 * a page view. Page views stay with Vercel precisely so the frequent thing
 * never reaches Supabase.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Same list as log-search. Catches the crawlers that identify themselves. */
const BOT =
  /bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebookexternalhit|embedly|quora|pinterest|slackbot|vkshare|whatsapp|flipboard|tumblr|curl|wget|python-requests|headless|lighthouse|gptbot|claude|ccbot|ahrefs|semrush|mj12|dotbot/i;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Local testing must not enter the record. Same reasoning as log-search: the
 * dev server writes to the real table, and testing on a real phone over the
 * LAN is the only way to check mobile without adding page views to Vercel and
 * impressions to Search Console. Tapping through shop links while testing
 * would otherwise write clicks that never happened.
 */
const RECORDING = process.env.NODE_ENV === 'production';

export async function POST(request: NextRequest) {
  try {
    if (!RECORDING) return new NextResponse(null, { status: 204 });

    const b = await request.json().catch(() => null);
    if (!b) return new NextResponse(null, { status: 204 });

    const ua = request.headers.get('user-agent') || '';
    const country =
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      null;

    const { error } = await supabase.from('outbound_clicks').insert({
      // Validated rather than trusted: this arrives from the browser, and a
      // malformed uuid would fail the insert and lose the whole row.
      model_id: typeof b.modelId === 'string' && UUID.test(b.modelId) ? b.modelId : null,
      car_slug: typeof b.carSlug === 'string' ? b.carSlug.slice(0, 120) : null,
      retailer: typeof b.retailer === 'string' ? b.retailer.slice(0, 80) : null,
      kind: b.kind === 'ebay' ? 'ebay' : 'shop',
      price_aud: Number.isFinite(b.priceAud) && b.priceAud > 0 ? b.priceAud : null,
      was_cheapest: typeof b.wasCheapest === 'boolean' ? b.wasCheapest : null,
      country,
      is_bot: BOT.test(ua),
    });
    if (error) console.warn('click log insert failed:', error.message);

    // Always 204. This observes the site; a logging fault must never reach
    // someone who is in the middle of leaving for a shop.
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
