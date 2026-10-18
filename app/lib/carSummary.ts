import type { CarPageData, CarVariant } from './carPageData';
import { shortTeamName } from './carTitle';

/**
 * A sentence or two about THIS car, built from what the site already knows.
 *
 * WHY IT EXISTS
 *
 * Measured 2026-10-18 on four live car pages: a 1967 Lotus page carried 346
 * words, 183 of them distinct, and 134 of those appeared on every other car
 * page too. Forty-nine words on the whole page were actually about that car.
 *
 *     1967 Lotus 25       346 words   73% boilerplate
 *     1970 Ferrari 312B   420
 *     2024 Sauber C44     605
 *     2026 Ferrari SF-26  848
 *
 * That is the shape Google leaves in "Discovered, currently not indexed":
 * 2,241 pages from one template, differing by a title and a few numbers. It
 * crawls a few hundred, concludes the rest say the same thing, and stops. The
 * gradient matters too -- the thinnest pages are the OLDEST cars, which is
 * most of the catalogue.
 *
 * WHAT MAKES THIS NOT FILLER
 *
 * Every clause is a fact the site holds and no other page states: how many
 * models exist, who made them, at what scales, how many shops sell them, and
 * for how much. It is the site's actual value written in prose rather than
 * spread across a table, so it is useful to a reader who just landed as well
 * as to a crawler.
 *
 * It is NOT spun text and it must never become spun text. If a car has no
 * models and no prices there is nothing true to say, so this returns null and
 * the page renders without it. A page that says nothing is better than a page
 * that pads.
 *
 * ONLY QUOTABLE PRICES. `lowestPrice` and `shopRange` are already gated on
 * isQuotable -- in stock, checked recently, a shop rather than eBay, not a
 * pre-order -- so prose built on them can never claim a figure the page
 * itself declines to show. That mismatch is the thing structured data gets
 * ignored for.
 */

/** "1:18 and 1:43", "1:12, 1:18 and 1:43". */
function list(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const money = (n: number) => `AUD ${Math.round(n)}`;

/**
 * Words for small numbers, digits above nine.
 *
 * Ordinary prose style, and without it the output mixed the two in one
 * paragraph: "One model ... 3 shops". Prices stay as digits throughout,
 * because a figure someone might compare should look like a figure.
 */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const count = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));
const Count = (n: number) => {
  const w = count(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};

/** Scales newest-collector-first: 1:12, 1:18, 1:43 reads better than sorted text. */
const SCALE_ORDER = ['1:12', '1:18', '1:43', '1:64'];
const byScale = (a: string, b: string) => {
  const ia = SCALE_ORDER.indexOf(a);
  const ib = SCALE_ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
};

export function carSummary(data: CarPageData): string | null {
  const { car, variants } = data;
  if (!variants?.length) return null;

  const makers = [...new Set(
    variants.map((v: CarVariant) => v.manufacturers?.name).filter(Boolean)
  )] as string[];
  const scales = ([...new Set(
    variants.map((v: CarVariant) => v.scale).filter(Boolean)
  )] as string[]).sort(byScale);

  /**
   * Shops counted across every variant, deduplicated by name.
   *
   * A car offered in two scales by the same shop is one shop, not two. Only
   * real retailers: an eBay seller is one person's listing, not stock, and
   * the page keeps those separate everywhere else too.
   */
  const shops = new Set<string>();
  for (const v of variants) {
    for (const r of v.retailers || []) {
      if (!r.isSecondary && !r.priceHidden && r.name) shops.add(r.name);
    }
  }

  const quotable = variants
    .map((v: CarVariant) => v.lowestPrice)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const low = quotable.length ? Math.min(...quotable) : null;
  const high = quotable.length ? Math.max(...quotable) : null;

  const sentences: string[] = [];

  /**
   * What exists. The subject is the MODELS, not the car, because that is the
   * question someone searching a 1967 Lotus 25 in miniature is asking.
   */
  const n = variants.length;
  const made = `${Count(n)} model${n === 1 ? '' : 's'}`;
  const scalePart = scales.length ? ` in ${list(scales)}` : '';
  const makerPart = makers.length
    ? `, ${makers.length === 1 ? 'by' : 'from'} ${list(makers)}`
    : '';
  sentences.push(`${made} of this car ${n === 1 ? 'is' : 'are'} catalogued here${scalePart}${makerPart}.`);

  /**
   * Where to buy it, and the spread. The spread IS the product: a reader who
   * sees 128 to 210 immediately understands why a comparison page exists.
   */
  if (shops.size && low !== null && high !== null) {
    const where = shops.size === 1
      ? `${[...shops][0]} currently lists it`
      : `${Count(shops.size)} shops currently list it`;
    const price = high > low
      ? ` at prices from ${money(low)} to ${money(high)}`
      : ` at ${money(low)}`;
    sentences.push(`${where}${price}.`);
  } else if (shops.size) {
    // Stock exists but nothing is quotable: say so rather than implying a price.
    sentences.push(
      `${shops.size === 1 ? 'One shop stocks' : `${Count(shops.size)} shops stock`} it, ` +
      `though no current price is confirmed.`
    );
  } else {
    sentences.push('No shop is currently listing it.');
  }

  /**
   * Context only where it is REAL. "Driven by X at the Y" restates the title,
   * so it is only worth a clause when the event is a named race rather than
   * the catch-all "Season".
   */
  const driver = car?.driver?.name;
  const team = shortTeamName(car?.team?.name);
  const event = car?.event_name;
  const year = car?.season?.year;
  if (driver && event && event !== 'Season' && year) {
    sentences.push(`The full-size car was driven by ${driver} for ${team} at the ${year} ${event}.`);
  }

  return sentences.join(' ');
}
