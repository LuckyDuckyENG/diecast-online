import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { modelId, carId, ebayUrl, ebayPrice, ebayTitle, ebayImage } = await request.json();

    if (!modelId || !carId || !ebayUrl) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log('💾 Saving eBay link for model:', modelId);

    // First, ensure the car exists
    const { data: carData, error: carError } = await supabase
      .from('f1_cars')
      .select('id')
      .eq('id', carId)
      .single();

    if (carError || !carData) {
      // Car doesn't exist, we need to insert it first
      // For now, just return an error
      return NextResponse.json(
        { error: 'Car not found in database. Please import cars first.' },
        { status: 404 }
      );
    }

    // Check if model exists
    const { data: modelData, error: modelError } = await supabase
      .from('diecast_models')
      .select('id')
      .eq('id', modelId)
      .single();

    if (modelError || !modelData) {
      // Model doesn't exist
      return NextResponse.json(
        { error: 'Model not found in database. Please import models first.' },
        { status: 404 }
      );
    }

    // Upsert eBay link (insert or update if exists)
    const { data, error } = await supabase
      .from('ebay_links')
      .upsert(
        {
          model_id: modelId,
          ebay_url: ebayUrl,
          ebay_price: ebayPrice,
          ebay_title: ebayTitle,
          ebay_image: ebayImage,
          last_updated: new Date().toISOString(),
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

    console.log('✅ eBay link saved successfully');

    return NextResponse.json({
      success: true,
      data,
    });

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
      return NextResponse.json(
        { error: 'Missing modelId' },
        { status: 400 }
      );
    }

    console.log('🗑️ Removing eBay link for model:', modelId);

    const { error } = await supabase
      .from('ebay_links')
      .delete()
      .eq('model_id', modelId);

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
