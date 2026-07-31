import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    console.log('🌐 Fetching URL:', url);

    // Fetch from server-side (bypasses CORS) with realistic browser headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.google.com/',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    console.log(`✅ Fetched ${html.length} characters`);

    return NextResponse.json({
      success: true,
      html: html,
    });
  } catch (error: any) {
    console.error('❌ Error fetching URL:', error.message);
    return NextResponse.json(
      { error: 'Failed to fetch URL', details: error.message },
      { status: 500 }
    );
  }
}
