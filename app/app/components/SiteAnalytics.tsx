'use client';

import { Analytics } from '@vercel/analytics/next';
import { isOwnerVisit } from '@/lib/ownerVisit';

/**
 * Vercel Analytics, with the owner's own visits dropped.
 *
 * `beforeSend` runs per event and cancels it by returning null. This has to be
 * a client component because that is a function prop, which a server component
 * cannot pass — which is the only reason this wrapper exists.
 *
 * The check runs per event rather than once at mount so that arming the flag
 * with ?notme=1 takes effect on the same visit, not the next one.
 *
 * See lib/ownerVisit for why this matters at all: with search_queries holding
 * a single row, one session of the owner checking his own site would have been
 * the whole dataset.
 */
export default function SiteAnalytics() {
  return <Analytics beforeSend={event => (isOwnerVisit() ? null : event)} />;
}
