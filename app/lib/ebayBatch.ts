import { preJudge, type EbayCandidate, type TargetModel } from './ebayMatch';
import { eventMatches } from './eventName';
import { driverSurnames } from './driverName';

/**
 * Searching eBay for many models at once.
 *
 * Searching per model is what the single-model button does, and it has two
 * problems at scale. It is one API call per model, and the query it builds is
 * seven terms plus a SKU — so over-constrained that an empty result tells you
 * nothing about whether eBay actually has the item.
 *
 * Models sharing a chassis and a manufacturer are all served by ONE broad
 * search: "Minichamps RB19" returns the pool for that car, and matching
 * assigns listings to models locally. On the current catalogue that is 245
 * per-model searches collapsed to roughly 28 broad ones, and it finds more,
 * because the pool is not filtered by an over-specific query first.
 *
 * Scale is deliberately NOT in the query. eBay titles write it as "1:43",
 * "1/43" or "1-43" and a query term risks excluding the very listings we want;
 * preJudge already rejects on scale per model, which is both safer and lets
 * both scales share a single search.
 *
 *
 * THE THING TO BE CAREFUL ABOUT
 *
 * Within one group every model has the same chassis, scale, year and
 * manufacturer. They differ ONLY by race. So preJudge's scale/chassis/year
 * checks — everything that makes it safe — discriminate nothing here: they
 * filter the pool, and then thirteen near-identical siblings remain.
 *
 * That is why only a SKU printed in the title is allowed to auto-link. Anything
 * decided on race name alone is a review candidate and never writes itself. A
 * wrong link made that way is indistinguishable from a right one at a glance,
 * which makes it exactly the kind of error that survives.
 */

export interface BatchModel {
  id: string;
  sku: string | null;
  scale: string | null;
  manufacturer: string | null;
  chassis: string | null;
  event: string | null;
  driver: string | null;
  team: string | null;
  year: number | null;
}

export interface SearchGroup {
  key: string;
  label: string;
  query: string;
  models: BatchModel[];
}

/** The eBay query for a group. Broad on purpose — see the note above. */
export function buildQuery(m: BatchModel): string {
  return [m.manufacturer, m.chassis || m.team, m.chassis ? null : m.year]
    .filter(Boolean)
    .join(' ');
}

/**
 * Collapse models into the smallest set of searches that covers them.
 * Keyed by what the query actually depends on: season, team, chassis,
 * manufacturer. Scale is excluded — both scales share one search.
 */
export function groupForSearch(models: BatchModel[]): SearchGroup[] {
  const groups = new Map<string, SearchGroup>();

  for (const m of models) {
    const key = [m.year, m.team, m.chassis, m.manufacturer].join('|');
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: `${m.year} ${m.team} ${m.chassis || ''} ${m.manufacturer}`.replace(/\s+/g, ' ').trim(),
        query: buildQuery(m),
        models: [],
      });
    }
    groups.get(key)!.models.push(m);
  }

  return [...groups.values()];
}

const foldAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Does this listing title name the model's driver?
 *
 * driverMatches() can't be used here: it takes the last token of each side, so
 * against a free-text title it would compare the driver to the title's final
 * word. Take the surnames from the driver side only, and look for each as a
 * whole word in the title.
 */
export function titleNamesDriver(title: string, driver?: string | null): boolean {
  const surnames = driverSurnames(driver);
  if (!surnames.size) return false;

  const words = new Set(
    foldAccents(title.toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
  );

  for (const s of surnames) if (!words.has(s)) return false;
  return true;
}

export type MatchTier = 'sku-match' | 'event-driver';

export interface Assignment {
  model: BatchModel;
  candidate: EbayCandidate;
  tier: MatchTier;
  reason: string;
  /** Only a SKU in the title earns this. */
  autoLink: boolean;
}

export interface GroupResult {
  group: SearchGroup;
  poolSize: number;
  assignments: Assignment[];
  unmatched: BatchModel[];
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * How far above its siblings a price may sit and still link itself.
 *
 * A group is the same car by the same maker at the same scale, so its prices
 * cluster tightly and an outlier is nearly always a lot, a signed edition, or a
 * mistake. Refreshes are protected by comparing against the stored price, but a
 * first write has nothing to compare against — which is how AUD 1293.40 came to
 * be proposed for a 1:43 Spark whose siblings were AUD 149 to 266.
 *
 * Three times the median is deliberately loose: eBay is a secondary market and
 * a genuine premium over retail is the norm. This is only meant to catch the
 * absurd, and it demotes to review rather than discarding, so nothing is lost.
 */
const PRICE_OUTLIER_FACTOR = 3;
const MIN_SAMPLES_FOR_MEDIAN = 3;

/** Known AUD prices for a group's models, keyed by scale. */
export type PriceReference = Map<string, number[]>;

function demotePriceOutliers(assignments: Assignment[], prior?: PriceReference): void {
  const byScale = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!a.autoLink || a.candidate.priceAud == null) continue;
    const k = a.model.scale || '?';
    if (!byScale.has(k)) byScale.set(k, []);
    byScale.get(k)!.push(a);
  }

  for (const [scale, group] of byScale) {
    // Prices already known for this chassis at this scale — retailer prices and
    // eBay links from earlier runs. Without them the sample is only what this
    // run happened to match, so a re-run covering three leftover models had one
    // sample where the first run had four, and the guard silently stopped
    // applying. AUD 1293.40 passed as AUTO on exactly that re-run.
    const samples = [
      ...(prior?.get(scale) || []),
      ...group.map(a => a.candidate.priceAud!),
    ].filter(p => p > 0);

    if (samples.length < MIN_SAMPLES_FOR_MEDIAN) continue;
    const mid = median(samples);
    if (!(mid > 0)) continue;

    for (const a of group) {
      const price = a.candidate.priceAud!;
      if (price > mid * PRICE_OUTLIER_FACTOR) {
        a.autoLink = false;
        a.reason =
          `AUD ${price.toFixed(2)} is ${(price / mid).toFixed(1)}x the ${scale} median ` +
          `of AUD ${mid.toFixed(2)} for this car — SKU matches, price needs a look`;
      }
    }
  }
}

const targetFor = (m: BatchModel): TargetModel => ({
  sku: m.sku,
  scale: m.scale,
  manufacturer: m.manufacturer,
  driver: m.driver,
  event: m.event,
  chassis: m.chassis,
  year: m.year,
});

/**
 * Assign listings in a group's pool to the models in that group.
 *
 * A listing is claimed by at most one model. Two models matching the same
 * listing means at least one of them is wrong, and eBay item ids are the only
 * thing telling us these are the same physical offer — so first claim wins,
 * and SKU matches get to claim before anything decided on race name.
 */
/**
 * Does the listing assert a race that isn't ours?
 *
 * This is the one failure the SKU tier cannot see. If a model's stored SKU is
 * wrong in a way that points at a DIFFERENT RACE OF THE SAME CAR, then chassis,
 * scale, year and manufacturer all agree, the SKU matches, and a confident,
 * plausible, wrong link is written. Nothing else in the pipeline notices.
 *
 * Comparing the model's event against the title catches it, but only when the
 * title actually names a race we recognise — silence is not disagreement, and
 * 14 of 46 live links have titles that name no race at all.
 *
 * Models whose event is "Season" are exempt. There are 59 of them: generic
 * season-livery cars with no race to contradict. Sellers routinely tie them to
 * a specific round, so checking them would flag a quarter of the catalogue and
 * teach you to ignore the warning.
 */
function contradictsEvent(
  title: string,
  modelEvent: string | null,
  knownEvents: string[]
): string | null {
  if (!modelEvent || /^season$/i.test(modelEvent)) return null;
  if (eventMatches(modelEvent, title)) return null;

  const named = knownEvents.filter(e => e !== modelEvent && eventMatches(e, title));
  return named.length ? named.join(' / ') : null;
}

export interface MatchOptions {
  priorPrices?: PriceReference;
  /** Every event name in the catalogue, so a title can be read as naming one. */
  knownEvents?: string[];
}

export function matchGroup(
  group: SearchGroup,
  candidates: EbayCandidate[],
  opts: MatchOptions = {}
): GroupResult {
  const { priorPrices, knownEvents = [] } = opts;
  const claimed = new Set<string>();
  const assignments: Assignment[] = [];
  const assigned = new Set<string>();

  const idOf = (c: EbayCandidate) => c.itemId || c.url;
  const cheapestFirst = (a: EbayCandidate, b: EbayCandidate) =>
    (a.priceAud ?? Infinity) - (b.priceAud ?? Infinity);

  // --- Pass 1: the seller printed the SKU. Certain, and allowed to auto-link.
  for (const model of group.models) {
    if (!model.sku) continue;

    const hits = candidates
      .filter(c => !claimed.has(idOf(c)))
      .map(c => ({ c, v: preJudge(c.title, targetFor(model)) }))
      .filter(x => x.v.tier === 'sku-match')
      .sort((a, b) => cheapestFirst(a.c, b.c));

    if (hits.length) {
      const best = hits[0];
      const wrongRace = contradictsEvent(best.c.title, model.event, knownEvents);

      claimed.add(idOf(best.c));
      assigned.add(model.id);
      assignments.push({
        model,
        candidate: best.c,
        tier: 'sku-match',
        // A contradiction means either our SKU is wrong or the seller's title
        // is. Both are worth a human look, and neither is safe to write blind.
        reason: wrongRace
          ? `SKU ${model.sku} matches, but the listing says ${wrongRace} and this model is ${model.event} — one of them is wrong`
          : best.v.reason,
        autoLink: !wrongRace,
      });
    }
  }

  // A SKU match is certain about *identity*, which says nothing about whether
  // the price is sane. Check that before pass 2, while the sample is purely
  // SKU-matched and therefore trustworthy.
  demotePriceOutliers(assignments, priorPrices);

  // --- Pass 2: race and driver both named, no SKU. Review only.
  //
  // Requiring BOTH is the point. Every sibling in this group shares the driver
  // for a given race and every one shares the chassis, so either signal alone
  // is satisfied by a dozen wrong listings.
  for (const model of group.models) {
    if (assigned.has(model.id)) continue;

    const hits = candidates
      .filter(c => !claimed.has(idOf(c)))
      .filter(c => preJudge(c.title, targetFor(model)).tier !== 'rejected')
      .filter(c => eventMatches(model.event, c.title) && titleNamesDriver(c.title, model.driver))
      .sort(cheapestFirst);

    if (hits.length) {
      claimed.add(idOf(hits[0]));
      assigned.add(model.id);
      assignments.push({
        model,
        candidate: hits[0],
        tier: 'event-driver',
        reason: `Title names ${model.event} and ${model.driver}, but no SKU`,
        autoLink: false,
      });
    }
  }

  return {
    group,
    poolSize: candidates.length,
    assignments,
    unmatched: group.models.filter(m => !assigned.has(m.id)),
  };
}
