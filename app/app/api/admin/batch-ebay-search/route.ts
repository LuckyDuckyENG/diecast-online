import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toCandidate, type EbayCandidate } from '@/lib/ebayMatch';
import {
  groupForSearch,
  matchGroup,
  type BatchModel,
  type PriceReference,
} from '@/lib/ebayBatch';
import { teamMatches } from '@/lib/teamName';
import { toAud } from '@/lib/currency';
import { selectAll } from '@/lib/selectAll';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';
// A full run is ~28 eBay calls; the default 15s serverless budget is not enough.
export const maxDuration = 300;

/**
 * Search eBay for many models in one pass.
 *
 * Scopes: { season, team } | { season } | { all: true }
 * Models that already have an eBay link are always skipped — this fills gaps,
 * it does not re-check existing links. (Expiry checking is a separate job.)
 *
 * dryRun returns exactly what a live run would do and writes nothing. Run it
 * first. Auto-linking is limited to SKU matches; see the note in lib/ebayBatch.
 */

interface Body {
  season?: number;
  team?: string;
  all?: boolean;
  dryRun?: boolean;
  /** Skip models searched within this many days. 0 disables the skip. */
  recheckAfterDays?: number;
}

async function getToken(): Promise<string> {
  const id = process.env.EBAY_APP_ID;
  const cert = process.env.EBAY_CERT_ID;
  if (!id || !cert) throw new Error('eBay credentials not configured');

  const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${cert}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!res.ok) throw new Error(`eBay OAuth failed: ${res.status}`);
  return (await res.json()).access_token;
}

/**
 * AU first, US only if AU has nothing — a local listing is a better offer.
 *
 * 200 is the Browse API maximum and it matters here: a group can hold seventeen
 * models all competing for matches out of one pool, so a truncated pool costs
 * links directly. The first run capped at 50 and came back with exactly 50 both
 * times, which is what a silent truncation looks like. `truncated` reports when
 * eBay still had more, rather than letting a partial answer read as complete.
 */
const POOL_LIMIT = 200; // Browse API maximum per request
const MAX_PAGES = 4; // up to 800 listings per group

async function searchPage(token: string, query: string, marketplace: string, offset: number) {
  const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(POOL_LIMIT));
  url.searchParams.set('offset', String(offset));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
  });

  if (!res.ok) {
    console.warn(`⚠️ ${marketplace} "${query}" @${offset} failed: ${res.status}`);
    return null;
  }

  const body = await res.json();
  return {
    items: (body.itemSummaries || []).map((i: any) => toCandidate(i, marketplace)),
    total: typeof body.total === 'number' ? body.total : 0,
  };
}

/**
 * The whole pool for a query, paged.
 *
 * One request caps at 200 and the first live run came back with exactly 200
 * against a reported 297 — a third of the listings never seen, in a group where
 * seventeen models were competing for matches out of that pool. Paging is what
 * makes "no match" mean "eBay does not have it" rather than "it was on page 2".
 *
 * MAX_PAGES bounds a runaway query; when it bites, `truncated` says so rather
 * than letting a partial sweep read as complete.
 */
async function searchPool(token: string, query: string) {
  for (const marketplace of ['EBAY_AU', 'EBAY_US']) {
    const items: EbayCandidate[] = [];
    let total = 0;
    let pages = 0;

    while (pages < MAX_PAGES) {
      const page = await searchPage(token, query, marketplace, pages * POOL_LIMIT);
      if (!page) break;

      total = page.total || total;
      items.push(...page.items);
      pages++;

      if (page.items.length < POOL_LIMIT || items.length >= total) break;
    }

    if (items.length) {
      return { marketplace, items, total: Math.max(total, items.length), truncated: items.length < total };
    }
  }
  return { marketplace: 'EBAY_AU', items: [] as EbayCandidate[], total: 0, truncated: false };
}

export async function POST(request: NextRequest) {
  try {
    const { season, team, all, dryRun = true, recheckAfterDays = 30 }: Body =
      await request.json();

    if (!all && !season) {
      return NextResponse.json(
        { error: 'Specify { season }, { season, team } or { all: true }' },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabase
      .from('models')
      .select(
        'id, scale, manufacturer_sku, manufacturer:manufacturers(name), ' +
          'car:cars!inner(chassis_name, event_name, driver:drivers(name), ' +
          'team:teams(name), season:seasons(year))'
      );

    if (error) throw new Error(`Model fetch failed: ${error.message}`);

    // Every race the catalogue knows about. Needed so a listing title can be
    // read as naming a race that is not this model's — the only way to catch a
    // stored SKU that points at the wrong round of the same car.
    const knownEvents = [
      ...new Set((rows || []).map((m: any) => m.car?.event_name).filter(Boolean)),
    ] as string[];

    const [links, searchLog] = await Promise.all([
      // Paged: a model can hold several listings now, so this table will pass
      // the 1000-row PostgREST cap. Truncating it would silently forget which
      // items are already spoken for and re-link them to a second model.
      selectAll<any>(supabase, 'ebay_links', 'model_id, ebay_item_id'),
      // Deliberately NOT paged — the `.error` below is how a missing table is
      // detected, and selectAll throws instead. One row per model keeps it small.
      supabase.from('ebay_search_log').select('model_id, searched_at'),
    ]);

    // Migration 013 may not have been applied yet. A missing log means every
    // model looks unsearched, which is the safe direction to fail: it costs a
    // repeated search, never a skipped one.
    const logAvailable = !searchLog.error;
    if (!logAvailable) {
      console.warn(`⚠️ ebay_search_log unavailable (${searchLog.error?.message}) — not skipping anything`);
    }
    const searched = searchLog.data;

    const linkedModels = new Set((links || []).map(l => l.model_id));
    // An item already linked to another model must not be linked again — the
    // same physical offer cannot be two different products.
    const linkedItems = new Set((links || []).map(l => l.ebay_item_id).filter(Boolean));

    const cutoff = Date.now() - recheckAfterDays * 86400_000;
    const recentlySearched = new Set(
      (searched || [])
        .filter(s => recheckAfterDays > 0 && new Date(s.searched_at).getTime() > cutoff)
        .map(s => s.model_id)
    );

    const inScope: BatchModel[] = (rows || [])
      .map((m: any) => ({
        id: m.id,
        sku: m.manufacturer_sku || null,
        scale: m.scale || null,
        manufacturer: m.manufacturer?.name || null,
        chassis: m.car?.chassis_name || null,
        event: m.car?.event_name || null,
        driver: m.car?.driver?.name || null,
        team: m.car?.team?.name || null,
        year: m.car?.season?.year ?? null,
      }))
      .filter(m => (all ? true : m.year === season))
      // Not an equality check. The admin page displays team names run through
      // its own normalizer -- "Red Bull Racing" is shown as "Red Bull" -- so an
      // exact match against the stored name silently selects nothing.
      .filter(m => (team ? teamMatches(m.team, team) : true));

    /**
     * Already having a listing is no longer a reason to skip a model.
     *
     * This used to filter on `!linkedModels.has(m.id)`, which was right when one
     * link per model was the goal — a linked model was a finished model. Now
     * that a model holds every listing found for it, that filter would skip the
     * 382 models that already have exactly one, which are precisely the ones
     * with a market to discover. The feature would have appeared to do nothing.
     *
     * Nothing is re-linked as a result: `linkedItems` drops listings already
     * stored from the pool, so a re-run sees only the ones we do not have.
     * Rate limiting stays with `recheckAfterDays`, which is what it is for.
     */
    const candidates = inScope.filter(m => !recentlySearched.has(m.id));

    if (candidates.length === 0) {
      // "Nothing to do" and "the scope matched nothing" look identical from
      // the outside and have completely different fixes. Say which.
      const message =
        inScope.length === 0
          ? `No models matched that scope — check the season and team.`
          : `Nothing to search: all ${inScope.length} model(s) in scope were ` +
            `searched in the last ${recheckAfterDays} days. ` +
            `${inScope.filter(m => linkedModels.has(m.id)).length} of them already ` +
            `hold at least one listing. Pass recheckAfterDays: 0 to search anyway.`;

      return NextResponse.json({
        success: true,
        dryRun,
        scope: all ? 'all' : `${season}${team ? ' ' + team : ''}`,
        message,
        groups: [],
        totals: { models: 0, searches: 0, autoLinked: 0, review: 0, unmatched: 0 },
      });
    }

    const groups = groupForSearch(candidates);

    // What this car already costs, so the outlier guard has a reference that
    // does not depend on how many models this particular run happens to cover.
    // Retailer prices anchor it even for a chassis with no eBay links yet.
    const [retailPrices, ebayPrices] = await Promise.all([
      selectAll<any>(supabase, 'price_history', 'model_id, price_aud'),
      selectAll<any>(supabase, 'ebay_links', 'model_id, price_aud'),
    ]);

    const knownPrices = new Map<string, number[]>();
    for (const row of [...(retailPrices || []), ...(ebayPrices || [])]) {
      const p = Number(row.price_aud);
      if (!(p > 0)) continue;
      if (!knownPrices.has(row.model_id)) knownPrices.set(row.model_id, []);
      knownPrices.get(row.model_id)!.push(p);
    }

    // Every model of this chassis by this maker, including ones already linked
    // and therefore outside `candidates` — they are the best reference we have.
    const scaleByModel = new Map<string, string>();
    const groupOfModel = new Map<string, string>();
    for (const m of inScope) scaleByModel.set(m.id, m.scale || '?');
    for (const m of (rows || []) as any[]) {
      const key = [m.car?.season?.year, m.car?.team?.name, m.car?.chassis_name, m.manufacturer?.name].join('|');
      groupOfModel.set(m.id, key);
      if (!scaleByModel.has(m.id)) scaleByModel.set(m.id, m.scale || '?');
    }

    const referenceFor = (groupKey: string): PriceReference => {
      const ref: PriceReference = new Map();
      for (const [modelId, prices] of knownPrices) {
        if (groupOfModel.get(modelId) !== groupKey) continue;
        const scale = scaleByModel.get(modelId) || '?';
        if (!ref.has(scale)) ref.set(scale, []);
        ref.get(scale)!.push(...prices);
      }
      return ref;
    };
    console.log(
      `🔎 batch: ${candidates.length} models -> ${groups.length} searches` +
        `${dryRun ? ' (dry run)' : ''}`
    );

    const token = await getToken();

    const report: any[] = [];
    const writes: any[] = [];
    const logRows: any[] = [];

    for (const group of groups) {
      const { marketplace, items, total, truncated } = await searchPool(token, group.query);
      if (truncated) {
        console.warn(`⚠️ "${group.query}": eBay has ${total}, took ${items.length}`);
      }

      // Drop listings already spoken for by a model outside this batch
      const pool = items.filter(i => !linkedItems.has(i.itemId));
      const result = matchGroup(group, pool, {
        priorPrices: referenceFor(group.key),
        knownEvents,
      });

      for (const a of result.assignments) {
        if (a.autoLink) linkedItems.add(a.candidate.itemId);

        writes.push({
          model_id: a.model.id,
          ebay_url: a.candidate.url,
          ebay_price: a.candidate.price != null ? String(a.candidate.price) : null,
          ebay_title: a.candidate.title,
          ebay_image: a.candidate.imageUrl,
          ebay_item_id: a.candidate.itemId,
          marketplace: a.candidate.marketplace,
          currency: a.candidate.currency,
          price_aud:
            a.candidate.price != null
              ? toAud(a.candidate.price, a.candidate.currency)
              : null,
          // Both were already read from the API by toCandidate and then thrown
          // away. Condition is shown as a badge; seller is what dedupes one
          // shop's repeated listings down to its cheapest.
          item_condition: a.candidate.condition,
          seller: a.candidate.seller,
          last_checked_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          auto_linked: true,
          _tier: a.tier,
          _autoLink: a.autoLink,
        });
      }

      for (const m of group.models) {
        const hit = result.assignments.find(a => a.model.id === m.id);
        logRows.push({
          model_id: m.id,
          searched_at: new Date().toISOString(),
          pool_size: result.poolSize,
          matched: !!hit,
          marketplace,
          query: group.query,
        });
      }

      report.push({
        label: group.label,
        query: group.query,
        marketplace,
        models: group.models.length,
        poolSize: result.poolSize,
        availableOnEbay: total,
        truncated,
        matches: result.assignments.map(a => ({
          modelId: a.model.id,
          model: `${a.model.manufacturer} ${a.model.scale} ${a.model.event}`,
          driver: a.model.driver,
          sku: a.model.sku,
          tier: a.tier,
          autoLink: a.autoLink,
          reason: a.reason,
          title: a.candidate.title,
          price: a.candidate.price,
          currency: a.candidate.currency,
          priceAud: a.candidate.priceAud,
          url: a.candidate.url,
          itemId: a.candidate.itemId,
          // Needed so a review item can be accepted straight from the panel
          // with everything a link requires, image included.
          image: a.candidate.imageUrl,
          marketplace: a.candidate.marketplace,
        })),
        unmatched: result.unmatched.map(m => `${m.scale} ${m.event} (${m.sku})`),
      });
    }

    const autoWrites = writes.filter(w => w._autoLink);
    const review = writes.filter(w => !w._autoLink);

    // A model can now hold several listings, so "how many rows" and "how many
    // models" are different numbers. Reporting only the row count would read as
    // a sudden jump in coverage when it is the same cars with more sellers, and
    // `unmatched` computed as candidates - writes went negative the moment one
    // model produced two rows.
    const modelsWith = (rows: typeof writes) => new Set(rows.map(w => w.model_id)).size;

    const totals = {
      models: candidates.length,
      searches: groups.length,
      autoLinked: modelsWith(autoWrites),
      autoLinkedListings: autoWrites.length,
      review: modelsWith(review),
      reviewListings: review.length,
      unmatched: candidates.length - modelsWith(writes),
    };

    if (!dryRun && autoWrites.length) {
      // Only SKU matches are written. Review-tier matches are reported and
      // deliberately left for a person — see lib/ebayBatch.
      const payload = autoWrites.map(({ _tier, _autoLink, ...row }) => row);
      // Keyed on the listing, not the model — migration 015 replaced
      // UNIQUE (model_id) with UNIQUE (model_id, ebay_item_id) so a model can
      // hold every listing found for it rather than one arbitrary winner.
      // REQUIRES 015 to have been applied; before it, this conflict target does
      // not exist.
      const { error: writeError } = await supabase
        .from('ebay_links')
        .upsert(payload, { onConflict: 'model_id,ebay_item_id' });

      if (writeError) throw new Error(`Link write failed: ${writeError.message}`);
      console.log(`✅ linked ${payload.length} models`);
    }

    if (!dryRun && logRows.length && logAvailable) {
      const { error: logError } = await supabase
        .from('ebay_search_log')
        .upsert(logRows, { onConflict: 'model_id' });
      if (logError) console.warn(`⚠️ search log write failed: ${logError.message}`);
    }

    return NextResponse.json({
      success: true,
      dryRun,
      scope: all ? 'all' : `${season}${team ? ' ' + team : ''}`,
      totals,
      groups: report,
    });
  } catch (err: any) {
    console.error('💥 batch eBay search failed:', err);
    return NextResponse.json(
      { error: 'Batch search failed', details: err.message },
      { status: 500 }
    );
  }
}
