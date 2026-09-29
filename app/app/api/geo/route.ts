import { NextRequest, NextResponse } from 'next/server';

/**
 * Which country this request came from. Nothing else.
 *
 * The currency a visitor wants is best guessed from where they are, and that
 * is only visible on the server: `x-vercel-ip-country` is set at the edge and
 * cannot be read from the browser.
 *
 * Why not put it in /api/fx: that route is `force-static` so every visitor
 * gets one cached body, which is exactly right for rates and exactly wrong for
 * anything per-visitor. Mixing them would have served the first visitor's
 * country to everyone for six hours.
 *
 * Why not use navigator.language instead and skip the request: it reports the
 * browser's locale, not the user's location. An Australian running an en-US
 * system would be quoted USD. It is kept as the fallback below, because a
 * wrong guess that the visitor can override beats no guess at all.
 *
 * This holds no database call and no secret, and returns a two-letter code. It
 * is deliberately NOT logged -- search_queries and outbound_clicks record
 * country against an action the visitor took, which is a different thing from
 * recording every page view's location.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    null;

  return NextResponse.json(
    { country },
    {
      // Private, because the answer differs per visitor. Without this a shared
      // cache could hand one visitor's country to the next.
      headers: { 'Cache-Control': 'private, no-store' },
    }
  );
}
