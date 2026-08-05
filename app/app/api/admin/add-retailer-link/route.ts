import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { modelId, url, manualMode, retailerName: manualRetailerName, price: manualPrice } = await request.json();

    if (!modelId || !url) {
      return NextResponse.json(
        { error: 'Model ID and URL required' },
        { status: 400 }
      );
    }

    console.log('🏪 Adding retailer link for model:', modelId);
    console.log('📍 URL:', url);
    console.log('🔧 Manual mode:', manualMode);

    let price = null;
    let retailerName = 'Unknown';
    let inStock = true;

    if (manualMode) {
      // Manual entry mode - use provided data
      price = manualPrice;
      retailerName = manualRetailerName;
      console.log('✍️ Using manual entry: price =', price, ', retailer =', retailerName);
    } else {
      // Auto-fetch mode - extract from URL
      const fetchResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!fetchResponse.ok) {
        throw new Error(`Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`);
      }

      const html = await fetchResponse.text();

      // Extract price from HTML
      const priceJsonMatch = html.match(/"price":\s*"?(\d+(?:\.\d+)?)"?/i);
      if (priceJsonMatch) {
        price = parseFloat(priceJsonMatch[1]);
        // Check if price is in cents (no decimal point, value > 100)
        if (price > 100 && !priceJsonMatch[1].includes('.')) {
          console.log(`💰 Price appears to be in cents: ${price}, converting to dollars`);
          price = price / 100;
        }
        console.log(`💰 Found price: ${price}`);
      }

      // Extract retailer name from URL
      try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.replace('www.', '');
        retailerName = hostname.split('.')[0];
        // Capitalize first letter
        retailerName = retailerName.charAt(0).toUpperCase() + retailerName.slice(1);
        console.log(`🏪 Retailer: ${retailerName}`);
      } catch (e) {
        console.error('Failed to parse retailer from URL');
      }

      // Check stock status
      const outOfStockPatterns = [
        /sold out/i,
        /out of stock/i,
        /unavailable/i,
        /"availability":\s*"OutOfStock"/i,
        /"availability":\s*"SoldOut"/i,
        /currently unavailable/i,
      ];

      for (const pattern of outOfStockPatterns) {
        if (pattern.test(html)) {
          inStock = false;
          console.log('⚠️ Product appears to be OUT OF STOCK');
          break;
        }
      }
    }

    // Find or create retailer
    let retailerId = null;

    // First, try to find existing retailer by domain
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace('www.', '');

    const { data: existingRetailer } = await supabase
      .from('retailers')
      .select('id, name')
      .ilike('url', `%${hostname}%`)
      .single();

    if (existingRetailer) {
      retailerId = existingRetailer.id;
      retailerName = existingRetailer.name;
      console.log(`✅ Found existing retailer: ${retailerName} (ID: ${retailerId})`);
    } else {
      // Create new retailer
      const { data: newRetailer, error: retailerError } = await supabase
        .from('retailers')
        .insert({
          name: retailerName,
          url: `https://${hostname}`,
          region: 'AU',
          currency: 'AUD',
        })
        .select()
        .single();

      if (retailerError) {
        throw new Error(`Failed to create retailer: ${retailerError.message}`);
      }

      retailerId = newRetailer.id;
      console.log(`✅ Created new retailer: ${retailerName} (ID: ${retailerId})`);
    }

    // Never store 0 as a placeholder price. It isn't a real offer, and it wins
    // every "cheapest price" sort on the site.
    const finalPrice = typeof price === 'number' ? price : parseFloat(price);

    if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
      console.log('⚠️ Price could not be extracted from the page');
      return NextResponse.json(
        {
          error: 'Could not read a price from that page',
          details:
            `Extraction returned ${price ?? 'nothing'}. Add the link with Manual mode ` +
            `and type the price in, rather than saving a placeholder.`,
          needsManualPrice: true,
          retailerName,
        },
        { status: 422 }
      );
    }

    const row = {
      model_id: modelId,
      retailer_id: retailerId,
      product_url: url,
      price: finalPrice,
      price_aud: finalPrice, // Assuming AUD for now
      currency: 'AUD',
      in_stock: inStock,
      recorded_at: new Date().toISOString(),
      // Adding a link IS a verification — the price was just read from the
      // live page. Without this the row has last_checked_at NULL, which the
      // site treats as "never checked" and hides the price behind
      // "Check price on site".
      last_checked_at: new Date().toISOString(),
    };

    // One row per (model, retailer) — update instead of adding a duplicate
    const { data: existingLink } = await supabase
      .from('price_history')
      .select('id')
      .eq('model_id', modelId)
      .eq('retailer_id', retailerId)
      .maybeSingle();

    const { data: priceHistory, error: insertError } = existingLink
      ? await supabase.from('price_history').update(row).eq('id', existingLink.id).select().single()
      : await supabase.from('price_history').insert(row).select().single();

    if (insertError) {
      throw new Error(`Failed to save price history: ${insertError.message}`);
    }

    console.log(existingLink ? '♻️ Retailer link updated' : '✅ Retailer link added successfully');

    return NextResponse.json({
      success: true,
      data: priceHistory,
    });
  } catch (error: any) {
    console.error('❌ Error adding retailer link:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to add retailer link',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
