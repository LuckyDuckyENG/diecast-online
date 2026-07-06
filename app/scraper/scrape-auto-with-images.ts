import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  images: Array<{ src: string }>;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    sku: string;
    available: boolean;
  }>;
}

interface Retailer {
  id: number;
  name: string;
  url: string;
  currency: string;
}

interface Model {
  id: number;
  manufacturer_sku: string;
  scale: string;
  image_url: string | null;
}

// Exchange rate cache (refreshed once per scraper run)
let exchangeRates: { [key: string]: number } | null = null;

// Fetch exchange rates from API
async function getExchangeRates(): Promise<{ [key: string]: number }> {
  if (exchangeRates) return exchangeRates;

  try {
    // Using exchangerate-api.io free tier (1,500 requests/month)
    const response = await axios.get('https://open.er-api.com/v6/latest/AUD');

    if (response.data && response.data.rates) {
      // Invert rates to convert TO AUD (API gives FROM AUD)
      const rates: { [key: string]: number } = {};
      for (const [currency, rate] of Object.entries(response.data.rates)) {
        rates[currency] = 1 / (rate as number);
      }
      rates['AUD'] = 1; // 1 AUD = 1 AUD

      exchangeRates = rates;
      console.log('📊 Exchange rates loaded:', rates);
      return rates;
    }
  } catch (error) {
    console.error('⚠️  Failed to fetch exchange rates, using fallback rates');
  }

  // Fallback rates if API fails
  exchangeRates = {
    'AUD': 1,
    'USD': 1.53,
    'HKD': 0.195,
    'GBP': 1.98,
    'EUR': 1.65,
  };
  return exchangeRates;
}

// Convert price to AUD
async function convertToAUD(price: number, fromCurrency: string): Promise<number> {
  const rates = await getExchangeRates();
  const rate = rates[fromCurrency] || 1;
  return Math.round(price * rate * 100) / 100; // Round to 2 decimals
}

// Fetch products from a Shopify store with early exit and retry logic
async function fetchAllShopifyProducts(
  storeUrl: string,
  targetSKUs?: string[]
): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  const foundSKUs = new Set<string>();
  let page = 1;
  const limit = 250;
  const maxPages = 50;

  console.log(`📦 Fetching products from ${storeUrl}...\n`);
  if (targetSKUs) {
    console.log(`🎯 Looking for ${targetSKUs.length} specific SKUs\n`);
  }

  while (page <= maxPages) {
    const url = `${storeUrl}/products.json?limit=${limit}&page=${page}`;

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 30000,
      });

      const products: ShopifyProduct[] = response.data.products || [];

      if (products.length === 0) {
        break;
      }

      allProducts.push(...products);
      console.log(`   Page ${page}: ${products.length} products`);

      // Track which SKUs we've found
      if (targetSKUs) {
        for (const product of products) {
          for (const variant of product.variants) {
            if (variant.sku && targetSKUs.includes(variant.sku)) {
              foundSKUs.add(variant.sku);
            }
          }
        }

        // Early exit if we found all SKUs
        if (foundSKUs.size === targetSKUs.length) {
          console.log(`✅ Found all ${targetSKUs.length} target SKUs! Stopping early.\n`);
          break;
        }
      }

      if (products.length < limit) {
        break;
      }

      page++;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased delay to 1s
    } catch (error: any) {
      // Handle rate limiting with retry
      if (error.response?.status === 429) {
        console.error(`⚠️  Rate limited on page ${page}, waiting 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue; // Retry same page
      }

      console.error(`❌ Error fetching page ${page}:`, error.message);
      break;
    }
  }

  console.log(`✅ Total products fetched: ${allProducts.length}`);
  if (targetSKUs) {
    console.log(`✅ Found ${foundSKUs.size}/${targetSKUs.length} target SKUs\n`);
  }
  return allProducts;
}

// Find product in catalog by SKU
function findProductBySKU(products: ShopifyProduct[], sku: string): ShopifyProduct | null {
  for (const product of products) {
    const variant = product.variants.find(v => v.sku === sku);
    if (variant) {
      return product;
    }
  }
  return null;
}

// Validate that the product matches expected criteria
function validateProduct(product: ShopifyProduct, expectedData: { scale: string; eventName: string; liveryName: string }): { valid: boolean; reason?: string } {
  const title = product.title.toLowerCase();
  const scale = expectedData.scale.toLowerCase();

  // Check 1: Scale match (optional - some stores don't include scale in title)
  // SKU matching is already scale-specific, so this is just a sanity check
  const hasScale = title.includes(scale) || title.includes(scale.replace(':', '/'));
  if (!hasScale) {
    console.log(`   ⚠️  Warning: Scale "${expectedData.scale}" not found in title, but SKU matched so continuing...`);
  }

  // Check 2: Event/GP name should be present (if it's a GP winner)
  // For World Champion editions, accept "world champion" or specific GP name
  if (expectedData.eventName.toLowerCase().includes('gp')) {
    const gpName = expectedData.eventName.toLowerCase().replace(' winner', '').replace(' gp', '').replace(' world champion', '');
    const hasGPName = title.includes(gpName);
    const hasWorldChampion = title.includes('world champion') || title.includes('championship winner');

    if (!hasGPName && !hasWorldChampion && !title.includes('monaco') && !title.includes('miami')) {
      return { valid: false, reason: `Event mismatch - expected ${expectedData.eventName}, product title: ${product.title}` };
    }
  }

  // Check 3: Car model should match (SF-24, MCL38, etc.)
  const livery = expectedData.liveryName.toLowerCase().replace('-', '');
  if (!title.includes(livery) && !title.includes(expectedData.liveryName.toLowerCase())) {
    // Some products might not have the exact livery name, so this is a warning not a failure
    console.log(`   ⚠️  Warning: Livery name "${expectedData.liveryName}" not found in title, but continuing...`);
  }

  return { valid: true };
}

// Check if a product URL is accessible (not a dead link)
async function checkProductUrl(url: string): Promise<{ accessible: boolean; statusCode?: number }> {
  try {
    const response = await axios.head(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
      maxRedirects: 5,
      validateStatus: (status) => status < 500, // Accept anything below 500 (including 404)
    });

    const accessible = response.status >= 200 && response.status < 400;
    return { accessible, statusCode: response.status };
  } catch (error: any) {
    // Network error or timeout
    return { accessible: false, statusCode: error.response?.status };
  }
}

// Get hotlinked image URL (no downloading - just validate it exists)
async function getHotlinkedImageUrl(imageUrl: string, sku: string): Promise<string | null> {
  try {
    console.log(`   🔗 Using hotlinked image: ${imageUrl}`);

    // Just verify the URL is accessible, but don't download
    const response = await axios.head(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 10000,
      maxRedirects: 5,
    });

    if (response.status >= 200 && response.status < 400) {
      console.log(`   ✅ Image URL verified (hotlinked)`);
      return imageUrl; // Return the original URL, don't download or copy
    } else {
      console.log(`   ⚠️  Image URL returned status ${response.status}`);
      return null;
    }

  } catch (error: any) {
    console.error(`   ❌ Image URL check failed:`, error.message);
    return null;
  }
}

// Mark product as unavailable at a specific retailer
async function markAsUnavailable(modelId: number, retailerId: number, reason: string) {
  const { data: existing } = await supabaseAdmin
    .from('price_history')
    .select('id')
    .eq('model_id', modelId)
    .eq('retailer_id', retailerId)
    .single();

  if (existing) {
    // Delete the price entry - product no longer available
    const { error } = await supabaseAdmin
      .from('price_history')
      .delete()
      .eq('id', existing.id);

    if (error) {
      console.error(`   ❌ Error removing price:`, error);
    } else {
      console.log(`   🚫 Marked as unavailable: ${reason}`);
    }
  }
}

// Save or update price in database (upsert logic)
async function savePrice(modelId: number, retailerId: number, price: string, available: boolean, productUrl: string, currency: string) {
  const priceNum = parseFloat(price);
  const priceAUD = await convertToAUD(priceNum, currency);

  // Check if price already exists for this model + retailer
  const { data: existing } = await supabaseAdmin
    .from('price_history')
    .select('id, price, currency')
    .eq('model_id', modelId)
    .eq('retailer_id', retailerId)
    .single();

  if (existing) {
    // Update existing price
    const { error } = await supabaseAdmin
      .from('price_history')
      .update({
        price: priceNum,
        currency: currency,
        price_aud: priceAUD,
        in_stock: available,
        recorded_at: new Date().toISOString(),
        product_url: productUrl,
      })
      .eq('id', existing.id);

    if (error) {
      console.error(`   ❌ Error updating price:`, error);
    } else {
      const priceChanged = existing.price !== priceNum;
      const displayPrice = currency === 'AUD' ? `AUD $${price}` : `${currency} $${price} (~AUD $${priceAUD})`;
      console.log(`   💰 Price ${priceChanged ? 'updated' : 'refreshed'}: ${displayPrice} ${priceChanged ? `(was ${existing.currency} $${existing.price})` : ''}`);
    }
  } else {
    // Insert new price
    const { error } = await supabaseAdmin
      .from('price_history')
      .insert({
        model_id: modelId,
        retailer_id: retailerId,
        price: priceNum,
        currency: currency,
        price_aud: priceAUD,
        in_stock: available,
        recorded_at: new Date().toISOString(),
        product_url: productUrl,
      });

    if (error) {
      console.error(`   ❌ Error saving price:`, error);
    } else {
      const displayPrice = currency === 'AUD' ? `AUD $${price}` : `${currency} $${price} (~AUD $${priceAUD})`;
      console.log(`   💰 Price saved: ${displayPrice} (New listing)`);
    }
  }
}

// Update model image URL
async function updateModelImage(modelId: number, imageUrl: string) {
  const { error } = await supabaseAdmin
    .from('models')
    .update({ image_url: imageUrl })
    .eq('id', modelId);

  if (error) {
    console.error(`   ❌ Error updating image:`, error);
  }
}

async function scrapeAutomatically() {
  console.log('🚀 Starting Automatic Scraper with Full Catalog\n');
  console.log('=' .repeat(60) + '\n');

  // 1. Get all retailers
  const { data: retailers, error: retailersError } = await supabaseAdmin
    .from('retailers')
    .select('id, name, url, currency');

  if (retailersError || !retailers) {
    console.error('❌ Error fetching retailers:', retailersError);
    return;
  }

  // 2. Get all models that are linked to cars (ignore orphaned discovered models)
  const { data: models, error: modelsError } = await supabaseAdmin
    .from('models')
    .select(`
      id,
      manufacturer_sku,
      scale,
      image_url,
      car_id,
      cars!inner(event_name, livery_name)
    `)
    .not('car_id', 'is', null) // Only models linked to cars

  if (modelsError || !models) {
    console.error('❌ Error fetching models:', modelsError);
    return;
  }

  console.log(`📋 Found ${models.length} total models across all cars to scrape\n`);

  // Extract all target SKUs for early exit optimization
  const targetSKUs = models.map(m => m.manufacturer_sku);

  // 3. For each retailer, fetch full catalog and scrape
  for (const retailer of retailers) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏪 Retailer: ${retailer.name}`);
    console.log(`🔗 Store URL: ${retailer.url}`);
    console.log(`${'='.repeat(60)}\n`);

    // Fetch product catalog with early exit when all SKUs found
    const products = await fetchAllShopifyProducts(retailer.url, targetSKUs);

    if (products.length === 0) {
      console.log(`⚠️  No products found for ${retailer.name}, skipping...\n`);
      continue;
    }

    // 4. For each model, search catalog by SKU
    for (const model of models) {
      console.log(`\n🔍 Searching for SKU: ${model.manufacturer_sku} (Scale: ${model.scale})`);

      const product = findProductBySKU(products, model.manufacturer_sku);

      if (!product) {
        console.log(`   ⚠️  Not found at ${retailer.name}`);
        // Mark as unavailable since product doesn't exist in catalog
        await markAsUnavailable(model.id, retailer.id, 'Product not in catalog');
        continue;
      }

      console.log(`   ✅ Found: ${product.title}`);

      // Validate the product matches expected criteria
      const validation = validateProduct(product, {
        scale: model.scale,
        eventName: (model as any).cars.event_name,
        liveryName: (model as any).cars.livery_name,
      });

      if (!validation.valid) {
        console.log(`   ❌ Validation failed: ${validation.reason}`);
        console.log(`   ⚠️  Skipping this product - likely a mismatch`);
        continue;
      }

      const variant = product.variants.find(v => v.sku === model.manufacturer_sku);
      if (!variant) continue;

      // Build product URL
      const productUrl = `${retailer.url}/products/${product.handle}`;
      console.log(`   🔗 URL: ${productUrl}`);

      // Check if product URL is accessible
      const urlCheck = await checkProductUrl(productUrl);
      if (!urlCheck.accessible) {
        console.log(`   ❌ Dead link detected (${urlCheck.statusCode || 'unreachable'})`);
        // Mark as unavailable since URL is dead
        await markAsUnavailable(model.id, retailer.id, `Dead link (${urlCheck.statusCode})`);
        continue;
      }

      // Get hotlinked image URL (if model doesn't have one yet)
      if (!model.image_url && product.images.length > 0) {
        const imageUrl = product.images[0].src;
        const hotlinkedUrl = await getHotlinkedImageUrl(imageUrl, model.manufacturer_sku);

        if (hotlinkedUrl) {
          await updateModelImage(model.id, hotlinkedUrl);
        }
      } else if (model.image_url) {
        console.log(`   ℹ️  Model already has image: ${model.image_url}`);
      } else {
        console.log(`   ⚠️  No images available for this product`);
      }

      // Save price
      await savePrice(model.id, retailer.id, variant.price, variant.available, productUrl, retailer.currency);

      // Respectful delay between models
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Scraping Complete!');
  console.log('='.repeat(60));
}

scrapeAutomatically();
