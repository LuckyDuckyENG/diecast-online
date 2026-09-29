'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_CURRENCY,
  DISPLAY_CURRENCIES,
  convertFromAud,
  currencyForCountry,
  currencyFromLocale,
  formatMoney,
  type DisplayCurrency,
} from '@/lib/displayCurrency';

/**
 * The visitor's display currency, resolved once and shared by every price on
 * the page.
 *
 * WHY THIS IS CLIENT-SIDE, WHICH IS NOT THE OBVIOUS CHOICE
 *
 * Car pages, browse and the hubs are statically prerendered with a one-day
 * revalidate. That is deliberate: hourly regeneration of pages that each read
 * the whole dataset is what exceeded the Supabase egress quota on 2026-09-22.
 *
 * A per-visitor currency cannot be baked into a page shared by every visitor.
 * Rendering it on the server would mean making those pages dynamic, which
 * walks straight back into the outage. So the HTML ships AUD -- which is also
 * what a crawler should see, since it matches the JSON-LD -- and the browser
 * rewrites it after hydration.
 *
 * The cost is a brief AUD flash on first paint for non-Australian visitors.
 * The chosen currency is kept in localStorage and read synchronously on the
 * first client render, so that flash happens once per browser rather than
 * once per page.
 */

type Ctx = {
  currency: DisplayCurrency;
  setCurrency: (c: DisplayCurrency) => void;
  /** AUD -> X. Empty until /api/fx answers. */
  rates: Record<string, number>;
  /** Formats an AUD amount in the visitor's currency, or AUD if no rate. */
  format: (aud: number) => string;
  /**
   * The two halves of `format`, for callers that need them apart -- a range
   * reads "USD 120.00-190.00", with the code said once rather than twice.
   */
  amount: (aud: number) => number;
  /** The code actually in use, which is AUD whenever no rate is available. */
  code: string;
  /** True once a non-AUD currency with a usable rate is in effect. */
  converting: boolean;
  asOf: string | null;
};

const CurrencyContext = createContext<Ctx | null>(null);

const KEY = 'diecasts:currency';

const isDisplay = (v: unknown): v is DisplayCurrency =>
  typeof v === 'string' && (DISPLAY_CURRENCIES as readonly string[]).includes(v);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  /**
   * Read synchronously, not in an effect. An effect would render AUD first
   * even for someone who chose USD three visits ago.
   */
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() => {
    if (typeof window === 'undefined') return DEFAULT_CURRENCY;
    try {
      const saved = window.localStorage.getItem(KEY);
      return isDisplay(saved) ? saved : DEFAULT_CURRENCY;
    } catch {
      return DEFAULT_CURRENCY;
    }
  });
  const [rates, setRates] = useState<Record<string, number>>({});
  const [asOf, setAsOf] = useState<string | null>(null);
  // Whether the visitor has ever chosen for themselves. A stored choice must
  // never be overridden by geography on a later visit.
  const [chosen, setChosen] = useState(false);

  const setCurrency = (c: DisplayCurrency) => {
    setCurrencyState(c);
    setChosen(true);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      /* private browsing: the choice lasts this page only, which is fine */
    }
  };

  // Rates. One cached request; /api/fx is force-static with a six-hour window.
  useEffect(() => {
    let alive = true;
    fetch('/api/fx')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive || !d) return;
        setRates(d.rates || {});
        setAsOf(d.asOf || null);
      })
      .catch(() => {
        /* no rates means no conversion, and every price stays AUD */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Country, only when the visitor has not already chosen and has no stored
  // preference. Guessing over someone's explicit choice would be rude and
  // would look like a bug.
  useEffect(() => {
    if (chosen) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    if (isDisplay(stored)) return;

    let alive = true;
    fetch('/api/geo')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        const guess = d?.country ? currencyForCountry(d.country) : currencyFromLocale();
        // Not persisted. A guess should not harden into a stored preference,
        // or a visitor who travels is stuck with the airport's currency.
        setCurrencyState(guess);
      })
      .catch(() => {
        if (alive) setCurrencyState(currencyFromLocale());
      });
    return () => {
      alive = false;
    };
  }, [chosen]);

  const value = useMemo<Ctx>(() => {
    const converting = currency !== 'AUD' && (rates?.[currency] ?? 0) > 0;
    return {
      currency,
      setCurrency,
      rates,
      asOf,
      converting,
      code: converting ? currency : 'AUD',
      amount: (aud: number) => convertFromAud(aud, currency, rates) ?? aud,
      format: (aud: number) => {
        const v = convertFromAud(aud, currency, rates);
        // No rate: show AUD rather than a number computed from nothing.
        return v == null ? formatMoney(aud, 'AUD') : formatMoney(v, currency);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, rates, asOf]);

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

/**
 * Safe outside the provider: returns a plain AUD formatter. A price component
 * rendered somewhere the provider has not been mounted should show AUD, not
 * throw.
 */
export function useCurrency(): Ctx {
  const ctx = useContext(CurrencyContext);
  if (ctx) return ctx;
  return {
    currency: DEFAULT_CURRENCY,
    setCurrency: () => {},
    rates: {},
    asOf: null,
    converting: false,
    code: 'AUD',
    amount: (aud: number) => aud,
    format: (aud: number) => formatMoney(aud, 'AUD'),
  };
}
