'use client';

import { useCurrency } from './CurrencyProvider';

/**
 * One AUD figure, shown in the visitor's currency.
 *
 * Exists so a SERVER component can display a converted price without becoming
 * a client component itself. The hub pages are server-rendered on purpose --
 * they carry the summary text Google reads -- and turning one into a client
 * component to reformat a single number would ship the whole page's JavaScript
 * for it.
 *
 * `aud` must already be in AUD, which every stored price_aud and every
 * lowestPrice is. A shop's own quoted price never comes through here: that is
 * shown in the shop's currency because it is what the card is charged.
 */
export default function Money({
  aud,
  /** Rendered instead when there is no figure, e.g. a car with no price yet. */
  fallback = null,
}: {
  aud: number | null | undefined;
  fallback?: React.ReactNode;
}) {
  const { format } = useCurrency();
  if (aud == null || !isFinite(aud)) return <>{fallback}</>;
  return <>{format(aud)}</>;
}
