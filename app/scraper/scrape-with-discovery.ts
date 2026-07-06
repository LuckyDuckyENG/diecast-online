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
  vendor: string;
  product_type: string;
  tags: string[];
  images: Array<{ src: string }>;
  variants: Array<{
    id: number;
    title: string;
    price: string;
    sku: string;
    available: boolean;
  }>;
}

// Check if product is an F1 model car (not helmet, apparel, etc.)
function isF1ModelCar(product: ShopifyProduct): boolean {
  const title = product.title.toLowerCase();
  const productType = (product.product_type || '').toLowerCase();
  const tags = product.tags?.map(t => t.toLowerCase()) || [];

  // Must contain F1/Formula indicators
  const hasF1Keywords =
    title.includes('f1') ||
    title.includes('formula 1') ||
    title.includes('formula one') ||
    title.includes('grand prix') ||
    title.includes('gp');

  // Must contain scale indicator (model cars have scales)
  const hasScale =
    title.includes('1:18') ||
    title.includes('1:43') ||
    title.includes('1/18') ||
    title.includes('1/43') ||
    title.includes('1:8') ||
    title.includes('1/8');

  // Exclude non-car items
  const isExcluded =
    title.includes('helmet') ||
    title.includes('cap') ||
    title.includes('shirt') ||
    title.includes('jacket') ||
    title.includes('keyring') ||
    title.includes('poster') ||
    title.includes('book') ||
    productType.includes('apparel') ||
    productType.includes('clothing');

  return hasF1Keywords && hasScale && !isExcluded;
}

// Extract scale from product title
function extractScale(title: string): string | null {
  const scaleMatch = title.match(/1[:\/](8|18|43|64)/i);
  if (scaleMatch) {
    return `1:${scaleMatch[1]}`;
  }
  return null;
}

// Fetch products from Shopify store
async function fetchShopifyProducts(storeUrl: string, limit: number = 250): Promise<ShopifyProduct[]> {
  const allProducts: ShopifyProduct[] = [];
  let page = 1;
  const maxPages = 10; // Limit to prevent timeout

  while (page <= maxPages) {
    try {
      const url = `${storeUrl}/products.json?limit=${limit}&page=${page}`;
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 30000,
      });

      const products: ShopifyProduct[] = response.data.products || [];
      if (products.length === 0) break;

      allProducts.push(...products);
      page++;

      await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
    } catch (error: any) {
      console.error(`   ❌ Error fetching page ${page}:`, error.message);
      break;
    }
  }

  return allProducts;
}

// Find or create model in database
async function findOrCreateModel(sku: string, product: ShopifyProduct, retailerName: string) {
  // Check if model already exists
  const { data: existing } = await supabaseAdmin
    .from('models')
    .select('id, manufacturer_sku, car_id')
    .eq('manufacturer_sku', sku)
    .single();

  if (existing) {
    return existing;
  }

  // Model doesn't exist - auto-create it!
  const scale = extractScale(product.title);

  console.log(`   🆕 NEW MODEL DISCOVERED: ${sku}`);
  console.log(`      Title: ${product.title}`);
  console.log(`      Vendor: ${product.vendor}`);
  console.log(`      Scale: ${scale || 'Unknown'}`);
  console.log(`      Discovered at: ${retailerName}`);

  // Create a placeholder model (will be cleaned up by AI normalizer later)
  const { data: newModel, error } = await supabaseAdmin
    .from('models')
    .insert({
      manufacturer_sku: sku,
      scale: scale || '1:43', // Default scale
      description: product.title,
      needs_review: true, // Flag for AI processing
      discovered_from: retailerName,
      car_id: null, // Will be linked later by AI normalizer
    })
    .select()
    .single();

  if (error) {
    console.error(`   ❌ Error creating model:`, error);
    return null;
  }

  console.log(`   ✅ Created model ID: ${newModel.id}`);
  return newModel;
}

// Main discovery scraper
async function discoverAndScrape() {
  console.log('🔍 Starting Discovery Scraper\n');
  console.log('=' .repeat(60) + '\n');

  // Get all retailers
  const { data: retailers } = await supabaseAdmin
    .from('retailers')
    .select('id, name, url, currency');

  if (!retailers) {
    console.error('❌ No retailers found');
    return;
  }

  let totalDiscovered = 0;
  let totalProcessed = 0;

  // For each retailer
  for (const retailer of retailers.slice(0, 3)) { // TEST: Only first 3 retailers
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🏪 ${retailer.name}`);
    console.log(`${'='.repeat(60)}\n`);

    // Fetch products
    console.log('📦 Fetching products...');
    const products = await fetchShopifyProducts(retailer.url);
    console.log(`✅ Found ${products.length} total products\n`);

    // Filter for F1 model cars
    const f1Models = products.filter(isF1ModelCar);
    console.log(`🏎️  Filtered to ${f1Models.length} F1 model cars\n`);

    // Process each F1 model
    for (const product of f1Models) {
      totalProcessed++;

      // Get first variant with SKU
      const variant = product.variants.find(v => v.sku);
      if (!variant || !variant.sku) {
        console.log(`⚠️  Skipping: ${product.title} (no SKU)`);
        continue;
      }

      const sku = variant.sku;
      console.log(`\n📦 Processing: ${product.title.substring(0, 80)}...`);
      console.log(`   SKU: ${sku}`);

      // Find or create model
      const model = await findOrCreateModel(sku, product, retailer.name);

      if (model && !model.car_id) {
        totalDiscovered++;
      }

      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Discovery Complete!');
  console.log('='.repeat(60));
  console.log(`📊 Processed: ${totalProcessed} F1 models`);
  console.log(`🆕 Discovered: ${totalDiscovered} new models`);
  console.log('\n💡 Next step: Run AI normalizer to clean up discovered models');
}

discoverAndScrape();
