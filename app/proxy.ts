import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Lock the admin.
 *
 * Every route under /api/admin runs with the SERVICE ROLE key and none of them
 * checked anything, so all 31 were reachable by anyone who found the URL. The
 * chain was complete without a password: GET /api/admin/get-f1-data returns
 * every car id, and POST /api/admin/delete-car takes one. A stranger could have
 * enumerated the catalogue and deleted it in a loop — 786 cars and 1,788 models.
 *
 * robots.txt disallows /admin, which stops it being INDEXED and does nothing to
 * stop it being visited. It also publishes the path, which is one of the
 * standard ways admin panels get found.
 *
 * This is a shared secret, not a user system. There is one operator, and
 * accounts, sessions, resets and deletion obligations would all be maintenance
 * for a user base of one.
 *
 * Note for anyone expecting middleware.ts: Next 16 renamed the convention to
 * proxy.ts. A file called middleware.ts here would simply never run.
 */

const COOKIE = 'dc_admin';

/**
 * Dev is deliberately open.
 *
 * The sweeps and refreshes are run from localhost — that is the actual
 * workflow, an hour of clicking at a time — and anyone running the dev server
 * already has the service key in .env.local. A password there would protect
 * nothing and interrupt the one place the admin is really used.
 */
const isDev = process.env.NODE_ENV !== 'production';

/** sha256, so the cookie never carries the secret itself. */
const digest = (s: string) => createHash('sha256').update(s).digest();

function tokenMatches(presented: string | undefined, secret: string): boolean {
  if (!presented) return false;
  const a = Buffer.from(presented, 'hex');
  const b = digest(secret);
  // Equal length is guaranteed for two sha256 digests, but a malformed cookie
  // is not a digest — timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function deny(request: NextRequest, why: string) {
  const isApi = request.nextUrl.pathname.startsWith('/api/');
  if (isApi) {
    // JSON for API callers, and 401 rather than 404: pretending the route does
    // not exist would make a genuine misconfiguration impossible to debug.
    return NextResponse.json({ error: 'Unauthorized', details: why }, { status: 401 });
  }
  return new NextResponse(
    `<!doctype html><meta charset=utf-8><title>Admin</title>` +
    `<body style="font:16px system-ui;padding:3rem;max-width:34rem;margin:auto">` +
    `<h1 style="font-size:1.2rem">Admin is locked</h1><p>${why}</p>` +
    `<p style="color:#666">Append <code>?key=…</code> once to sign in.</p>`,
    { status: 401, headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

export function proxy(request: NextRequest) {
  if (isDev) return NextResponse.next();

  const secret = process.env.ADMIN_SECRET;

  /**
   * No secret configured means LOCKED, not open.
   *
   * Failing open would mean a forgotten environment variable silently restores
   * exactly the hole this exists to close, and nothing would look wrong. Being
   * locked out of your own admin is recoverable in a minute; a deleted
   * catalogue is not.
   */
  if (!secret) {
    return deny(request, 'ADMIN_SECRET is not set on this deployment.');
  }

  // Signing in: ?key=… once, which is exchanged for a cookie and stripped from
  // the URL so the secret does not linger in history, logs or a Referer header.
  const key = request.nextUrl.searchParams.get('key');
  if (key && timingSafeEqual(digest(key), digest(secret))) {
    const clean = new URL(request.nextUrl);
    clean.searchParams.delete('key');
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, digest(secret).toString('hex'), {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  if (tokenMatches(request.cookies.get(COOKIE)?.value, secret)) {
    return NextResponse.next();
  }

  return deny(request, 'This page requires the admin key.');
}

export const config = {
  // Only the admin. Everything public is untouched, so a mistake here cannot
  // take the catalogue offline.
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
