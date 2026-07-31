import { NextRequest, NextResponse } from 'next/server';
import Exa from 'exa-js';

// Built per request, not at module scope. `new Exa()` throws when the key is
// missing, and Next evaluates every route module while collecting page data —
// so a module-level client turned an unset optional env var into a hard build
// failure, with nothing deployed at all.
function getExa(): Exa | null {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;
  return new Exa(apiKey);
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return NextResponse.json(
        { error: 'Search query required' },
        { status: 400 }
      );
    }

    const exa = getExa();
    if (!exa) {
      return NextResponse.json(
        {
          error: 'Product discovery is not configured',
          details: 'EXA_API_KEY is not set in this environment.',
        },
        { status: 503 }
      );
    }

    console.log('🔍 Discovering products for query:', query);

    // Search with Exa
    // Use cached index (maxAgeHours: -1) for speed since we're doing discovery, not real-time stock checks
    const results = await exa.searchAndContents(query, {
      type: 'keyword', // Use keyword search for product queries
      numResults: 20,
      text: true, // Get text snippets
      highlights: true, // Get highlighted relevant portions
      summary: true, // Get AI-generated summary
    });

    console.log(`✅ Found ${results.results.length} products`);

    // Transform results into cleaner format
    const products = results.results.map((result: any) => ({
      title: result.title,
      url: result.url,
      snippet: result.text || result.summary || '',
      image: result.image || null,
      publishedDate: result.publishedDate || null,
      highlights: result.highlights || [],
      score: result.score || 0,
    }));

    return NextResponse.json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error: any) {
    console.error('❌ Error discovering products:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to discover products',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
