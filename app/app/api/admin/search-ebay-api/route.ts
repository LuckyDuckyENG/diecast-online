import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { searchQuery } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    const EBAY_APP_ID = process.env.EBAY_APP_ID;

    if (!EBAY_APP_ID) {
      return NextResponse.json({ error: 'eBay API credentials not configured' }, { status: 500 });
    }

    console.log('🔍 Searching eBay API for:', searchQuery);

    // First, get an OAuth token
    const EBAY_CERT_ID = process.env.EBAY_CERT_ID;
    if (!EBAY_CERT_ID) {
      throw new Error('EBAY_CERT_ID not configured');
    }

    // Get OAuth token
    const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString('base64')}`,
      },
      body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text();
      console.error('❌ OAuth token error:', tokenError);
      throw new Error(`Failed to get OAuth token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    console.log('✅ Got OAuth token');

    // Use Browse API (newer, more reliable than Finding API)
    const ebayUrl = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
    ebayUrl.searchParams.set('q', searchQuery);
    ebayUrl.searchParams.set('limit', '100');

    const response = await fetch(ebayUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    });

    const responseText = await response.text();
    console.log('📄 eBay API response status:', response.status);
    console.log('📄 eBay API response (first 500 chars):', responseText.substring(0, 500));

    if (!response.ok) {
      throw new Error(`eBay API request failed: ${response.status} - ${responseText.substring(0, 200)}`);
    }

    const data = JSON.parse(responseText);

    // Parse eBay Browse API response
    const items = data.itemSummaries || [];

    const listings = items.map((item: any) => ({
      title: item.title || '',
      price: item.price?.value ? `$${item.price.value}` : '',
      url: item.itemWebUrl || '',
      image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
    }));

    console.log(`✅ Found ${listings.length} listings from eBay API`);

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length,
    });
  } catch (error: any) {
    console.error('❌ Error searching eBay API:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to search eBay API',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
