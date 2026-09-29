'use client';

import { DISPLAY_CURRENCIES } from '@/lib/displayCurrency';
import { useCurrency } from './CurrencyProvider';

/**
 * Lets the visitor override the guess.
 *
 * A guess from an IP address is right most of the time and wrong in the cases
 * people notice: a VPN, a traveller, an expatriate who still buys in their old
 * currency. The override is cheap to offer and removes any need for the guess
 * to be clever.
 *
 * It sits in the footer rather than the header on purpose. Currency is not a
 * primary action -- the price the shop charges is shown natively either way,
 * and this only changes the approximation beside it -- and the mobile header
 * is already carrying a logo, Browse and a full-width search row at 71% of
 * traffic.
 */
export default function CurrencyPicker() {
  const { currency, setCurrency, rates, asOf, ratesLoaded } = useCurrency();

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="currency" className="text-white/60">
        Show prices in
      </label>
      <select
        id="currency"
        value={currency}
        onChange={e => setCurrency(e.target.value as any)}
        className="rounded-md border border-white/20 bg-transparent px-2 py-1 text-white"
      >
        {DISPLAY_CURRENCIES.map(c => (
          <option
            key={c}
            value={c}
            /**
             * Only disabled once we KNOW there is no rate.
             *
             * Before /api/fx answers, every rate is missing, so disabling on
             * "no rate" alone greys out all seven and tells the visitor that
             * AUD is their only option — which is not true, it is just not
             * loaded. In the server-rendered HTML that is the whole list, so
             * anyone glancing at the footer on first paint saw exactly that.
             */
            disabled={ratesLoaded && c !== 'AUD' && !(rates?.[c] > 0)}
            className="text-[#1a1916]"
          >
            {c}
          </option>
        ))}
      </select>
      {currency !== 'AUD' && asOf && (
        /* Dated on purpose. An approximate figure with no date is the thing
           that let a five-week-old rate pass unnoticed. */
        <span className="text-white/40 text-xs">approx, ECB {asOf}</span>
      )}
    </div>
  );
}
