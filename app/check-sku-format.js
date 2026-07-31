// Check actual SKU format from a Shopify store
const https = require('https');

// Using a store we know works from the logs
const url = 'https://anthonysdiecasts.com.au/products.json?limit=50&page=1';

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
};

https.get(url, options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const json = JSON.parse(data);
    const products = json.products || [];

    console.log(`Found ${products.length} products\n`);

    // Show first 10 products with their SKUs
    products.slice(0, 10).forEach((product, i) => {
      console.log(`${i + 1}. ${product.title}`);
      product.variants?.forEach((variant, j) => {
        console.log(`   Variant ${j + 1}: SKU = "${variant.sku}" | Price = $${variant.price}`);
      });
      console.log('');
    });

    // Look for Minichamps products
    console.log('\n=== Minichamps products ===\n');
    products.forEach((product) => {
      if (product.title.toLowerCase().includes('minichamps')) {
        console.log(`Title: ${product.title}`);
        product.variants?.forEach((variant) => {
          if (variant.sku) {
            console.log(`  SKU: "${variant.sku}" | Price: $${variant.price}`);
          }
        });
        console.log('');
      }
    });

    // Look for products containing "537" in SKU or title
    console.log('\n=== Products with "537" in SKU or title ===\n');
    products.forEach((product) => {
      const hasSkuMatch = product.variants?.some(v => v.sku && v.sku.includes('537'));
      const hasTitleMatch = product.title.includes('537');

      if (hasSkuMatch || hasTitleMatch) {
        console.log(`Title: ${product.title}`);
        product.variants?.forEach((variant) => {
          if (variant.sku) {
            console.log(`  SKU: "${variant.sku}" | Price: $${variant.price}`);
          }
        });
        console.log('');
      }
    });
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
