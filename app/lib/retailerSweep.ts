import type { FeedVariant } from './shopifyFeed';
import { toAud } from './currency';

/**
 * Matching a shop's catalogue against ours.
 *
 * The eBay matcher has to read a SKU out of a free-text listing title with a
 * regex and hope the seller typed it. Here the SKU is a structured field the
 * retailer filled in themselves, so a match is exact: either their catalogue
 * contains 537236181 or it does not. No parsing, no judgement, no review queue
 * for identity.
 *
 * That moves all the risk onto PRICE, which is where the guards go.
 */

export interface SweepModel {
  id: string;
  sku: string | null;
  scale: string | null;
  label: string;
  /** Existing link at this retailer, if any. */
  existing?: { price: number | null; inStock: boolean | null; productUrl: string | null };
}

export type SweepAction = 'new' | 'refresh' | 'unchanged' | 'review' | 'hold';

export interface SweepMatch {
  model: SweepModel;
  variant: FeedVariant;
  action: SweepAction;
  reason: string;
  /** Only 'new' and 'refresh' are written by a live run. */
  write: boolean;
  /** Shop sells this as not-yet-shipping, at a price we still trust. */
  isPreorder: boolean;
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * A price this far from its peers is not a price.
 *
 * The eBay guard only looked upward, because an inflated listing was the
 * failure we had seen. Sweeping a retailer surfaced the mirror image
 * immediately: a 1:18 model at AUD 50.00, which is a pre-order DEPOSIT, not the
 * cost of the item. Stored as a price it would win every "cheapest" sort on the
 * site — the same damage a zero does, which attachRetailerLink already refuses.
 */
const HIGH_FACTOR = 3;
const LOW_FACTOR = 3;
const MIN_SAMPLES = 5;

/**
 * How far a refreshed price may move before it stops looking like a price
 * change and starts looking like a change of currency. Real diecast prices
 * drift a few percent; USD/AUD is about 50%.
 */
const CURRENCY_SHIFT = 0.25;

/**
 * Shops that mark an item as not-yet-shipping in the title.
 *
 * On its own this says nothing about the price. Anthony's uses "Pre-Order" for
 * AUD 50 deposits; Stone Model uses it for ordinary full-price stock. The same
 * wording means two different things, so it only becomes a decision when
 * combined with the price:
 *
 *   pre-order wording + price far below peers  ->  a deposit, refuse it
 *   pre-order wording + a normal price         ->  a real offer, flag the timing
 */
const PREORDER_MARKERS = /\b(pre[\s-]?order|pre[\s-]?sale|coming soon|back[\s-]?order)\b/i;

/** Wording that means a payment rather than a product, whatever the price. */
const DEPOSIT_MARKERS = /\b(deposit)\b/i;

/** Does the shop present this as not yet shipping? */
export function looksLikePreorder(title: string): boolean {
  return PREORDER_MARKERS.test(title) || DEPOSIT_MARKERS.test(title);
}

export interface ClassifyOptions {
  /** Known good AUD prices per scale, for the outlier check. */
  reference?: Map<string, number[]>;
  /**
   * The currency the feed quotes in.
   *
   * Required for the outlier check to mean anything. The reference is built
   * from price_aud, so comparing a raw feed price against it only works when
   * the shop happens to trade in AUD. Yuui is Dutch: its EUR 58.03 for a 1:43
   * was compared against an AUD 183 median and reported as "3.2x BELOW" —
   * along with 48 other perfectly ordinary European prices. Mini Model Shop's
   * GBP escaped only because the pound is closer to the dollar.
   */
  currency?: string;
}

export function classifyMatches(
  pairs: { model: SweepModel; variant: FeedVariant }[],
  opts: ClassifyOptions = {}
): SweepMatch[] {
  const cur = opts.currency || 'AUD';
  /** Feed price in AUD, so it can be compared with the AUD reference. */
  const aud = (p: number) => toAud(p, cur);

  // Build a price reference per scale from this sweep plus anything supplied.
  const byScale = new Map<string, number[]>();
  for (const { model, variant } of pairs) {
    if (variant.price == null || variant.price <= 0) continue;
    const k = model.scale || '?';
    if (!byScale.has(k)) byScale.set(k, []);
    byScale.get(k)!.push(aud(variant.price));
  }
  for (const [scale, prices] of opts.reference || []) {
    if (!byScale.has(scale)) byScale.set(scale, []);
    byScale.get(scale)!.push(...prices.filter(p => p > 0));
  }

  const medians = new Map<string, number>();
  for (const [scale, prices] of byScale) {
    if (prices.length >= MIN_SAMPLES) medians.set(scale, median(prices));
  }

  const out: SweepMatch[] = [];

  for (const { model, variant } of pairs) {
    const price = variant.price;
    const scale = model.scale || '?';
    const mid = medians.get(scale);

    const preorder = looksLikePreorder(variant.title);
    const mk = (action: SweepAction, reason: string, write: boolean): SweepMatch => ({
      model, variant, action, reason, write, isPreorder: preorder,
    });

    if (price == null || price <= 0) {
      out.push(mk('hold', `No usable price on the listing (${variant.price})`, false));
      continue;
    }

    const priceAud = aud(price);

    if (mid) {
      if (priceAud > mid * HIGH_FACTOR) {
        out.push(mk('review',
          `${cur} ${price.toFixed(2)} (AUD ${priceAud.toFixed(2)}) is ` +
          `${(priceAud / mid).toFixed(1)}x the ${scale} median of AUD ${mid.toFixed(2)}`,
          false));
        continue;
      }
      // A pre-order at a normal price is a real offer; a pre-order at a
      // fraction of the price is a deposit. The title alone cannot tell them
      // apart, and treating it as disqualifying withheld ten good links at
      // Stone Model, where "[Pre-Order]" prefixes ordinary full-price stock.
      // Anthony's AUD 50.00 deposits are still caught, because they are both.
      if (priceAud * LOW_FACTOR < mid) {
        const why = looksLikePreorder(variant.title)
          ? `${cur} ${price.toFixed(2)} against a ${scale} median of AUD ${mid.toFixed(2)}, and the title says pre-order — this is a deposit, not the price`
          : `${cur} ${price.toFixed(2)} (AUD ${priceAud.toFixed(2)}) is ${(mid / priceAud).toFixed(1)}x BELOW the ${scale} median of AUD ${mid.toFixed(2)}`;
        out.push(mk('review', why, false));
        continue;
      }
    }

    if (!model.existing) {
      out.push(mk('new',
        `Not linked to this retailer yet — ${cur} ${price.toFixed(2)}, ${variant.available ? 'in stock' : 'out of stock'}`,
        true));
      continue;
    }

    const was = model.existing.price;

    /**
     * A shop's feed can quote a different currency than the one we stored.
     *
     * Shopify presents prices in the currency it infers from the request, so
     * the same feed read from Australia and from a US server can come back in
     * different money — with nothing in the response saying which. Stone Model
     * advertises USD in meta.json, has CAD in our retailers table, and served
     * AUD to this machine. Three sources, three answers.
     *
     * Rather than trust any of them, anchor to what we already stored: a real
     * price move is a few percent, a currency flip is tens of percent. This is
     * the same units check that catches a cents/dollars mismatch in
     * refresh-prices, and it needs no knowledge of the currency at all.
     */
    if (was != null && was > 0) {
      const ratio = price / was;
      if (ratio > 1 + CURRENCY_SHIFT || ratio < 1 - CURRENCY_SHIFT) {
        out.push(mk('review',
          `${was} → ${price.toFixed(2)} is a ${((ratio - 1) * 100).toFixed(0)}% jump. ` +
          `Too large for a price change — check the shop is quoting the same currency we stored.`,
          false));
        continue;
      }
    }

    const priceSame = was != null && Math.abs(was - price) < 0.005;
    const stockSame = model.existing.inStock === variant.available;

    if (priceSame && stockSame) {
      out.push(mk('unchanged', `${cur} ${price.toFixed(2)}, unchanged`, false));
      continue;
    }

    const bits: string[] = [];
    if (!priceSame) bits.push(`${cur} ${was ?? '?'} → ${price.toFixed(2)}`);
    if (!stockSame) bits.push(variant.available ? 'back in stock' : 'now out of stock');
    out.push(mk('refresh', bits.join(', '), true));
  }

  return out;
}
