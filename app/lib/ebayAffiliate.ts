/**
 * eBay Partner Network tracking on outbound listing links.
 *
 * Built from a link the EPN generator produced for a real listing:
 *
 *   https://www.ebay.com.au/itm/336682720088
 *     ?mkcid=1&mkrid=705-53470-19255-0&siteid=15
 *     &campid=5339190001&customid=&toolid=10001&mkevt=1
 *
 * The generator also appends an `amdata=enc%3A...` blob. That is specific to
 * the item it was generated for, so it is deliberately NOT reproduced here —
 * copying one item's amdata onto another link would be wrong.
 *
 * Inert until EBAY_CAMPAIGN_ID is set. With no campaign id the original URL is
 * returned untouched, so this is safe to ship before approval comes through
 * and safe to switch off by clearing one environment variable.
 */

/**
 * Per-marketplace routing. `siteid` identifies the eBay site and `mkrid` is the
 * rotation id EPN issues per site — they must agree, so they travel together.
 *
 * Only AU is confirmed, from a generated link. Every current listing is
 * EBAY_AU. A marketplace without an entry gets an untracked link rather than a
 * guessed one: a wrong mkrid silently loses attribution, which is worse than
 * no tracking because it looks like it is working.
 */
const MARKETPLACES: Record<string, { siteid: string; mkrid: string; host: string }> = {
  EBAY_AU: { siteid: '15', mkrid: '705-53470-19255-0', host: 'www.ebay.com.au' },
};

export interface AffiliateOptions {
  /** eBay marketplace the listing belongs to, e.g. "EBAY_AU". */
  marketplace?: string | null;
  /**
   * Free-text field returned in EPN reports. We pass the model SKU, which
   * turns "you earned $9" into "the Qatar 1:18 Verstappen converts" — the
   * difference between revenue and a signal about what collectors want.
   */
  customId?: string | null;
}

/** Only alphanumerics and dashes survive; EPN rejects anything exotic. */
function cleanCustomId(raw?: string | null): string {
  return (raw || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function isAffiliateEnabled(): boolean {
  return !!process.env.EBAY_CAMPAIGN_ID;
}

export function ebayAffiliateUrl(url: string, opts: AffiliateOptions = {}): string {
  const campid = process.env.EBAY_CAMPAIGN_ID;
  if (!campid || !url) return url;

  const market = MARKETPLACES[opts.marketplace || 'EBAY_AU'];
  if (!market) return url;

  try {
    const u = new URL(url);

    // Only touch eBay item pages. A stored URL could be anything, and adding
    // tracking to a non-eBay host would be meaningless at best.
    if (!/(^|\.)ebay\.[a-z.]+$/.test(u.hostname)) return url;

    // Preserve any existing params, but ours win.
    u.searchParams.set('mkcid', '1');
    u.searchParams.set('mkrid', market.mkrid);
    u.searchParams.set('siteid', market.siteid);
    u.searchParams.set('campid', campid);
    u.searchParams.set('toolid', '10001');
    u.searchParams.set('mkevt', '1');

    const custom = cleanCustomId(opts.customId);
    if (custom) u.searchParams.set('customid', custom);

    return u.toString();
  } catch {
    return url;
  }
}
