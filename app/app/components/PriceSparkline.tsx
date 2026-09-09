import type { PriceSeries } from '@/lib/priceHistory';

/**
 * One seller's price over time, small enough to sit under the price.
 *
 * ONE line, deliberately. A "cheapest anywhere" sparkline would be the obvious
 * choice and it lies: when the number of shops observed changes between two
 * readings, the line moves although no price did — 45% of the models with two
 * readings would draw a fake move over 10%. A sparkline is the worst place for
 * that, because it has no axis, no dates and no numbers, so a reader has
 * nothing to check it against. It draws a confident line and offers no evidence.
 *
 * So it shows the series belonging to ONE seller, named underneath. That is a
 * claim a reader can verify by looking at the list of shops above it.
 *
 * Points are evenly spaced rather than placed by date. At two to four readings
 * a true time axis would put two points hard against each other and leave a
 * fortnight of white space, which reads as a data problem rather than as
 * infrequent sampling. The dates are stated in the label instead, and the full
 * chart — where there is room for an axis — is one click away.
 */

const W = 64;
const H = 20;
const PAD = 2;

/**
 * The height of the box is 10% of the price — NOT the range of the series.
 *
 * Auto-scaling each line to its own min and max is what a sparkline normally
 * does, and on this data it lies. Real moves here are small: the median mover
 * is under 2%, and shops sit at 1-2%. Auto-scaled, a shop going 326 -> 323
 * draws a line from the top of the box to the floor, identical in shape to a
 * crash. The shape would carry no information at all — every non-flat line
 * would look like a collapse.
 *
 * Fixing the scale to a tenth of the price makes slope mean something: a 1%
 * move is a tenth of the box, a 10% move fills it. A series that moved MORE
 * than 10% keeps its own span, so nothing ever clips — it just fills the box
 * and the percentage beside it carries the exact figure.
 */
const FULL_SCALE = 0.1;

export default function PriceSparkline({
  series,
  className = '',
}: {
  series: PriceSeries;
  className?: string;
}) {
  const prices = series.points.map(p => p.priceAud);
  if (prices.length < 2) return null;

  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const mid = (lo + hi) / 2;
  const span = Math.max(hi - lo, lo * FULL_SCALE);

  const x = (i: number) => PAD + (i / (prices.length - 1)) * (W - PAD * 2);
  /**
   * Centred on the series, so a line that did not move sits in the MIDDLE.
   *
   * Most series are flat — a shop that has not moved its price is the common
   * case, not an edge case — and anchoring the low point to the floor would
   * read as "fell to nothing" rather than "held". `lo` is always above zero
   * (getPriceHistory drops non-positive prices), so span is never zero and
   * there is no degenerate case to special-case.
   */
  const y = (p: number) => H / 2 - ((p - mid) / span) * (H - PAD * 2);

  const d = prices.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');

  // Down is good here: this is a price a reader might pay, so a fall is the
  // welcome direction. Flat gets the muted colour rather than either.
  const dir = series.change < -0.005 ? 'down' : series.change > 0.005 ? 'up' : 'flat';
  const stroke =
    dir === 'down' ? 'var(--accent)' : dir === 'up' ? '#b45309' : 'var(--text-tertiary)';

  const first = series.points[0];
  const last = series.points[series.points.length - 1];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="overflow-visible shrink-0"
        role="img"
        aria-label={
          `${series.label}: AUD ${first.priceAud.toFixed(2)} on ${first.day}, ` +
          `AUD ${last.priceAud.toFixed(2)} on ${last.day}`
        }
      >
        <path d={d} fill="none" stroke={stroke} strokeWidth="1.5"
              strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(prices.length - 1)} cy={y(prices[prices.length - 1])} r="1.8" fill={stroke} />
      </svg>
      <span className="text-[10px] text-[var(--text-tertiary)] whitespace-nowrap">
        {dir === 'flat'
          ? 'held'
          : `${series.change > 0 ? '+' : ''}${(series.change * 100).toFixed(0)}%`}
      </span>
    </span>
  );
}
