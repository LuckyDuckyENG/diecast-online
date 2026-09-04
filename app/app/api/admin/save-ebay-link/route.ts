import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toAud, primeRates } from '@/lib/currency';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Attach an eBay listing to a model.
 *
 * Was checking f1_cars and diecast_models, both replaced by migration 007, so
 * every save returned "Car not found in database" -- which is why ebay_links
 * has sat empty despite the rest of the integration working.
 *
 * carId is no longer required either: a model already knows its car, and asking
 * the caller to supply one was how the wrong car got attached elsewhere.
 */
export async function POST(request: NextRequest) {
  try {
    // Real FX rates before any conversion. price_aud decides which shop the
    // site calls cheapest, and the fallback constants were 7.9% wrong on USD.
    await primeRates(supabase);
    const {
      modelId,
      ebayUrl,
      ebayPrice,
      ebayTitle,
      ebayImage,
      ebayItemId,
      marketplace,
      currency,
      autoLinked,
    } = await request.json();

    if (!modelId || !ebayUrl) {
      return NextResponse.json(
        { error: 'modelId and ebayUrl are required' },
        { status: 400 }
      );
    }

    // The model is the anchor — confirm it exists and read its car for logging
    const { data: model, error: modelError } = await supabase
      .from('models')
      .select('id, manufacturer_sku, scale, car:cars(chassis_name, event_name, driver:drivers(name))')
      .eq('id', modelId)
      .maybeSingle();

    if (modelError) {
      throw new Error(`Model lookup failed: ${modelError.message}`);
    }

    if (!model) {
      return NextResponse.json({ error: `Model ${modelId} not found` }, { status: 404 });
    }

    const car = model.car as any;
    console.log(
      `💾 eBay link for ${model.manufacturer_sku} (${model.scale}) — ` +
      `${car?.chassis_name} / ${car?.event_name} / ${car?.driver?.name}`
    );

    // Price arrives as a number from the API or a string from a manual paste
    const numericPrice =
      typeof ebayPrice === 'number'
        ? ebayPrice
        : parseFloat(String(ebayPrice ?? '').replace(/[^0-9.]/g, ''));

    const usableCurrency = currency || (marketplace === 'EBAY_AU' ? 'AUD' : 'USD');

    // Same rule as retailer links: a zero is a failed read, not an offer
    if (ebayPrice !== undefined && ebayPrice !== null && !(numericPrice > 0)) {
      return NextResponse.json(
        {
          error: `Refusing to save a price of ${ebayPrice}`,
          details: 'Price could not be read from the listing. Enter it manually.',
        },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();

    /**
     * The listing id, which is what makes two listings on one model different
     * things rather than a conflict.
     *
     * Derived from the URL when the caller does not supply one. It used to be
     * stored as `ebayItemId ?? null`, and a NULL here is worse than it looks:
     * Postgres treats NULLs as distinct, so once (model_id, ebay_item_id) is the
     * unique key, every id-less save would insert another row instead of
     * updating one. Every URL we hold carries an extractable id, so there is no
     * reason to accept a null.
     */
    const itemId =
      ebayItemId ||
      (String(ebayUrl).match(/\/itm\/(?:[^/]*\/)?(\d{9,15})/) ||
        String(ebayUrl).match(/[?&]item=(\d{9,15})/) ||
        [])[1];

    if (!itemId) {
      return NextResponse.json(
        {
          error: 'Could not determine the eBay item id',
          details:
            'No id was supplied and none could be read from the URL. ' +
            'An eBay listing URL normally contains /itm/<id>.',
        },
        { status: 422 }
      );
    }

    const row = {
      model_id: modelId,
      ebay_url: ebayUrl,
      ebay_price: ebayPrice != null ? String(ebayPrice) : null,
      ebay_title: ebayTitle ?? null,
      ebay_image: ebayImage ?? null,
      ebay_item_id: itemId,
      marketplace: marketplace ?? null,
      currency: numericPrice > 0 ? usableCurrency : null,
      price_aud: numericPrice > 0 ? toAud(numericPrice, usableCurrency) : null,
      // Adding a link IS a verification — the listing was just read.
      // Without this the row reads as "never checked" and the site
      // withholds the price, which is what caught out retailer links.
      last_checked_at: now,
      last_updated: now,
      auto_linked: !!autoLinked,
    };

    // Look up then write, rather than upserting on a named conflict target.
    // `onConflict: 'model_id'` needed the UNIQUE (model_id) that migration 015
    // removes, so an upsert would have tied this route to whichever side of that
    // migration the database happened to be on. This works either way.
    const { data: existing, error: findError } = await supabase
      .from('ebay_links')
      .select('id')
      .eq('model_id', modelId)
      .eq('ebay_item_id', itemId)
      .maybeSingle();

    if (findError) {
      return NextResponse.json(
        { error: 'Failed to look up eBay link', details: findError.message },
        { status: 500 }
      );
    }

    const { data, error } = existing
      ? await supabase.from('ebay_links').update(row).eq('id', existing.id).select().single()
      : await supabase.from('ebay_links').insert(row).select().single();

    if (error) {
      console.error('❌ Error saving eBay link:', error);
      return NextResponse.json(
        { error: 'Failed to save eBay link', details: error.message },
        { status: 500 }
      );
    }

    console.log(
      `✅ eBay link saved${autoLinked ? ' (auto)' : ''}: ${marketplace || '?'} ` +
      `${numericPrice > 0 ? numericPrice + ' ' + usableCurrency : 'no price'}`
    );

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to save eBay link', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Remove eBay listings from a model.
 *
 * Pass `ebayItemId` to remove one listing. Without it this still removes every
 * listing on the model, which was the only possible meaning when a model could
 * hold just one — the existing "remove the eBay link" button relies on it.
 *
 * The count is returned because those two cases are no longer the same action,
 * and a caller that meant to drop one listing should be able to notice it
 * dropped six.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { modelId, ebayItemId } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Missing modelId' }, { status: 400 });
    }

    console.log(
      ebayItemId
        ? `🗑️ Removing eBay listing ${ebayItemId} from model ${modelId}`
        : `🗑️ Removing ALL eBay listings for model ${modelId}`
    );

    let q = supabase.from('ebay_links').delete().eq('model_id', modelId);
    if (ebayItemId) q = q.eq('ebay_item_id', ebayItemId);

    const { data, error } = await q.select('id');

    if (error) {
      console.error('❌ Error removing eBay link:', error);
      return NextResponse.json(
        { error: 'Failed to remove eBay link', details: error.message },
        { status: 500 }
      );
    }

    const removed = (data || []).length;
    console.log(`✅ removed ${removed} eBay listing${removed === 1 ? '' : 's'}`);
    return NextResponse.json({ success: true, removed });
  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove eBay link', details: error.message },
      { status: 500 }
    );
  }
}
