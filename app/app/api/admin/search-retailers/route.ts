import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { modelId } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Model ID required' }, { status: 400 });
    }

    console.log('🔍 Searching existing retailer links for model:', modelId);

    // Query price_history table for existing retailer links
    // This is the same approach the frontend uses in app/cars/[id]/page.tsx
    const { data: priceData, error: priceError } = await supabase
      .from('price_history')
      .select(`
        price,
        currency,
        price_aud,
        in_stock,
        recorded_at,
        product_url,
        retailer:retailers(id, name, url)
      `)
      .eq('model_id', modelId)
      .order('in_stock', { ascending: false })
      .order('price_aud', { ascending: true });

    if (priceError) {
      throw new Error(`Failed to fetch price history: ${priceError.message}`);
    }

    // Transform to match expected format
    const results = (priceData || []).map((item: any) => ({
      retailerId: item.retailer?.id,
      retailerName: item.retailer?.name || 'Unknown',
      title: `Product at ${item.retailer?.name}`, // We don't store product title in price_history
      price: item.price_aud?.toString() || item.price?.toString() || '0',
      url: item.product_url,
      image: '', // We don't store images in price_history
      inStock: item.in_stock !== false,
    }));

    console.log(`✅ Found ${results.length} existing retailer links from price_history`);

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('❌ Error searching retailers:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to search retailers',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
