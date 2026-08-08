import type { SupabaseClient } from '@supabase/supabase-js';
import { toAud } from './currency';

/**
 * Shared retailer-link writer. Takes the caller's client rather than building
 * one, so the service key never gets pulled into a client bundle.
 *
 * Conversion rates live in lib/currency.ts so refresh-prices uses the same
 * ones — see the note there about them being hardcoded.
 */

function retailerNameFromUrl(url: URL): string {
  const hostname = url.hostname.replace(/^www\./, '');
  const parts = hostname.split('.');

  // Skip common country/shop subdomains: "au.theraceworks.com" -> "theraceworks"
  const commonSubdomains = ['au', 'uk', 'us', 'ca', 'eu', 'shop', 'store', 'www'];
  let domainPart = parts[0];
  if (commonSubdomains.includes(parts[0]) && parts.length > 2) {
    domainPart = parts[1];
  }

  return domainPart
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface AttachResult {
  ok: boolean;
  retailerName?: string;
  updated?: boolean;
  reason?: string;
}

/**
 * Point a model at a retailer URL, creating the retailer if it's new.
 *
 * Idempotent by (model_id, retailer_id): re-linking the same shop updates the
 * existing row rather than adding a second one, so re-pasting a URL can't
 * double-count a retailer in the price comparison.
 */
export async function attachRetailerLink(
  supabase: SupabaseClient,
  opts: {
    modelId: string;
    retailerUrl: string;
    price: number;
    currency?: string;
    inStock?: boolean;
    /**
     * Keep the product_url already on the row, updating only price and stock.
     *
     * For the automated retailer sweep. A hand-picked URL may point at a
     * specific variant or bundle that a SKU match would not reproduce, and
     * silently replacing it would undo a deliberate choice. Manual callers
     * leave this off, so pasting a URL still repoints the link.
     */
    preserveExistingUrl?: boolean;
  }
): Promise<AttachResult> {
  const { modelId, retailerUrl, price, currency, inStock, preserveExistingUrl } = opts;

  // A zero or negative price is always a failed extraction, never a real offer.
  // Storing one poisons the comparison — it wins every "cheapest" sort.
  if (!Number.isFinite(price) || price <= 0) {
    return {
      ok: false,
      reason:
        `Refusing to store a price of ${price} — extraction failed. ` +
        `Enter the price manually, or check the listing.`,
    };
  }

  try {
    const url = new URL(retailerUrl.trim());
    const baseUrl = `${url.protocol}//${url.hostname}`;
    const retailerName = retailerNameFromUrl(url);

    // Match on the bare hostname. Comparing raw URL prefixes meant a stored
    // "https://diecastlegends.com" never matched a pasted
    // "https://www.diecastlegends.com", so we'd try to create a retailer that
    // already existed and trip retailers_name_unique.
    const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');
    const targetHost = bareHost(url.hostname);

    const { data: allRetailers, error: listError } = await supabase
      .from('retailers')
      .select('id, name, url');

    if (listError) {
      return { ok: false, reason: `Retailer lookup failed: ${listError.message}` };
    }

    let existingRetailer = (allRetailers || []).find((r: any) => {
      if (!r.url) return false;
      try {
        return bareHost(new URL(r.url).hostname) === targetHost;
      } catch {
        return bareHost(r.url.replace(/^https?:\/\//, '').split('/')[0]) === targetHost;
      }
    });

    // Fall back to name, since that column is uniquely constrained
    if (!existingRetailer) {
      existingRetailer = (allRetailers || []).find(
        (r: any) => r.name?.trim().toLowerCase() === retailerName.trim().toLowerCase()
      );
      if (existingRetailer) {
        console.log(`✅ Matched retailer by name: ${existingRetailer.name}`);
      }
    }

    let retailerId: string;
    if (existingRetailer) {
      retailerId = existingRetailer.id;
      console.log(`✅ Found existing retailer: ${existingRetailer.name} (${retailerId})`);
    } else {
      const { data: newRetailer, error: retailerError } = await supabase
        .from('retailers')
        .insert({
          name: retailerName,
          url: baseUrl,
          region: url.hostname.endsWith('.au') ? 'AU' : url.hostname.endsWith('.uk') ? 'UK' : 'US',
          currency: url.hostname.endsWith('.au') ? 'AUD' : url.hostname.endsWith('.uk') ? 'GBP' : 'USD',
        })
        .select('id')
        .single();

      if (retailerError || !newRetailer) {
        return { ok: false, reason: `Failed to create retailer: ${retailerError?.message}` };
      }
      retailerId = newRetailer.id;
      console.log(`✅ Created new retailer: ${retailerName} (${retailerId})`);
    }

    const selectedCurrency = currency || 'AUD';
    const priceAud = toAud(price, selectedCurrency);

    const row = {
      model_id: modelId,
      retailer_id: retailerId,
      product_url: retailerUrl.trim(),
      price,
      currency: selectedCurrency,
      price_aud: priceAud,
      in_stock: inStock !== false,
      recorded_at: new Date().toISOString(),
      // Adding a link IS a verification — the price was just read from the
      // live page. Without this the row has last_checked_at NULL, which the
      // site treats as "never checked" and hides the price behind
      // "Check price on site".
      last_checked_at: new Date().toISOString(),
    };

    // One row per (model, retailer) — update in place if this shop is already linked
    const { data: existingLink } = await supabase
      .from('price_history')
      .select('id, price, product_url')
      .eq('model_id', modelId)
      .eq('retailer_id', retailerId)
      .maybeSingle();

    if (existingLink) {
      const patch =
        preserveExistingUrl && existingLink.product_url
          ? { ...row, product_url: existingLink.product_url }
          : row;

      const { error } = await supabase
        .from('price_history')
        .update(patch)
        .eq('id', existingLink.id);

      if (error) return { ok: false, retailerName, reason: error.message };

      console.log(
        `♻️ Updated ${retailerName}: ${existingLink.price} → ${price} ${selectedCurrency}`
      );
      return { ok: true, retailerName, updated: true };
    }

    const { error } = await supabase.from('price_history').insert(row);
    if (error) return { ok: false, retailerName, reason: error.message };

    console.log(
      `✅ Linked ${retailerName}: ${price} ${selectedCurrency} (${priceAud.toFixed(2)} AUD)`
    );
    return { ok: true, retailerName, updated: false };
  } catch (err: any) {
    return { ok: false, reason: `Bad retailer URL: ${err.message}` };
  }
}
