import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Recording what a price WAS, as well as what it is.
 *
 * price_history and ebay_links hold current state — a refresh overwrites in
 * place — so every reading before the latest one is destroyed. That is fine for
 * answering "what does this cost", and useless for "what has this done", which
 * is the more valuable question and the harder one to get elsewhere.
 *
 * A refresh already reads the price. Appending it costs one insert, so the only
 * reason not to have this is that nobody wrote it.
 *
 * IMPORTANT — what an observation means: "we saw this offer at this price at this
 * time". NOT "it sold for this price". eBay returns 404 errorId 11001 for a
 * vanished listing with no indication whether it sold, expired or was delisted,
 * so a sold price is not something we can honestly claim. Any UI reading this
 * table has to use the weaker wording.
 */

/**
 * Which job wrote an observation.
 *
 * A union rather than a CHECK constraint in the database: the failure worth
 * preventing is a typo — 'sweep-retailer' in one writer where the others say
 * 'sweep' — which makes a batch unfindable at exactly the moment you need to
 * undo it. TypeScript catches that at the call site; a CHECK would catch it at
 * runtime and would need a migration every time a writer is added.
 */
export type ObservationSource = 'sweep' | 'refresh-prices' | 'refresh-ebay' | 'rescue';

/**
 * One id for a whole run, generated once by the caller and passed to every
 * observation it records.
 *
 * This is what makes a mistake recoverable. price_observations has no update
 * path by design, so the only correction available is deletion — and without a
 * batch the only way to find a bad run's rows is a timestamp window, which also
 * catches the other two jobs writing at the same time. Undoing one bad sweep
 * would mean destroying good history alongside it.
 */
export function newBatchId(): string {
  return globalThis.crypto.randomUUID();
}

export interface Observation {
  modelId: string;
  /** The run that recorded this. See newBatchId. */
  batchId?: string | null;
  /** Which job recorded it. */
  source?: ObservationSource | null;
  /** Set for a retailer reading. Mutually exclusive with ebayItemId. */
  retailerId?: string | null;
  /** Set for an eBay reading. Mutually exclusive with retailerId. */
  ebayItemId?: string | null;
  price: number;
  currency: string;
  priceAud: number;
  inStock?: boolean | null;
  isPreorder?: boolean | null;
  /** eBay's estimatedAvailabilityStatus, when the source is eBay. */
  availability?: string | null;
  /**
   * When the price was true, if that is not now.
   *
   * Needed for one case: a listing found dead. Its row still holds the price we
   * last read and the `last_checked_at` when we read it — an observation we made
   * and never recorded, because this table did not exist yet. Stamping it now
   * would claim we saw that price today, which is false. Stamping it with the
   * original check date is the honest version and keeps the only record of what
   * the thing cost.
   */
  observedAt?: string | null;
}

/** A reading worth keeping. A zero is a failed extraction, never an offer. */
export function isRecordable(o: Observation): boolean {
  const oneSource = !!o.retailerId !== !!o.ebayItemId;
  return (
    !!o.modelId &&
    oneSource &&
    Number.isFinite(o.price) &&
    o.price > 0 &&
    Number.isFinite(o.priceAud) &&
    o.priceAud > 0
  );
}

function toRow(o: Observation) {
  return {
    model_id: o.modelId,
    retailer_id: o.retailerId ?? null,
    ebay_item_id: o.ebayItemId ?? null,
    price: o.price,
    currency: o.currency || 'AUD',
    price_aud: o.priceAud,
    in_stock: o.inStock ?? null,
    is_preorder: o.isPreorder ?? null,
    availability: o.availability ?? null,
    batch_id: o.batchId ?? null,
    source: o.source ?? null,
    observed_at: o.observedAt || new Date().toISOString(),
  };
}

/**
 * Append observations, in one insert.
 *
 * Never throws and never propagates a failure to the caller. Losing a history
 * row is a shame; failing a refresh because a history row would not insert would
 * mean the site keeps showing a stale price, which is the thing the refresh
 * exists to prevent. History is the secondary job here and must behave like it.
 *
 * Returns how many rows were written so a caller can report it rather than
 * assume it.
 */
export async function recordObservations(
  supabase: SupabaseClient,
  observations: Observation[]
): Promise<{ written: number; skipped: number; error?: string }> {
  const usable = observations.filter(isRecordable);
  const skipped = observations.length - usable.length;

  if (!usable.length) return { written: 0, skipped };

  const { error } = await supabase.from('price_observations').insert(usable.map(toRow));
  if (!error) return { written: usable.length, skipped };

  /**
   * Deploying the code before running migration 018 must not cost history.
   *
   * batch_id and source arrived in 018, and this function swallows its errors
   * on purpose — so shipping the writers first would have made every insert
   * fail on an unknown column and recorded NOTHING, quietly, for as long as the
   * migration lagged. Losing the history is precisely what 018 exists to
   * prevent, so failing that way would be the joke writing itself.
   *
   * Retry once without the provenance columns. A row with no batch is worse
   * than one with a batch and far better than no row: it is what every row
   * written before 018 already looks like.
   */
  if (/batch_id|source/.test(error.message) && /column|schema cache/i.test(error.message)) {
    const bare = usable.map(o => {
      const { batch_id, source, ...rest } = toRow(o);
      return rest;
    });
    const retry = await supabase.from('price_observations').insert(bare);
    if (!retry.error) {
      console.warn(
        `⚠️ recorded ${usable.length} observation(s) WITHOUT batch_id/source — ` +
        `migration 018 has not been applied, so this run cannot be undone as a unit.`
      );
      return { written: usable.length, skipped };
    }
  }

  // A missing table is the expected failure before migration 017 is applied,
  // and it must not stop a refresh from doing its real job.
  console.warn(`⚠️ could not record ${usable.length} observation(s): ${error.message}`);
  return { written: 0, skipped, error: error.message };
}
