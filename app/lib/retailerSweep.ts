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
  /**
   * Who made it. Carried purely for the price guard: what a model should cost
   * depends far more on its maker than on its scale. See BRAND_MIN_SAMPLES.
   */
  manufacturer: string | null;
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
 * The same test, but against what THIS MAKER charges rather than what the scale
 * costs on average.
 *
 * A scale-wide median is set by whoever has the most models. For 1:18 that is
 * 288 Minichamps, 90 Spark and 54 Looksmart, which puts it at AUD 389.92 — and
 * then every budget brand reads as an error:
 *
 *   Minichamps 1:18   AUD 379.96   0.97x the scale median   fine
 *   Solido     1:18   AUD 129.99   0.33x                    exactly on the line
 *   Bburago    1:43   no prices at all, 13 SKUs in feeds we already download
 *
 * Solido's own median is one third of the scale median, so it sits precisely at
 * the 3x threshold: its stored links squeaked past by five cents, and two new
 * ones at AUD 97.43 were held as "4.0x BELOW the median". That price is simply
 * what Solido costs.
 *
 * The trap is that it is self-sealing. A held price is never written, so the
 * brand never accumulates the prices it would need to prove it is cheap, so it
 * is held forever. Bburago has 17 models and has never been priced once.
 *
 * Three is enough to establish a band and low enough to reach: Solido has
 * exactly three stored prices, and a brand with none at all — Bburago — can
 * still qualify on the strength of the sweep's own listings, because a shop
 * that lists eight Bburago cars at similar money is evidence of a price band,
 * not of eight identical mistakes.
 */
const BRAND_MIN_SAMPLES = 3;

/**
 * How far a refreshed price may move before it stops looking like a price
 * change and starts looking like a change of currency. Real diecast prices
 * drift a few percent; USD/AUD is about 50%.
 */
const CURRENCY_SHIFT = 0.25;

/**
 * How much of a shop has to jump before it reads as a currency change rather
 * than a sale. Half is deliberately blunt: a currency change moves everything,
 * a sale moves a few, and there is no middle case worth tuning for.
 */
const SHIFT_MAJORITY = 0.5;

/**
 * Fewer comparable products than this and the share means nothing, so the
 * sweep keeps the old conservative behaviour and holds every large move.
 */
const MIN_SHIFT_SAMPLES = 10;

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
  /**
   * Known good AUD prices for the outlier check, keyed `manufacturer|scale`.
   *
   * Keyed by both because the check needs both levels: the maker's own band
   * where it is known, and the scale as the fallback. Passing one map and
   * deriving the scale buckets from it keeps the two from disagreeing about
   * which prices they were built from.
   */
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

  const brandKey = (m: SweepModel) => `${(m.manufacturer || '?').toLowerCase()}|${m.scale || '?'}`;

  // Build the reference from this sweep plus anything supplied, keyed by
  // maker AND scale. Including the sweep's own prices is what lets a brand we
  // have never priced establish a band at all — Bburago has 17 models and not
  // one stored price, so the database alone can never speak for it.
  const byBrand = new Map<string, number[]>();
  for (const { model, variant } of pairs) {
    if (variant.price == null || variant.price <= 0) continue;
    const k = brandKey(model);
    if (!byBrand.has(k)) byBrand.set(k, []);
    byBrand.get(k)!.push(aud(variant.price));
  }
  for (const [key, prices] of opts.reference || []) {
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key)!.push(...prices.filter(p => p > 0));
  }

  // Scale buckets are the same prices merged across makers, so the fallback
  // can never be built from a different set than the brand-level check.
  const byScale = new Map<string, number[]>();
  for (const [key, prices] of byBrand) {
    const scale = key.split('|')[1] || '?';
    if (!byScale.has(scale)) byScale.set(scale, []);
    byScale.get(scale)!.push(...prices);
  }

  const medians = new Map<string, number>();
  for (const [scale, prices] of byScale) {
    if (prices.length >= MIN_SAMPLES) medians.set(scale, median(prices));
  }
  const brandMedians = new Map<string, number>();
  for (const [key, prices] of byBrand) {
    if (prices.length >= BRAND_MIN_SAMPLES) brandMedians.set(key, median(prices));
  }

  /**
   * Did this shop's prices move TOGETHER, or did a few products move?
   *
   * CURRENCY_SHIFT blocks any move over 25% because a jump that big usually
   * means the feed changed currency. That is right, and on its own it is also
   * a trap: when the STORED price is the wrong one, the correction is exactly
   * the move it refuses, so the bad price is protected and every later sweep
   * re-flags the same rows forever.
   *
   * Car Model Store sat that way for weeks. 17 of its prices were stale-high
   * because the shop cut them ~30%, and each sweep dutifully reported
   * "177 -> 124.00 is a -30% jump" and wrote nothing.
   *
   * The two cases look different in aggregate. A currency change moves the
   * WHOLE feed at once and by roughly one factor. A sale moves a handful of
   * products while everything else holds. So measure the share that moved: at
   * Car Model Store 10 of 77 did, which is a sale. If half the shop jumps, it
   * is the currency and everything still goes to review.
   *
   * Below MIN_SHIFT_SAMPLES comparable products there is not enough to tell
   * the cases apart, so it stays conservative and holds — the old behaviour.
   */
  const shiftRatios: number[] = [];
  for (const { model, variant } of pairs) {
    const was = model.existing?.price;
    const now = variant.price;
    if (was != null && was > 0 && now != null && now > 0) shiftRatios.push(now / was);
  }
  const shiftedShare = shiftRatios.length
    ? shiftRatios.filter(r => r > 1 + CURRENCY_SHIFT || r < 1 - CURRENCY_SHIFT).length / shiftRatios.length
    : 0;
  const wholeShopMoved =
    shiftRatios.length < MIN_SHIFT_SAMPLES ? true : shiftedShare >= SHIFT_MAJORITY;

  const out: SweepMatch[] = [];

  for (const { model, variant } of pairs) {
    const price = variant.price;
    const scale = model.scale || '?';
    const scaleMid = medians.get(scale);
    const brandMid = brandMedians.get(brandKey(model));
    /** What this maker charges if we know, what the scale costs if we do not. */
    const mid = brandMid ?? scaleMid;
    const basis = brandMid != null
      ? `${model.manufacturer} ${scale} median`
      : `${scale} median`;

    const preorder = looksLikePreorder(variant.title);
    const mk = (action: SweepAction, reason: string, write: boolean): SweepMatch => ({
      model, variant, action, reason, write, isPreorder: preorder,
    });

    if (price == null || price <= 0) {
      out.push(mk('hold', `No usable price on the listing (${variant.price})`, false));
      continue;
    }

    const priceAud = aud(price);

    /**
     * A pre-order at a normal price is a real offer; a pre-order at a fraction
     * of the price is a deposit. The title alone cannot tell them apart, and
     * treating it as disqualifying withheld ten good links at Stone Model,
     * where "[Pre-Order]" prefixes ordinary full-price stock.
     *
     * Measured against the SCALE median deliberately, not the maker's. A
     * deposit is defined by being tiny next to what a car of that size costs,
     * and anchoring it to the brand would defeat it exactly where a brand is
     * cheap: Anthony's AUD 50.00 deposits have to stay caught.
     */
    if (scaleMid && preorder && priceAud * LOW_FACTOR < scaleMid) {
      out.push(mk('review',
        `${cur} ${price.toFixed(2)} against a ${scale} median of AUD ${scaleMid.toFixed(2)}, ` +
        `and the title says pre-order — this is a deposit, not the price`,
        false));
      continue;
    }

    if (mid) {
      if (priceAud > mid * HIGH_FACTOR) {
        out.push(mk('review',
          `${cur} ${price.toFixed(2)} (AUD ${priceAud.toFixed(2)}) is ` +
          `${(priceAud / mid).toFixed(1)}x the ${basis} of AUD ${mid.toFixed(2)}`,
          false));
        continue;
      }
      if (priceAud * LOW_FACTOR < mid) {
        // Say when there is no brand baseline yet. "4.0x below the 1:18 median"
        // reads as a broken price; "we have never priced a Solido" reads as
        // what it is, which is the difference between fixing the data and
        // distrusting the shop.
        const noBrandYet = brandMid == null && model.manufacturer
          ? ` — no ${model.manufacturer} ${scale} prices to compare against yet, so this is the all-makers median`
          : '';
        out.push(mk('review',
          `${cur} ${price.toFixed(2)} (AUD ${priceAud.toFixed(2)}) is ` +
          `${(mid / priceAud).toFixed(1)}x BELOW the ${basis} of AUD ${mid.toFixed(2)}${noBrandYet}`,
          false));
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
      const bigMove = ratio > 1 + CURRENCY_SHIFT || ratio < 1 - CURRENCY_SHIFT;
      // Only a hold when the rest of the shop moved too — see wholeShopMoved.
      if (bigMove && wholeShopMoved) {
        out.push(mk('review',
          `${was} → ${price.toFixed(2)} is a ${((ratio - 1) * 100).toFixed(0)}% jump, and ` +
          `${(shiftedShare * 100).toFixed(0)}% of this shop's prices moved with it. ` +
          `That is a change of currency, not of price — check what the feed is quoting.`,
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
