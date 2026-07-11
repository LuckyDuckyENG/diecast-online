import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import * as cheerio from 'cheerio';

const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { searchQuery } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    if (!SCRAPINGBEE_API_KEY) {
      return NextResponse.json(
        { error: 'ScrapingBee API key not configured' },
        { status: 500 }
      );
    }

    console.log('🔍 Scraping eBay for:', searchQuery);

    // Build eBay search URL
    const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(searchQuery)}&_sop=12`;

    // Fetch HTML using ScrapingBee
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: SCRAPINGBEE_API_KEY,
        url: ebayUrl,
        stealth_proxy: 'true', // Required for eBay (75 credits)
      },
      timeout: 60000, // 60 second timeout (stealth proxy can be slow)
    });

    const html = response.data;
    console.log(`✅ Fetched eBay HTML: ${html.length} characters`);

    // Parse HTML using cheerio
    const $ = cheerio.load(html);
    const listings: Array<{
      title: string;
      price: string;
      url: string;
      image: string;
    }> = [];

    // Find all list items that contain item links
    $('li').each((i, elem) => {
      const $li = $(elem);
      const $link = $li.find('a[href*="/itm/"]').first();

      if ($link.length > 0) {
        const url = $link.attr('href');

        // Try multiple title selectors
        let title = $li.find('.s-item__title').text().trim();
        if (!title) title = $link.attr('title') || '';
        if (!title) title = $li.find('h3').text().trim();
        if (!title) title = $li.find('[role="heading"]').text().trim();

        // Clean up title - remove eBay UI text
        title = title
          .replace(/Opens in a new window or tab/gi, '')
          .replace(/derosnopS$/gi, '') // "Sponsored" reversed
          .replace(/Sponsored$/gi, '')
          .replace(/\s+/g, ' ') // Collapse multiple spaces
          .trim();

        // Try multiple price selectors
        let price = $li.find('.s-item__price').text().trim();
        if (!price) price = $li.find('span[class*="price"]').text().trim();
        if (!price) price = $li.find('span:contains("$")').first().text().trim();

        // Get image
        let image = $li.find('img').first().attr('src') || '';

        // Only add if we have a title and it's not a header
        if (title && title !== 'Shop on eBay' && title.length > 5 && url) {
          listings.push({ title, price, url, image });
        }
      }
    });

    console.log(`📦 Parsed ${listings.length} listings`);

    return NextResponse.json({
      success: true,
      listings,
      count: listings.length,
    });
  } catch (error: any) {
    console.error('❌ Error scraping eBay:', error.message);

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }

    return NextResponse.json(
      {
        error: 'Failed to scrape eBay',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
