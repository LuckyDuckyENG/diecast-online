import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Records one search. Fire and forget.
 *
 * The browser cannot write this itself: the table is closed to anon by RLS,
 * and the two things worth recording alongside the query -- the visitor's
 * country and whether the request looks automated -- are only visible on the
 * server, in request headers a client cannot be trusted to report.
 *
 * Deliberately cheap. One insert per SEARCH, not per page view. Page views are
 * measured by Vercel at the edge precisely so the highest-frequency event on
 * the site never touches Supabase, which is the resource this project
 * exceeded on 2026-09-22.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Enough to catch the honest ones.
 *
 * Crawlers that identify themselves are the overwhelming majority of automated
 * traffic and all of them say so here. Anything deliberately disguising itself
 * will get through, which is why the flag is STORED rather than used to drop
 * the row: the rule can be tightened later without having thrown away the
 * evidence.
 */
const BOT =
  /bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebookexternalhit|embedly|quora|pinterest|slackbot|vkshare|whatsapp|flipboard|tumblr|curl|wget|python-requests|headless|lighthouse|gptbot|claude|ccbot|ahrefs|semrush|mj12|dotbot/i;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const raw = typeof body?.q === 'string' ? body.q : '';
    const results = Number.isFinite(body?.results) ? Math.max(0, Math.trunc(body.results)) : null;

    // Same floor as searchCars: shorter than this never ran a search, so
    // recording it would count keystrokes rather than intent.
    const query = raw.trim().toLowerCase().slice(0, 80);
    if (query.length < 2 || results === null) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const ua = request.headers.get('user-agent') || '';
    /**
     * Country from the hosting layer, never from a geo-IP lookup and never
     * finer than country. Vercel sets the first; the others are here so this
     * keeps working if the site ever moves.
     */
    const country =
      request.headers.get('x-vercel-ip-country') ||
      request.headers.get('cf-ipcountry') ||
      null;

    const { error } = await supabase.from('search_queries').insert({
      query,
      results,
      country,
      is_bot: BOT.test(ua),
    });
    if (error) console.warn('search log insert failed:', error.message);

    // Always 204, even on a failed insert. This endpoint exists to observe the
    // site, and a logging fault must never surface to someone searching.
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
