/**
 * How old a price is, and whether it's still worth quoting.
 *
 * Prices are read by parsing retailer pages, which break in ways we can't see:
 * a site changes its markup, a currency moves, a page starts serving cents. The
 * older a figure is, the more likely it's wrong — and a stale LOW price is the
 * worst failure a comparison site can have, because it sends someone to a shop
 * where the thing costs more.
 *
 * So: show fresh prices plainly, label ageing ones, and stop quoting numbers
 * that are too old to stand behind — while still linking to the retailer, since
 * "this shop stocks it" ages far better than "it costs $349.99".
 */

/** Under this, show the price with no fuss. */
export const FRESH_DAYS = 7;

/** Past this, keep the retailer but stop quoting the number. */
export const STALE_DAYS = 30;

export type Freshness = 'fresh' | 'ageing' | 'stale' | 'unknown';

export function ageInDays(checkedAt?: string | null): number | null {
  if (!checkedAt) return null;
  const then = new Date(checkedAt).getTime();
  if (isNaN(then)) return null;
  return (Date.now() - then) / 86_400_000;
}

export function freshnessOf(checkedAt?: string | null): Freshness {
  const days = ageInDays(checkedAt);
  if (days === null) return 'unknown';
  if (days < FRESH_DAYS) return 'fresh';
  if (days < STALE_DAYS) return 'ageing';
  return 'stale';
}

/** A price we're no longer willing to put a number on. */
export function shouldHidePrice(checkedAt?: string | null): boolean {
  const f = freshnessOf(checkedAt);
  return f === 'stale' || f === 'unknown';
}

/** "just now", "3 hours ago", "12 days ago" */
export function formatAge(checkedAt?: string | null): string {
  const days = ageInDays(checkedAt);
  if (days === null) return 'never checked';

  const minutes = days * 24 * 60;
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${Math.round(minutes)} min ago`;

  const hours = days * 24;
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? '' : 's'} ago`;
  if (days < 30) return `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} ago`;

  const months = days / 30;
  return `${Math.round(months)} month${Math.round(months) === 1 ? '' : 's'} ago`;
}
