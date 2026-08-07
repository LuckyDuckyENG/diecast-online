import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { toAud } from '@/lib/currency';

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

    const { data, error } = await supabase
      .from('ebay_links')
      .upsert(
        {
          model_id: modelId,
          ebay_url: ebayUrl,
          ebay_price: ebayPrice != null ? String(ebayPrice) : null,
          ebay_title: ebayTitle ?? null,
          ebay_image: ebayImage ?? null,
          ebay_item_id: ebayItemId ?? null,
          marketplace: marketplace ?? null,
          currency: numericPrice > 0 ? usableCurrency : null,
          price_aud: numericPrice > 0 ? toAud(numericPrice, usableCurrency) : null,
          // Adding a link IS a verification — the listing was just read.
          // Without this the row reads as "never checked" and the site
          // withholds the price, which is what caught out retailer links.
          last_checked_at: now,
          last_updated: now,
          auto_linked: !!autoLinked,
        },
        { onConflict: 'model_id' }
      )
      .select()
      .single();

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

export async function DELETE(request: NextRequest) {
  try {
    const { modelId } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Missing modelId' }, { status: 400 });
    }

    console.log('🗑️ Removing eBay link for model:', modelId);

    const { error } = await supabase.from('ebay_links').delete().eq('model_id', modelId);

    if (error) {
      console.error('❌ Error removing eBay link:', error);
      return NextResponse.json(
        { error: 'Failed to remove eBay link', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ eBay link removed successfully');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove eBay link', details: error.message },
      { status: 500 }
    );
  }
}
