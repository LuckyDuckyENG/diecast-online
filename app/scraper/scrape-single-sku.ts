import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Change this to the SKU you want to scrape
const TARGET_SKUS = ['18S977', 'S9514']; // George Russell Bahrain GP (1:18 and 1:43)

async function scrapeSingleSKU() {
  console.log(`🔍 Scraping SKUs: ${TARGET_SKUS.join(', ')}\n`);

  // Get the models
  const { data: models } = await supabase
    .from('models')
    .select('id, manufacturer_sku, scale, car_id, cars(event_name, livery_name)')
    .in('manufacturer_sku', TARGET_SKUS);

  if (!models || models.length === 0) {
    console.log('❌ Models not found in database');
    return;
  }

  console.log(`✅ Found ${models.length} models:`);
  for (const model of models) {
    console.log(`   SKU: ${model.manufacturer_sku} (${model.scale})`);
    console.log(`   Event: ${(model.cars as any)?.event_name}`);
    console.log(`   Livery: ${(model.cars as any)?.livery_name}\n`);
  }

  // Get all retailers
  const { data: retailers } = await supabase
    .from('retailers')
    .select('*')
    .order('name');

  if (!retailers) {
    console.log('❌ No retailers found');
    return;
  }

  console.log(`🏪 Checking ${retailers.length} retailers...\n`);

  for (const retailer of retailers) {
    console.log(`${'='.repeat(60)}`);
    console.log(`🏪 ${retailer.name}`);
    console.log(`${'='.repeat(60)}`);

    try {
      let page = 1;
      const foundSkus = new Set();

      while (page <= 50 && foundSkus.size < TARGET_SKUS.length) {
        let storeUrl = (retailer as any).url;
        if (!storeUrl) {
          console.log(`   ⚠️  No store URL for ${retailer.name}`);
          break;
        }
        if (!storeUrl.startsWith('http')) {
          storeUrl = `https://${storeUrl}`;
        }
        const url = `${storeUrl}/products.json?limit=250&page=${page}`;
        console.log(`   Checking page ${page}...`);

        const response = await axios.get(url, { timeout: 30000 });
        const products = response.data.products || [];

        if (products.length === 0) break;

        for (const product of products) {
          for (const variant of product.variants) {
            if (TARGET_SKUS.includes(variant.sku) && !foundSkus.has(variant.sku)) {
              foundSkus.add(variant.sku);
              const model = models.find(m => m.manufacturer_sku === variant.sku);

              console.log(`   ✅ FOUND ${variant.sku}!`);
              console.log(`      Title: ${product.title}`);
              console.log(`      Price: ${retailer.currency} $${variant.price}`);
              console.log(`      Available: ${variant.available}`);
              console.log(`      URL: ${storeUrl}/products/${product.handle}`);

              // Save price
              const { error } = await supabase
                .from('price_history')
                .insert({
                  model_id: model!.id,
                  retailer_id: retailer.id,
                  price: parseFloat(variant.price),
                  in_stock: variant.available,
                  product_url: `${storeUrl}/products/${product.handle}`,
                  currency: retailer.currency,
                });

              if (error) {
                console.log(`      ❌ Error saving price: ${error.message}`);
              } else {
                console.log(`      💾 Price saved to database`);
              }
            }
          }
        }

        page++;
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
      }

      if (foundSkus.size === 0) {
        console.log(`   ⚠️  Not found at ${retailer.name}`);
      } else {
        console.log(`   ✅ Found ${foundSkus.size}/${TARGET_SKUS.length} SKUs`);
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  console.log('✨ Scraping complete!\n');
}

scrapeSingleSKU();
