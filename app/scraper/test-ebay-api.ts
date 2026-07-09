import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

const EBAY_APP_ID = process.env.EBAY_APP_ID;

async function testEbayAPI() {
  console.log('🔍 Testing eBay Finding API...\n');

  if (!EBAY_APP_ID) {
    console.error('❌ EBAY_APP_ID not found in .env.local');
    return;
  }

  console.log('✅ eBay App ID found:', EBAY_APP_ID?.substring(0, 20) + '...\n');

  try {
    // Use Finding API - no OAuth required!
    // This works with just the App ID
    // Using SANDBOX endpoint for sandbox credentials
    const searchUrl = 'https://svcs.sandbox.ebay.com/services/search/FindingService/v1';

    const params = {
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': EBAY_APP_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'REST-PAYLOAD': '',
      'keywords': 'Spark F1 diecast 1:43 Mercedes Hamilton',
      'categoryId': '2621', // Diecast & Toy Vehicles
      'paginationInput.entriesPerPage': '10',
      'itemFilter(0).name': 'ListingType',
      'itemFilter(0).value': 'FixedPrice', // Buy It Now only (no auctions for now)
    };

    console.log('🔎 Searching eBay for:', params.keywords);
    console.log('📦 Category: Diecast & Toy Vehicles');
    console.log('🛒 Type: Buy It Now\n');

    const response = await axios.get(searchUrl, { params });

    const result = response.data.findItemsAdvancedResponse?.[0];
    const searchResult = result?.searchResult?.[0];
    const items = searchResult?.item || [];

    console.log('✅ Search successful!\n');
    console.log('📊 Results:');
    console.log(`   Total found: ${searchResult?.['@count'] || 0}`);
    console.log(`   Returned: ${items.length}\n`);

    if (items.length > 0) {
      console.log('🏎️  Sample listings:\n');

      items.slice(0, 5).forEach((item: any, index: number) => {
        console.log(`${index + 1}. ${item.title?.[0]}`);
        console.log(`   Price: $${item.sellingStatus?.[0]?.currentPrice?.[0].__value__} ${item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId']}`);
        console.log(`   Condition: ${item.condition?.[0]?.conditionDisplayName?.[0] || 'N/A'}`);
        console.log(`   URL: ${item.viewItemURL?.[0]}`);
        console.log('');
      });

      console.log('✅ eBay Finding API is working perfectly!');
      console.log('🎉 Ready to build the full integration!\n');
    } else {
      console.log('⚠️  No items found for this search');
      console.log('💡 Try a different search term or category\n');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);

    if (error.response?.status === 403) {
      console.log('\n💡 Tip: Your App ID might not be activated yet');
    }
  }
}

testEbayAPI();
