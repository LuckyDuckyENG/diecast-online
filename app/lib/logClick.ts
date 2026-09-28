/**
 * Record that someone left for a shop.
 *
 * Called from an onClick on the outbound link itself. The navigation is NOT
 * blocked or delayed: `keepalive` lets the request outlive the page being
 * unloaded, which is the normal case here -- the whole point of the click is
 * that the visitor is going somewhere else.
 *
 * Without keepalive the browser would cancel the request as it navigates, and
 * the clicks that got cancelled would be exactly the ones that mattered most,
 * the fast decisive ones.
 */
import { isOwnerVisit } from './ownerVisit';

export interface OutboundClick {
  modelId?: string | null;
  carSlug?: string | null;
  retailer?: string | null;
  /** eBay links carry affiliate tracking; shop links do not. */
  kind?: 'shop' | 'ebay';
  priceAud?: number | null;
  /** Was this the cheapest option shown for the model? The interesting one. */
  wasCheapest?: boolean | null;
}

export function logClick(c: OutboundClick): void {
  // Server-rendered passes of this module must do nothing.
  if (typeof window === 'undefined') return;
  // The owner checking his own links is not a visitor leaving to buy, and
  // was_cheapest is the column this table exists for. See lib/ownerVisit.
  if (isOwnerVisit()) return;
  try {
    fetch('/api/log-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
      keepalive: true,
    }).catch(() => { /* never disturb a visitor who is leaving to buy */ });
  } catch {
    /* ditto */
  }
}
