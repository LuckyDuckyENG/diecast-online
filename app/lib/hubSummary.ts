/**
 * The meta description for a driver, team or season hub.
 *
 * WHAT WAS WRONG
 *
 * Every hub joined its years with " and ", so Sergio Perez's description
 * opened:
 *
 *   "Every Sergio Perez scale model we track — 51 cars from 2015 and 2016 and
 *    2017 and 2018 and 2019 and 2020 and 2021 and 2022 and 2023 and 2024 and
 *    2026, made by ..."
 *
 * Google truncates a description at roughly 155 characters. That chain
 * consumed all of it, so the snippet shown in search results was a list of
 * years and nothing else -- the reason to click ("compare what every retailer
 * charges", "prices start at AUD 22.99") was cut off before it appeared.
 *
 * Search Console showed the cost: driver hubs drew about 160 impressions at
 * mostly page-one positions and produced TWO clicks. Roughly 1% where position
 * 7-8 should give 3-5%. The pages were ranking; the snippet was wasting the
 * ranking.
 *
 * So: years as a range, makers capped, and the price moved early because it is
 * the single most clickable fact a price-comparison result can show.
 */

/** "2015 to 2026" for a run, "1988" for one, "1988, 1991 and 1993" for a few. */
export function yearRange(years: number[]): string {
  const ys = [...new Set(years)].filter(Boolean).sort((a, b) => a - b);
  if (!ys.length) return '';
  if (ys.length === 1) return String(ys[0]);
  if (ys.length === 2) return `${ys[0]} and ${ys[1]}`;
  /**
   * Only a true range says "to". A driver with 1988, 1991 and 1993 did not
   * race from 1988 to 1993, and claiming so in a snippet is a small lie that
   * the page itself contradicts.
   */
  const contiguous = ys[ys.length - 1] - ys[0] === ys.length - 1;
  if (contiguous) return `${ys[0]} to ${ys[ys.length - 1]}`;
  if (ys.length <= 4) return `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`;
  // Long and gappy: the span plus a count is honest and short.
  return `${ys[0]} to ${ys[ys.length - 1]} (${ys.length} seasons)`;
}

/** At most three makers, then "and N more". A full list eats the snippet. */
function makerList(makers: string[]): string {
  const m = makers.filter(Boolean);
  if (!m.length) return '';
  if (m.length <= 3) return m.join(', ');
  return `${m.slice(0, 3).join(', ')} and ${m.length - 3} more`;
}

export function hubSummary(hub: {
  subject: string;
  cars: unknown[];
  years: number[];
  manufacturers: string[];
  scales: string[];
  lowestPrice: number | null;
}): string {
  const bits: string[] = [
    `${hub.cars.length} ${hub.subject} scale models, ${yearRange(hub.years)}.`,
  ];
  /**
   * The price leads the rest of the sentence. On a price-comparison result it
   * is the one fact that distinguishes this page from a shop's listing, and
   * putting it after the maker list is what buried it before.
   */
  if (hub.lowestPrice !== null) bits.push(`From AUD $${hub.lowestPrice.toFixed(2)}.`);
  const makers = makerList(hub.manufacturers);
  if (makers) bits.push(`${makers} in ${hub.scales.join(' and ')}.`);
  bits.push('Compare every retailer in one place.');

  /**
   * Trimmed to fit. Google cuts at about 155-160 characters and a sentence
   * sliced mid-word reads as broken, so whole sentences are dropped from the
   * end until it fits.
   */
  const LIMIT = 155;
  let out = bits.join(' ');
  while (out.length > LIMIT && bits.length > 1) {
    bits.splice(bits.length - 2, 1);
    out = bits.join(' ');
  }
  return out;
}
