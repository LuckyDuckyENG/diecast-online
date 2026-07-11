import { NextRequest, NextResponse } from 'next/server';
import { parseStringPromise } from 'xml2js';

export async function POST(request: NextRequest) {
  try {
    const { searchQuery } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    console.log('🔍 Fetching eBay RSS for:', searchQuery);

    // Build eBay RSS URL
    const ebayRssUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&_rss=1&_sop=12`;

    // Fetch RSS feed with browser-like headers
    const response = await fetch(ebayRssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.ebay.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`eBay RSS fetch failed: ${response.status}`);
    }

    const xmlText = await response.text();
    console.log(`✅ Fetched RSS: ${xmlText.length} characters`);

    // Parse XML to JSON
    const parsed = await parseStringPromise(xmlText);

    // Extract items from RSS
    const items = parsed?.rss?.channel?.[0]?.item || [];

    const listings = items.map((item: any) => ({
      title: item.title?.[0] || '',
      price: '', // RSS doesn't include price in a structured way, extract from description if needed
      url: item.link?.[0] || '',
      image: item['media:content']?.[0]?.['$']?.url || item.enclosure?.[0]?.['$']?.url || '',
    }));

    console.log(`📦 Parsed ${listings.length} listings from RSS`);

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length,
    });
  } catch (error: any) {
    console.error('❌ Error fetching eBay RSS:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to fetch eBay RSS',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
