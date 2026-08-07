import { toAud } from './currency';

/**
 * Deciding whether an eBay listing is the model we're looking for.
 *
 * eBay search is noisy — a query for an RB19 returns RB21s, wrong scales and
 * wrong years. Sellers mislabel things, reuse stock photos and get years wrong,
 * so perfect matching isn't available. The aim is to be right often enough to
 * be useful, and wrong in ways that are cheap to find and fix.
 *
 * Three layers, cheapest and most certain first:
 *
 *   1. The seller printed the SKU in the title -> certain match, no AI needed.
 *      Sellers do this often enough to carry a good share of the work.
 *   2. Scale or year contradicts the target -> reject, whatever anything else
 *      says. This is the language model's known failure: "RB21 2025 Japanese GP
 *      Winner Verstappen" matches an RB19 2023 target on manufacturer, driver,
 *      race and scale, and reads as a confident match.
 *   3. Everything else -> genuine judgement, hand it to the model.
 */

export interface TargetModel {
  sku: string | null;
  scale: string | null;        // "1:18" | "1:43"
  manufacturer: string | null;
  driver: string | null;
  event: string | null;
  chassis: string | null;
  year: number | null;
}

export type Tier = 'sku-match' | 'rejected' | 'needs-judgement';

export interface PreVerdict {
  tier: Tier;
  reason: string;
}

/** Strip everything but alphanumerics, for comparing SKUs against free text. */
const squash = (s: string) => s.replace(/[^a-z0-9]/gi, '').toUpperCase();

/**
 * "1:43", "1/43", "1-43" and "1.43" all mean the same thing in a title.
 *
 * The dot form is not hypothetical — "Spark 1.18 Red Bull Racing RB19 Max
 * Verstappen 1st Miami" was matched against a 1:43 model because this missed
 * it, and a scale that goes undetected cannot be rejected.
 *
 * A leading \b keeps prices out: in "41.43" there is no boundary before the 1,
 * so it does not read as a 1:43.
 */
function scalesIn(title: string): Set<string> {
  const found = new Set<string>();
  for (const m of title.matchAll(/\b1\s*[:\/\-.]\s*(12|18|24|43|64)\b/g)) {
    found.add(`1:${m[1]}`);
  }
  return found;
}

/** Four-digit years that could plausibly be an F1 season. */
function yearsIn(title: string): number[] {
  return [...title.matchAll(/\b(19[5-9]\d|20[0-4]\d)\b/g)].map(m => parseInt(m[1], 10));
}

/**
 * Chassis codes mentioned in a title: RB19, RB20, SF-24, W14, MCL38, AT04,
 * C43, VF-24, AMR24, A523.
 *
 * The most reliable discriminator available. A year check can't separate an
 * RB19 from an RB21 when they're listed a year apart, but the chassis code
 * always can — and it's the exact case that reads as a confident match to a
 * language model, since manufacturer, driver, race and scale all agree.
 */
function chassisIn(title: string): Set<string> {
  const found = new Set<string>();
  const patterns = [
    /\bRB\s?-?\s?(\d{2})\b/gi,        // RB19, RB 20, RB-21
    /\bSF\s?-?\s?(\d{2})\b/gi,        // SF-23, SF24
    /\bW\s?-?\s?(\d{2})\b/gi,         // W14, W-15
    /\bMCL\s?-?\s?(\d{2})\b/gi,       // MCL38
    /\bAT\s?-?\s?(\d{2})\b/gi,        // AT04
    /\bVF\s?-?\s?(\d{2})\b/gi,        // VF-24
    /\bAMR\s?-?\s?(\d{2})\b/gi,       // AMR24
    /\bA\s?-?\s?(5\d{2})\b/gi,        // A523, A524
    /\bC\s?-?\s?(4\d)\b/gi,           // C43, C44
  ];
  for (const p of patterns) {
    for (const m of title.matchAll(p)) {
      found.add(squash(m[0]));
    }
  }
  return found;
}

/**
 * Decide what can be settled without asking a model.
 * Returns 'needs-judgement' when it genuinely needs one.
 */
export function preJudge(title: string, target: TargetModel): PreVerdict {
  const squashedTitle = squash(title);

  // --- Layer 2 first: a disqualifier beats a SKU that might be a typo ---

  const titleScales = scalesIn(title);
  if (target.scale && titleScales.size > 0 && !titleScales.has(target.scale)) {
    return {
      tier: 'rejected',
      reason: `Listing is ${[...titleScales].join('/')}, target is ${target.scale}`,
    };
  }

  // Chassis is the sharpest discriminator: an RB21 listing against an RB19
  // target agrees on manufacturer, driver, race and scale, so only this
  // catches it. Only reject when the title names a chassis and it isn't ours —
  // a title with no chassis code stays in play.
  const targetChassis = target.chassis ? squash(target.chassis) : null;
  if (targetChassis) {
    const titleChassis = chassisIn(title);
    if (titleChassis.size > 0 && !titleChassis.has(targetChassis)) {
      return {
        tier: 'rejected',
        reason: `Listing is ${[...titleChassis].join('/')}, target is ${target.chassis}`,
      };
    }
  }

  const titleYears = yearsIn(title);
  if (target.year && titleYears.length > 0) {
    // Allow one year either side: a 2023-season car can be listed as 2024 by a
    // seller describing when it was released.
    const near = titleYears.some(y => Math.abs(y - target.year!) <= 1);
    if (!near) {
      return {
        tier: 'rejected',
        reason: `Listing says ${titleYears.join('/')}, target season is ${target.year}`,
      };
    }
  }

  // --- Layer 1: the seller told us exactly what it is ---

  if (target.sku && target.sku.length >= 5 && squashedTitle.includes(squash(target.sku))) {
    return { tier: 'sku-match', reason: `Listing title contains SKU ${target.sku}` };
  }

  return { tier: 'needs-judgement', reason: 'No SKU in title and nothing disqualifying' };
}

export interface EbayCandidate {
  itemId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  priceAud: number | null;
  marketplace: string;
  condition: string | null;
  seller: string | null;
}

/**
 * eBay's itemWebUrl carries the search that found it, so a link stored from a
 * batch run reads "?_skw=Minichamps+RB19&hash=..." — our internal query, on a
 * URL shown to visitors. The bare /itm/<id> form is stable and is what a person
 * would share.
 */
function cleanItemUrl(raw?: string | null): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const m = u.pathname.match(/\/itm\/(\d+)/);
    return m ? `${u.origin}/itm/${m[1]}` : raw;
  } catch {
    return raw;
  }
}

/** Normalise one eBay Browse API item_summary into what we store. */
export function toCandidate(item: any, marketplace: string): EbayCandidate {
  const value = item?.price?.value ? parseFloat(item.price.value) : null;
  const currency = item?.price?.currency || null;

  return {
    itemId: item?.itemId || '',
    title: item?.title || '',
    url: cleanItemUrl(item?.itemWebUrl),
    imageUrl: item?.image?.imageUrl || item?.thumbnailImages?.[0]?.imageUrl || null,
    price: value,
    currency,
    priceAud: value !== null ? toAud(value, currency || 'AUD') : null,
    marketplace,
    condition: item?.condition || null,
    seller: item?.seller?.username || null,
  };
}
