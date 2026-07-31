import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ShopifyProduct {
  title: string;
  handle: string;
  variants: Array<{
    sku?: string;
    price: string;
    available: boolean;
  }>;
  images: Array<{
    src: string;
  }>;
}

// Search a single Shopify store for a specific SKU
// Using the EXACT same logic as scrape-auto-with-images.ts
async function searchStoreForSKU(
  retailer: any,
  sku: string
): Promise<any[]> {
  try {
    console.log(`  🔍 Searching ${retailer.name} for SKU: ${sku}`);

    const allProducts: ShopifyProduct[] = [];
    let page = 1;
    const limit = 250;
    const maxPages = 50; // Match original scraper

    while (page <= maxPages) {
      const url = `${retailer.url}/products.json?limit=${limit}&page=${page}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        console.log(`  ⚠️  ${retailer.name}: HTTP ${response.status} on page ${page}`);
        break;
      }

      const data = await response.json();
      const products: ShopifyProduct[] = data.products || [];

      if (products.length === 0) break;

      allProducts.push(...products);

      if (products.length < limit) break;

      page++;

      // Add delay between pages to avoid rate limiting (matching original scraper)
      if (page <= maxPages) {
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay (same as manual scraper)
      }
    }

    console.log(`  📦 ${retailer.name}: Searched ${allProducts.length} products from ${page} pages`);

    // Find product by EXACT SKU match (same as original scraper line 167-168)
    const matches: ShopifyProduct[] = [];
    for (const product of allProducts) {
      const variant = product.variants.find(v => v.sku === sku);
      if (variant) {
        matches.push(product);
      }
    }

    if (matches.length > 0) {
      console.log(`  ✅ ${retailer.name}: Found ${matches.length} product(s) with exact SKU match`);
      matches.forEach(m => {
        console.log(`    - "${m.title}"`);
      });
    }

    return matches.map(product => ({
      retailerId: retailer.id,
      retailerName: retailer.name,
      title: product.title,
      price: product.variants?.[0]?.price || '0',
      url: `${retailer.url}/products/${product.handle}`,
      image: product.images?.[0]?.src || '',
      inStock: product.variants?.[0]?.available || false,
      sku: product.variants?.find(v => v.sku === sku)?.sku,
    }));
  } catch (error: any) {
    console.error(`  ❌ ${retailer.name}: ${error.message}`);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { modelId, sku } = await request.json();

    if (!modelId || !sku) {
      return NextResponse.json(
        { error: 'Model ID and SKU required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Refreshing retailer links for model ${modelId} (SKU: ${sku})`);

    // Load all retailers
    const { data: retailers, error: retailersError } = await supabase
      .from('retailers')
      .select('*');

    if (retailersError) {
      throw new Error(`Failed to load retailers: ${retailersError.message}`);
    }

    console.log(`📊 Searching ${retailers?.length || 0} retailers sequentially to avoid rate limits...`);
    console.log(`⏱️  This will take 1-3 minutes depending on catalog sizes.\n`);

    // Search retailers ONE AT A TIME (sequentially) to avoid overwhelming stores
    // This matches how the original scraper works
    const allMatches: any[] = [];
    for (const retailer of (retailers || [])) {
      const matches = await searchStoreForSKU(retailer, sku);
      allMatches.push(...matches);
    }

    console.log(`✅ Found ${allMatches.length} total matches across all retailers`);

    // Save matches to price_history table
    let savedCount = 0;
    for (const match of allMatches) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('price_history')
          .select('id')
          .eq('model_id', modelId)
          .eq('retailer_id', match.retailerId)
          .single();

        if (existing) {
          // Update existing
          await supabase
            .from('price_history')
            .update({
              price: parseFloat(match.price) || 0,
              price_aud: parseFloat(match.price) || 0,
              currency: 'AUD',
              product_url: match.url,
              in_stock: match.inStock,
              recorded_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          console.log(`  📝 Updated: ${match.retailerName}`);
        } else {
          // Insert new
          await supabase
            .from('price_history')
            .insert({
              model_id: modelId,
              retailer_id: match.retailerId,
              price: parseFloat(match.price) || 0,
              price_aud: parseFloat(match.price) || 0,
              currency: 'AUD',
              product_url: match.url,
              in_stock: match.inStock,
              recorded_at: new Date().toISOString(),
            });

          console.log(`  ➕ Saved: ${match.retailerName}`);
        }

        savedCount++;
      } catch (error: any) {
        console.error(`  ❌ Failed to save ${match.retailerName}:`, error.message);
      }
    }

    console.log(`💾 Saved ${savedCount} retailer links to database`);

    return NextResponse.json({
      success: true,
      results: allMatches,
      count: allMatches.length,
      saved: savedCount,
    });
  } catch (error: any) {
    console.error('❌ Error refreshing retailers:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to refresh retailers',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
