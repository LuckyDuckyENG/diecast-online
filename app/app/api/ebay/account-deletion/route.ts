import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

/**
 * eBay Marketplace Account Deletion notification endpoint.
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * eBay requires every production application to host one, and re-validates it
 * periodically rather than only at setup. An endpoint that fails validation
 * can have its production keyset disabled — which here would stop the price
 * refresh, the batch searches and every eBay price on the site, all at once
 * and for a reason that has nothing to do with the code that broke.
 *
 * WHAT WAS WRONG
 *
 * The challenge handler echoed the challenge code straight back:
 *
 *     GET ?challenge_code=test123  ->  {"challengeResponse":"test123"}
 *
 * eBay's spec is a SHA-256 hash of three values concatenated in a fixed
 * order — challenge code, verification token, endpoint URL — returned as hex.
 * The endpoint URL was even computed in the old code and then never used.
 *
 * THE THREE INPUTS MUST MATCH eBay'S PORTAL EXACTLY
 *
 * The hash is only correct if the verification token and the endpoint URL are
 * character-for-character what is registered under Develop ->
 * Notifications -> Marketplace Account Deletion. A trailing slash or a
 * different token produces a valid-looking hash that fails every time, which
 * is the hard version of this bug to diagnose.
 */

/** Must equal the endpoint registered with eBay, exactly. */
const ENDPOINT =
  process.env.EBAY_DELETION_ENDPOINT || 'https://diecasts.app/api/ebay/account-deletion';

/**
 * Must equal the verification token entered in eBay's portal. 32-80
 * characters, alphanumeric plus underscore and hyphen.
 *
 * The fallback is the value this repository shipped with. It is kept so that
 * behaviour does not change silently for an endpoint that may already be
 * registered with it — but it is a literal in a public repo, so if eBay's
 * portal is being reconfigured anyway, set EBAY_DELETION_TOKEN to something
 * new in both places.
 */
const TOKEN =
  process.env.EBAY_DELETION_TOKEN ||
  process.env.EBAY_WEBHOOK_SECRET ||
  'ebay_webhook_secret_123456789123';

/**
 * The validation handshake.
 *
 * Order matters and is eBay's, not ours: challengeCode, then token, then
 * endpoint. Hex digest, 200, application/json.
 */
export async function GET(request: NextRequest) {
  const challengeCode = request.nextUrl.searchParams.get('challenge_code');

  if (!challengeCode) {
    return NextResponse.json({ status: 'eBay account deletion endpoint active' });
  }

  const challengeResponse = createHash('sha256')
    .update(challengeCode)
    .update(TOKEN)
    .update(ENDPOINT)
    .digest('hex');

  return NextResponse.json({ challengeResponse });
}

/**
 * The notification itself.
 *
 * Always 200, even on a malformed body: eBay retries on a non-2xx and
 * repeated failures count against the endpoint's health. Acknowledging a
 * message we could not parse is better than being marked unreachable.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: verify the signature. eBay signs with a
 * rotating public key that has to be fetched from its Notification API and
 * cached, which is real work. The old code claimed to check a token and did
 * not, which is worse than not checking — it reads as done.
 *
 * The exposure is bounded and worth stating plainly: this site stores NO eBay
 * user data. There are no accounts, no buyer or seller records, nothing keyed
 * to an eBay user id. `ebay_links` holds listings, not people. So there is
 * nothing for a deletion notice to delete and nothing a forged one could
 * destroy — it would cause a log line. If user data is ever stored, signature
 * verification has to be built before it is.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    console.log('eBay account deletion notification:', JSON.stringify(body)?.slice(0, 500));
  } catch {
    /* acknowledged regardless — see above */
  }
  return NextResponse.json({ success: true });
}
