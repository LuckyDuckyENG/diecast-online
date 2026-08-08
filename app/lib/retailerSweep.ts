import type { FeedVariant } from './shopifyFeed';

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

/** Titles that describe a payment rather than a product. */
const DEPOSIT_MARKERS = /\b(pre[\s-]?order|deposit|pre[\s-]?sale|coming soon|back[\s-]?order)\b/i;

export interface ClassifyOptions {
  /** Known good AUD prices per scale, for the outlier check. */
  reference?: Map<string, number[]>;
}

export function classifyMatches(
  pairs: { model: SweepModel; variant: FeedVariant }[],
  opts: ClassifyOptions = {}
): SweepMatch[] {
  // Build a price reference per scale from this sweep plus anything supplied.
  const byScale = new Map<string, number[]>();
  for (const { model, variant } of pairs) {
    if (variant.price == null || variant.price <= 0) continue;
    const k = model.scale || '?';
    if (!byScale.has(k)) byScale.set(k, []);
    byScale.get(k)!.push(variant.price);
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

    const mk = (action: SweepAction, reason: string, write: boolean): SweepMatch => ({
      model, variant, action, reason, write,
    });

    if (price == null || price <= 0) {
      out.push(mk('hold', `No usable price on the listing (${variant.price})`, false));
      continue;
    }

    if (DEPOSIT_MARKERS.test(variant.title)) {
      out.push(mk('hold', `Title reads as a pre-order or deposit, not a full price`, false));
      continue;
    }

    if (mid) {
      if (price > mid * HIGH_FACTOR) {
        out.push(mk('review',
          `AUD ${price.toFixed(2)} is ${(price / mid).toFixed(1)}x the ${scale} median of AUD ${mid.toFixed(2)}`,
          false));
        continue;
      }
      if (price * LOW_FACTOR < mid) {
        out.push(mk('review',
          `AUD ${price.toFixed(2)} is ${(mid / price).toFixed(1)}x BELOW the ${scale} median of AUD ${mid.toFixed(2)} — often a deposit`,
          false));
        continue;
      }
    }

    if (!model.existing) {
      out.push(mk('new',
        `Not linked to this retailer yet — AUD ${price.toFixed(2)}, ${variant.available ? 'in stock' : 'out of stock'}`,
        true));
      continue;
    }

    const was = model.existing.price;
    const priceSame = was != null && Math.abs(was - price) < 0.005;
    const stockSame = model.existing.inStock === variant.available;

    if (priceSame && stockSame) {
      out.push(mk('unchanged', `AUD ${price.toFixed(2)}, unchanged`, false));
      continue;
    }

    const bits: string[] = [];
    if (!priceSame) bits.push(`AUD ${was ?? '?'} → ${price.toFixed(2)}`);
    if (!stockSame) bits.push(variant.available ? 'back in stock' : 'now out of stock');
    out.push(mk('refresh', bits.join(', '), true));
  }

  return out;
}
