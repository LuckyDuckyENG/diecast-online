/**
 * Which currency to show a visitor, and how to show it.
 *
 * WHAT THIS DOES AND DOES NOT CHANGE
 *
 * It changes the APPROXIMATION only. Every shop row already leads with the
 * price the shop will actually charge -- "EUR $79.99" -- because that is the
 * number that reaches the visitor's card, and no conversion here should
 * replace it. What follows in brackets used to be AUD for everyone; now it
 * follows the reader.
 *
 * Ranking is untouched. `price_aud` still decides which shop the site calls
 * cheapest, computed server-side from X -> AUD rates. Converting the ordering
 * currency per visitor would mean the cheapest shop could differ by country
 * through nothing but rounding.
 *
 * WHY 73% OF VISITORS NEEDED THIS
 *
 * Last week: United States 40%, Australia 20%, Netherlands 13%, Singapore 13%,
 * Italy 7%. An American reading a Belgian shop's price saw EUR with an AUD
 * approximation beside it -- two foreign currencies and not one of their own.
 * That is harder to scan than a single foreign currency, which is the usual
 * version of this problem.
 *
 * NO ROUNDING TO "PSYCHOLOGICAL" PRICES
 *
 * Shops round 50.47 to 49.00 because they set the price. This site reports
 * prices it does not set, and rounding a reported number is falsifying the one
 * thing the site exists to get right. Conversions here are marked approximate
 * and left as they fall.
 */

/** Everything the site can display. Must match /api/fx and fetch-fx.mjs. */
export const DISPLAY_CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'CAD', 'NZD', 'SGD', 'JPY'] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export const DEFAULT_CURRENCY: DisplayCurrency = 'AUD';

/**
 * Country to currency.
 *
 * The euro members are listed individually rather than inferred, because there
 * is no rule that gets Denmark and Sweden right -- both are in the EU and
 * neither uses the euro.
 *
 * A country that is not here falls back to AUD, which is honest: it is the
 * currency the comparison is computed in, and it is what the site showed
 * everyone before this existed.
 */
const COUNTRY_TO_CURRENCY: Record<string, DisplayCurrency> = {
  AU: 'AUD',
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  NZ: 'NZD',
  SG: 'SGD',
  JP: 'JPY',
  // Eurozone
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR',
  FR: 'EUR', GR: 'EUR', HR: 'EUR', IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR',
  LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR',
};

export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  if (!country) return DEFAULT_CURRENCY;
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] || DEFAULT_CURRENCY;
}

/**
 * Last resort when the country is unknown: the browser's own locale.
 *
 * Weaker than the edge header, because a locale says what language someone
 * reads, not where they are. Used only when /api/geo returns nothing.
 */
export function currencyFromLocale(): DisplayCurrency {
  if (typeof navigator === 'undefined') return DEFAULT_CURRENCY;
  const tag = navigator.language || '';
  const region = tag.split('-')[1];
  return currencyForCountry(region);
}

/** Currencies with no minor unit. Showing "JPY 12,450.00" marks you out. */
const ZERO_DECIMAL = new Set(['JPY']);

/**
 * Format an amount already in `currency`.
 *
 * Intl is used rather than a symbol table so that grouping and symbol
 * placement are right per locale -- 1.234,56 in Germany, 1,234.56 in the US.
 * The currency code is forced into view (`currencyDisplay: 'code'` style, via
 * an explicit prefix where Intl would use a bare $) because this site shows
 * several currencies on one page and a bare $ is ambiguous between AUD, USD,
 * CAD, NZD and SGD -- five of the eight supported here.
 */
export function formatMoney(amount: number, currency: string): string {
  const digits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    const n = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
    return `${currency} ${n}`;
  } catch {
    return `${currency} ${amount.toFixed(digits)}`;
  }
}

/**
 * Convert an AUD amount for display. Returns null when there is no rate, and
 * callers must then show the AUD figure unchanged.
 *
 * Null rather than a fallback multiplier on purpose. A wrong rate shown
 * confidently is the failure this whole area already had once, when a constant
 * 1.5 stood against a real 1.3902 for five weeks.
 */
export function convertFromAud(
  aud: number,
  currency: DisplayCurrency,
  rates: Record<string, number>
): number | null {
  if (currency === 'AUD') return aud;
  const rate = rates?.[currency];
  if (!(rate > 0)) return null;
  return aud * rate;
}
