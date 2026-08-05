import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { modelId, retailerId, retailerName, productUrl, price, title, imageUrl, inStock } = await request.json();

    if (!modelId || !retailerId || !productUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('💾 Saving retailer link for model:', modelId, 'at', retailerName);

    // Check if model exists
    const { data: modelData, error: modelError } = await supabase
      .from('models')
      .select('id')
      .eq('id', modelId)
      .single();

    if (modelError || !modelData) {
      return NextResponse.json(
        { error: `Model not found in database: ${modelError?.message}` },
        { status: 404 }
      );
    }

    // A price of 0 means extraction failed — storing it would make this the
    // "cheapest" offer on the site.
    const cleanPrice = parseFloat(price);
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) {
      return NextResponse.json(
        {
          error: `Refusing to save a price of ${price ?? 'nothing'}`,
          details: 'Price extraction failed. Enter it manually, or check the listing.',
        },
        { status: 400 }
      );
    }

    const row = {
      model_id: modelId,
      retailer_id: retailerId,
      product_url: productUrl,
      price: cleanPrice,
      currency: 'AUD', // TODO: Extract from price or retailer
      price_aud: cleanPrice,
      in_stock: inStock !== false,
      recorded_at: new Date().toISOString(),
      // Adding a link IS a verification — the price was just read from the
      // live page. Without this the row has last_checked_at NULL, which the
      // site treats as "never checked" and hides the price behind
      // "Check price on site".
      last_checked_at: new Date().toISOString(),
    };

    // One row per (model, retailer) — update rather than adding a second one,
    // so re-saving a link can't double-count the retailer.
    const { data: existingLink } = await supabase
      .from('price_history')
      .select('id')
      .eq('model_id', modelId)
      .eq('retailer_id', retailerId)
      .maybeSingle();

    const { data, error } = existingLink
      ? await supabase.from('price_history').update(row).eq('id', existingLink.id).select().single()
      : await supabase.from('price_history').insert(row).select().single();

    if (error) {
      console.error('❌ Error saving retailer link:', error);
      return NextResponse.json(
        { error: 'Failed to save retailer link', details: error.message },
        { status: 500 }
      );
    }

    console.log(existingLink ? '♻️ Updated existing retailer link' : '✅ Created retailer link');

    console.log('✅ Retailer link saved successfully');

    return NextResponse.json({
      success: true,
      data,
    });

  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to save retailer link', details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { modelId, retailerId } = await request.json();

    if (!modelId || !retailerId) {
      return NextResponse.json(
        { error: 'Missing modelId or retailerId' },
        { status: 400 }
      );
    }

    console.log('🗑️ Removing retailer link for model:', modelId, 'retailer:', retailerId);

    const { error } = await supabase
      .from('price_history')
      .delete()
      .eq('model_id', modelId)
      .eq('retailer_id', retailerId);

    if (error) {
      console.error('❌ Error removing retailer link:', error);
      return NextResponse.json(
        { error: 'Failed to remove retailer link', details: error.message },
        { status: 500 }
      );
    }

    console.log('✅ Retailer link removed successfully');

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Failed to remove retailer link', details: error.message },
      { status: 500 }
    );
  }
}
