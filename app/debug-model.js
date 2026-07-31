require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugModel() {
  // The Bburago McLaren Lando Norris model ID
  const modelId = '4c0e4ce0-0e35-4677-9fe1-47e1c92c0b7f';

  console.log('🔍 Fetching model:', modelId);
  console.log('');

  // Fetch the model
  const { data: model, error: modelError } = await supabase
    .from('models')
    .select('*, manufacturer:manufacturers(name), car:cars(*, team:teams(name), season:seasons(year))')
    .eq('id', modelId)
    .single();

  if (modelError) {
    console.error('❌ Error fetching model:', modelError);
    return;
  }

  console.log('📦 MODEL DATA:');
  console.log('  ID:', model.id);
  console.log('  Manufacturer:', model.manufacturer?.name);
  console.log('  Scale:', model.scale);
  console.log('  SKU:', model.manufacturer_sku);
  console.log('  Car ID:', model.car_id);
  console.log('  Team:', model.car?.team?.name);
  console.log('  Year:', model.car?.season?.year);
  console.log('');

  // Fetch eBay link
  const { data: ebayLink, error: ebayError } = await supabase
    .from('ebay_links')
    .select('*')
    .eq('model_id', modelId)
    .single();

  console.log('🔗 EBAY LINK DATA:');
  if (ebayError) {
    console.log('  ❌ Error:', ebayError.message);
  } else if (!ebayLink) {
    console.log('  ⚠️ No eBay link found');
  } else {
    console.log('  ✅ eBay link exists!');
    console.log('  URL:', ebayLink.ebay_url);
    console.log('  Price (raw):', ebayLink.ebay_price);
    console.log('  Title:', ebayLink.ebay_title);
    console.log('  Image:', ebayLink.ebay_image);
    console.log('  Last Updated:', ebayLink.last_updated);

    // Try parsing the price
    if (ebayLink.ebay_price) {
      const cleanPrice = ebayLink.ebay_price.replace(/[^0-9.]/g, '');
      const parsedPrice = parseFloat(cleanPrice);
      console.log('  Price (parsed):', parsedPrice);
    }
  }
  console.log('');

  // Fetch retailer prices
  const { data: priceHistory, error: priceError } = await supabase
    .from('price_history')
    .select('*, retailer:retailers(name)')
    .eq('model_id', modelId);

  console.log('💰 RETAILER PRICES:');
  if (priceError) {
    console.log('  ❌ Error:', priceError.message);
  } else if (!priceHistory || priceHistory.length === 0) {
    console.log('  ⚠️ No retailer prices found');
  } else {
    console.log(`  Found ${priceHistory.length} price entries:`);
    priceHistory.forEach((price, i) => {
      console.log(`  ${i + 1}. ${price.retailer?.name || 'Unknown'}`);
      console.log(`     Price: ${price.price} ${price.currency}`);
      console.log(`     URL: ${price.product_url}`);
      console.log(`     In Stock: ${price.in_stock}`);
    });
  }
  console.log('');

  // Show what the retailers array SHOULD look like on frontend
  console.log('🎯 WHAT FRONTEND SHOULD SEE:');
  const retailers = [];

  if (priceHistory) {
    priceHistory.forEach(item => {
      retailers.push({
        name: item.retailer?.name || 'Unknown',
        price: parseFloat(item.price) || 0,
        currency: 'AUD',
        availability: 'In Stock',
        url: item.product_url || '#',
      });
    });
  }

  if (ebayLink) {
    const ebayPrice = parseFloat(ebayLink.ebay_price?.replace(/[^0-9.]/g, '') || '0');
    if (ebayPrice > 0) {
      retailers.push({
        name: 'eBay',
        price: ebayPrice,
        currency: 'AUD',
        availability: 'In Stock',
        url: ebayLink.ebay_url,
      });
    }
  }

  console.log('  Total retailers:', retailers.length);
  retailers.forEach((retailer, i) => {
    console.log(`  ${i + 1}. ${retailer.name} - $${retailer.price} - ${retailer.url}`);
  });
}

debugModel();
