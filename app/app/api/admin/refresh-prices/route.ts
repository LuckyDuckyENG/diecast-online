import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { toAud } from '@/lib/currency';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * A refreshed price this far from the stored one is not a price change, it's a
 * parsing failure — a first-match regex grabbing a different product, or a
 * cents/dollars mix-up. Real prices don't move 5x, so refuse to write it and
 * flag it for a human instead.
 */
const IMPLAUSIBLE_RATIO = 5;

/** Walk a JSON-LD tree for an offer price. schema.org prices are major units. */
function findOfferPrice(node: any): number | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findOfferPrice(child);
      if (found !== null) return found;
    }
    return null;
  }

  if (node.offers) {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      const raw = offer?.price ?? offer?.lowPrice;
      if (raw !== undefined && raw !== null) {
        const parsed = parseFloat(String(raw));
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'offers') continue;
    const found = findOfferPrice(node[key]);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Read the price from JSON-LD. Preferred over regex because it's scoped to the
 * product's own offer rather than the first `"price":` anywhere in the page
 * (which could be a related product, a variant, or shipping).
 */
function extractJsonLdPrice(html: string): number | null {
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );

  for (const block of blocks) {
    try {
      const found = findOfferPrice(JSON.parse(block[1].trim()));
      if (found !== null) return found;
    } catch {
      // Malformed JSON-LD is common; just try the next block
    }
  }

  return null;
}

/** Free-text fallback, used only when no structured signal is present. */
const OUT_OF_STOCK_PATTERNS = [
  /sold out/i,
  /out of stock/i,
  /unavailable/i,
  /currently unavailable/i,
  // "Product is no longer available" — Tibormodel and others. The older
  // /unavailable/ pattern does NOT cover this, since "no longer available"
  // never contains the string "unavailable".
  /no longer available/i,
  /no longer in production/i,
  /discontinued/i,
];

/**
 * Whether migration 009 has been applied. Cached for the life of the process
 * so we don't probe on every entry. Until it runs, writes simply omit the
 * column rather than failing the whole refresh.
 */
let hasLastCheckedAt = false;

async function supportsLastCheckedAt(): Promise<boolean> {
  // Only the positive result is cached. A missing column is a temporary state
  // (the migration hasn't run yet), so caching "false" would keep the feature
  // disabled for the life of the process even after the migration lands —
  // which is exactly what happened on the running dev server.
  if (hasLastCheckedAt) return true;

  const { error } = await supabase.from('price_history').select('last_checked_at').limit(1);
  hasLastCheckedAt = !error;

  if (!hasLastCheckedAt) {
    console.warn('⚠️ price_history.last_checked_at missing — run migration 009 to record check times');
  }
  return hasLastCheckedAt;
}

const OUT_OF_STOCK_TOKENS = /OutOfStock|SoldOut|Discontinued|BackOrder|PreOrder/i;
const IN_STOCK_TOKENS = /InStock|InStoreOnly|LimitedAvailability|OnlineOnly/i;

/** Walk a JSON-LD tree for an offer's availability string. */
function findAvailability(node: any): string | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAvailability(child);
      if (found !== null) return found;
    }
    return null;
  }

  if (node.offers) {
    const offers = Array.isArray(node.offers) ? node.offers : [node.offers];
    for (const offer of offers) {
      if (typeof offer?.availability === 'string') return offer.availability;
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'offers') continue;
    const found = findAvailability(node[key]);
    if (found !== null) return found;
  }

  return null;
}

/**
 * Determine stock status. Returns null when the page says nothing either way,
 * so the caller can keep its existing default rather than inventing an answer.
 *
 * Order matters: structured markup is authoritative, free text is a guess.
 * Plenty of pages carry the phrase "out of stock" somewhere harmless (a related
 * item, a size selector), so text must never override explicit markup.
 */
function extractAvailability(html: string): boolean | null {
  // 1. Microdata — matches the whole tag, so attribute order doesn't matter:
  //    <link itemprop="availability" href="https://schema.org/OutOfStock">
  const microTag = html.match(/<[^>]*itemprop=["']availability["'][^>]*>/i);
  if (microTag) {
    if (OUT_OF_STOCK_TOKENS.test(microTag[0])) return false;
    if (IN_STOCK_TOKENS.test(microTag[0])) return true;
  }

  // 2. JSON-LD offers.availability
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const block of blocks) {
    try {
      const availability = findAvailability(JSON.parse(block[1].trim()));
      if (availability) {
        if (OUT_OF_STOCK_TOKENS.test(availability)) return false;
        if (IN_STOCK_TOKENS.test(availability)) return true;
      }
    } catch {
      // Malformed JSON-LD is common; move on
    }
  }

  // 3. Free text, last resort
  for (const pattern of OUT_OF_STOCK_PATTERNS) {
    if (pattern.test(html)) return false;
  }

  return null;
}

/**
 * Reorder so consecutive entries hit different shops.
 *
 * 42 of ~104 links are a single retailer, so processing in natural order would
 * fire 42 requests at one host back to back. Round-robin by retailer spreads the
 * load, which keeps us polite and reduces the odds of being rate-limited or
 * blocked mid-run.
 */
function interleaveByRetailer<T extends { retailer_id: string | null }>(rows: T[]): T[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.retailer_id || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }

  // Spread each retailer evenly over the whole run rather than round-robin.
  // Plain round-robin empties the small buckets first and leaves the dominant
  // retailer bunched at the tail — with 42 of 104 links on one host that meant a
  // run of 29 consecutive requests to it. Spacing each bucket's items at
  // total/n keeps the busiest host ~2-3 slots apart end to end.
  const total = rows.length;
  const placed: { position: number; row: T }[] = [];

  for (const bucket of buckets.values()) {
    const spacing = total / bucket.length;
    bucket.forEach((row, i) => {
      placed.push({ position: (i + 0.5) * spacing, row });
    });
  }

  placed.sort((a, b) => a.position - b.position);
  return placed.map(p => p.row);
}

export async function POST(request: NextRequest) {
  try {
    const {
      modelId,
      priceHistoryId,
      priceHistoryIds,
      retailerId,
      dryRun,
      plan,
    } = await request.json();

    // ------------------------------------------------------------------
    // Plan mode: return the ordered list of links to refresh and do no
    // work. The UI walks this in small batches so nothing hangs for
    // minutes and progress is visible.
    // ------------------------------------------------------------------
    if (plan) {
      let planQuery = supabase
        .from('price_history')
        .select('id, retailer_id')
        .not('product_url', 'is', null);

      if (modelId) planQuery = planQuery.eq('model_id', modelId);
      if (retailerId) planQuery = planQuery.eq('retailer_id', retailerId);

      const { data: planRows, error: planError } = await planQuery;
      if (planError) {
        throw new Error(`Failed to build refresh plan: ${planError.message}`);
      }

      const ordered = interleaveByRetailer(planRows || []);
      console.log(`📋 Refresh plan: ${ordered.length} link(s) across ${new Set(ordered.map(r => r.retailer_id)).size} retailer(s)`);

      return NextResponse.json({
        success: true,
        total: ordered.length,
        ids: ordered.map(r => r.id),
      });
    }

    console.log(dryRun ? '🧪 Refreshing prices (DRY RUN — nothing will be written)...' : '🔄 Refreshing prices...');

    // Fetch price history entries to refresh
    let query = supabase
      .from('price_history')
      .select('id, model_id, product_url, price, currency, retailer_id, in_stock')
      .not('product_url', 'is', null);

    // A batch of specific entries (how the "Refresh all" button works)
    if (Array.isArray(priceHistoryIds) && priceHistoryIds.length > 0) {
      query = query.in('id', priceHistoryIds);
      console.log(`🔄 Refreshing batch of ${priceHistoryIds.length} price entries`);
    }
    // If priceHistoryId provided, only refresh that specific price entry
    else if (priceHistoryId) {
      query = query.eq('id', priceHistoryId);
      console.log(`🔄 Refreshing single price entry: ${priceHistoryId}`);
    }
    // Else if modelId provided, refresh all prices for that model
    else if (modelId) {
      query = query.eq('model_id', modelId);
      console.log(`🔄 Refreshing prices for model: ${modelId}`);
    } else {
      console.log('🔄 Refreshing all prices...');
    }

    const { data: priceEntries, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch price entries: ${fetchError.message}`);
    }

    console.log(`📊 Found ${priceEntries?.length || 0} prices to check`);

    let updated = 0;
    let unchanged = 0;
    let failed = 0;
    const suspicious: any[] = [];
    const changes: any[] = [];

    // Only successful checks stamp last_checked_at, so links we can't read
    // (403s, price-less pages) visibly age instead of looking freshly verified.
    const trackChecks = await supportsLastCheckedAt();
    const stampChecked = () =>
      trackChecks ? { last_checked_at: new Date().toISOString() } : {};

    // Process each price entry
    for (const entry of priceEntries || []) {
      try {
        console.log(`\n🔍 Checking: ${entry.product_url}`);

        // Fetch the product page
        const response = await fetch(entry.product_url);
        const html = await response.text();

        // Extract title and price from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1] : '';

        // Try multiple methods to extract price
        let currentPrice = null;

        // Method 1: JSON-LD structured data — parsed properly, scoped to the
        // product's own offer. Prices here are major units per schema.org, so
        // there's no cents ambiguity to guess at.
        currentPrice = extractJsonLdPrice(html);
        if (currentPrice) {
          console.log(`💰 Found price in JSON-LD: ${currentPrice}`);
        }

        // Method 1b: loose regex, last resort among the cheap methods. Takes the
        // first "price": in the page, which may not be this product — the
        // plausibility check below is what stops a bad read being written.
        //
        // NOTE: the old code divided any whole number > 100 by 100 on the
        // assumption it was cents. A third of this catalogue is priced in whole
        // dollars above 100 (Stone Model $392, Downies $429), so that turned
        // real prices into $3.92 and $4.29 and made them the site's cheapest
        // offers. Removed — cents are now inferred only from JSON-LD structure.
        if (!currentPrice) {
          const priceJsonMatch = html.match(/"price":\s*"?(\d+(?:\.\d+)?)"?/i);
          if (priceJsonMatch) {
            currentPrice = parseFloat(priceJsonMatch[1]);
            console.log(`💰 Found price via regex (unverified): ${currentPrice}`);
          }
        }

        // Method 2: Meta tags
        if (!currentPrice) {
          const metaPriceMatch = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i);
          if (metaPriceMatch) {
            currentPrice = parseFloat(metaPriceMatch[1]);
            console.log(`💰 Found price in meta tag: ${currentPrice}`);
          }
        }

        // Method 3: Ask Claude as fallback
        if (!currentPrice) {
          console.log('🤖 Asking Claude to extract price...');
          const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content: `Extract the current price from this product page title. Return ONLY a JSON object with the price as a number.

Product title: ${title}

Return format:
{
  "price": 389.99
}

If no price found, return {"price": null}`,
            }],
          });

          const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            currentPrice = parsed.price;
            if (currentPrice) {
              console.log(`💰 Claude found price: ${currentPrice}`);
            }
          }
        }

        // Check stock status FIRST. This used to sit below the "no price" bail
        // out, so a listing that sold out and removed its price never got
        // marked out of stock — the site kept showing a stale price as
        // available, which is the worst kind of wrong for a price comparison.
        const availability = extractAvailability(html);
        // No signal at all -> keep the previous assumption rather than guessing
        const inStock = availability ?? true;

        if (availability === false) {
          console.log('⚠️ Product reads as OUT OF STOCK');
        } else if (availability === true) {
          console.log('✅ Product reads as IN STOCK');
        } else {
          console.log('❔ No availability signal on the page — assuming in stock');
        }

        if (!currentPrice) {
          // No price, but we still learned something about availability.
          // price is NOT NULL, so keep the last known figure — "last seen at
          // $X, currently unavailable" is honest; silently doing nothing is not.
          if (inStock === false && (entry.in_stock ?? true) !== false) {
            console.log('📦 No price on page, but it reads as out of stock — recording that');

            if (dryRun) {
              changes.push({
                id: entry.id,
                url: entry.product_url,
                kind: 'stock-only',
                from: { price: entry.price, inStock: entry.in_stock ?? true },
                to: { price: entry.price, inStock: false },
              });
              updated++;
            } else {
              const { error: stockError } = await supabase
                .from('price_history')
                .update({
                  in_stock: false,
                  recorded_at: new Date().toISOString(),
                  ...stampChecked(),
                })
                .eq('id', entry.id);

              if (stockError) {
                console.error('⚠️ Failed to update stock status:', stockError);
                failed++;
              } else {
                console.log('✅ Marked out of stock (price left at last known value)');
                updated++;
              }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }

          console.log('⚠️ No price extracted from any method');
          failed++;
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }

        console.log(`💰 Current price: ${currentPrice} ${entry.currency}`);
        console.log(`💰 Stored price: ${entry.price} ${entry.currency}`);

        // Check if price OR stock status changed
        let priceChanged = Math.abs(currentPrice - entry.price) > 0.01;
        const stockStatusChanged = inStock !== (entry.in_stock ?? true);

        // Reconcile minor units before judging the change.
        //
        // Shopify (Anthony's Diecasts and ~40% of these links) exposes prices in
        // cents in its embedded product JSON, so the regex fallback reads 34999
        // for $349.99. The old code guessed at this by magnitude — any whole
        // number over 100 got divided by 100 — which mangled genuine whole-dollar
        // prices like Stone Model's $392.
        //
        // Anchoring to the stored price instead makes it unambiguous: a ~100x
        // gap is a units mismatch, not a price change. A real price never moves
        // 100x, and a units error is always almost exactly 100x.
        if (entry.price > 0) {
          const rawRatio = currentPrice / entry.price;
          if (rawRatio > 95 && rawRatio < 105) {
            console.log(`🔢 Minor units detected (${rawRatio.toFixed(1)}x) — ${currentPrice} → ${currentPrice / 100}`);
            currentPrice = currentPrice / 100;
            priceChanged = Math.abs(currentPrice - entry.price) > 0.01;
          }
        }

        // Guard against a bad read overwriting a good price. A 5x swing is a
        // parsing failure, not a sale — most often the regex picking up a
        // different product on the page.
        if (priceChanged && entry.price > 0) {
          const ratio = currentPrice / entry.price;
          if (ratio > IMPLAUSIBLE_RATIO || ratio < 1 / IMPLAUSIBLE_RATIO) {
            console.error(
              `🚫 Implausible price change ${entry.price} → ${currentPrice} ` +
              `(${ratio.toFixed(2)}x) — refusing to write, needs a human`
            );
            suspicious.push({
              id: entry.id,
              url: entry.product_url,
              storedPrice: entry.price,
              scrapedPrice: currentPrice,
              currency: entry.currency,
              ratio: Number(ratio.toFixed(3)),
            });
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        }

        if (priceChanged || stockStatusChanged) {
          // Price or stock changed! Update the existing entry
          if (priceChanged) {
            console.log(`📈 Price changed: ${entry.price} → ${currentPrice}`);
          }
          if (stockStatusChanged) {
            console.log(`📦 Stock status changed: ${entry.in_stock ?? true} → ${inStock}`);
          }

          if (dryRun) {
            changes.push({
              id: entry.id,
              url: entry.product_url,
              kind: priceChanged ? 'price' : 'stock',
              from: { price: entry.price, inStock: entry.in_stock ?? true },
              to: { price: currentPrice, inStock },
              currency: entry.currency,
            });
            updated++;
          } else {
            const { error: updateError } = await supabase
              .from('price_history')
              .update({
                price: currentPrice,
                // Convert rather than nulling. This previously wrote NULL for
                // every non-AUD link, dropping them out of the cheapest-price
                // comparison the site is built on.
                price_aud: toAud(currentPrice, entry.currency),
                in_stock: inStock,
                recorded_at: new Date().toISOString(),
                ...stampChecked(),
              })
              .eq('id', entry.id);

            if (updateError) {
              console.error('⚠️ Failed to update price:', updateError);
              failed++;
            } else {
              console.log('✅ Price/stock updated');
              updated++;
            }
          }
        } else {
          console.log('✅ Price and stock unchanged');
          // Still a successful verification — this is the case recorded_at can
          // never capture, and the whole reason last_checked_at exists.
          if (trackChecks && !dryRun) {
            await supabase
              .from('price_history')
              .update(stampChecked())
              .eq('id', entry.id);
          }
          unchanged++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error: any) {
        console.error(`❌ Error checking price for ${entry.product_url}:`, error.message);
        failed++;
      }
    }

    console.log('\n📊 Refresh Summary:');
    console.log(`  ${dryRun ? '🧪 Would update' : '✅ Updated'}: ${updated}`);
    console.log(`  ⏭️  Unchanged: ${unchanged}`);
    console.log(`  🚫 Suspicious (not written): ${suspicious.length}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📊 Total: ${priceEntries?.length || 0}`);

    if (suspicious.length) {
      console.log('\n🚫 Implausible reads needing review:');
      suspicious.forEach(s =>
        console.log(`   ${s.storedPrice} → ${s.scrapedPrice} ${s.currency} (${s.ratio}x)  ${s.url}`)
      );
    }

    return NextResponse.json({
      success: true,
      dryRun: !!dryRun,
      summary: {
        total: priceEntries?.length || 0,
        updated,
        unchanged,
        failed,
        suspicious: suspicious.length,
      },
      suspicious,
      // Only populated on a dry run — the list of writes that were skipped
      changes: dryRun ? changes : undefined,
    });

  } catch (error: any) {
    console.error('❌ Error refreshing prices:', error.message);
    return NextResponse.json(
      { error: 'Failed to refresh prices', details: error.message },
      { status: 500 }
    );
  }
}
