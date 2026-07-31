import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { priceHistoryId, price, currency, inStock, productUrl } = await request.json();

    if (!priceHistoryId) {
      return NextResponse.json(
        { error: 'Price history ID required' },
        { status: 400 }
      );
    }

    console.log('✏️ Updating retailer link:', priceHistoryId);

    // Calculate price_aud if currency is not AUD
    let priceAud = price;
    if (currency !== 'AUD') {
      // Simple conversion - you might want to use a real exchange rate API
      const conversionRates: Record<string, number> = {
        'USD': 1.5,
        'EUR': 1.6,
        'GBP': 1.9,
      };
      priceAud = price * (conversionRates[currency] || 1);
    }

    // Update the price_history entry
    const { data: updatedLink, error: updateError } = await supabase
      .from('price_history')
      .update({
        price,
        price_aud: priceAud,
        currency,
        in_stock: inStock,
        product_url: productUrl,
        recorded_at: new Date().toISOString(),
      })
      .eq('id', priceHistoryId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update retailer link: ${updateError.message}`);
    }

    console.log('✅ Retailer link updated successfully');

    return NextResponse.json({
      success: true,
      data: updatedLink,
    });
  } catch (error: any) {
    console.error('❌ Error updating retailer link:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to update retailer link',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
