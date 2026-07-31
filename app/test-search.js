// Test script to check SKU search directly
const fetch = require('node-fetch');

async function testSearch() {
  const sku = '537244404';

  console.log(`Testing search for SKU: ${sku}`);

  try {
    const response = await fetch('http://localhost:3000/api/admin/search-retailers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ searchQuery: sku }),
    });

    const data = await response.json();

    console.log('\nResponse:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSearch();
