import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { preJudge, toCandidate, type TargetModel } from '@/lib/ebayMatch';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use Claude Haiku 4.5 to intelligently score eBay listings
async function scoreResultsWithAI(
  listings: any[],
  modelInfo: {
    manufacturer: string;
    scale: string;
    team: string;
    driver: string;
    eventName: string;
    year: string;
    sku: string;
  }
): Promise<any[]> {
  const prompt = `You are an expert at matching diecast F1 model listings to product specifications.

TARGET MODEL:
- Manufacturer: ${modelInfo.manufacturer}
- Scale: ${modelInfo.scale}
- Team: ${modelInfo.team}
- Driver: ${modelInfo.driver}
- Event/Race: ${modelInfo.eventName}
- Year: ${modelInfo.year}
- SKU: ${modelInfo.sku}

EBAY LISTINGS TO EVALUATE:
${listings.map((l, i) => `${i + 1}. "${l.title}" - ${l.price}`).join('\n')}

For each listing, score it from 0-100 based on how well it matches the target model:
- 90-100: Perfect match (same manufacturer, scale, driver, race, year)
- 70-89: Good match (same manufacturer, scale, driver, year, but different race)
- 50-69: Partial match (same manufacturer, scale, team/driver, but wrong year or race)
- 20-49: Weak match (same manufacturer/scale but wrong driver/team/year)
- 0-19: No match (wrong scale, wrong manufacturer, or completely different product)

IMPORTANT RULES:
- Wrong scale (e.g., 1:18 vs 1:43) = automatic score < 20
- Wrong year by >2 years = score < 50
- Different race/event but same driver/year = score 70-85
- Non-F1 cars (GT, Le Mans, rally) = score < 20

Return ONLY a JSON array with this exact format:
[{"index": 1, "score": 95, "reason": "Perfect match"}, {"index": 2, "score": 15, "reason": "Wrong scale"}]`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

  // Extract JSON from response (handles markdown code blocks)
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('❌ Claude response not valid JSON:', responseText);
    return listings; // Return unscored if AI fails
  }

  const scores = JSON.parse(jsonMatch[0]);

  // Merge scores back into listings
  return listings.map((listing, i) => {
    const score = scores.find((s: any) => s.index === i + 1);
    return {
      ...listing,
      score: score?.score || 0,
      aiReason: score?.reason || 'No score',
    };
  });
}

// Legacy keyword-based scoring (fallback)
function scoreResult(title: string, searchQuery: string): number {
  const titleLower = title.toLowerCase();
  const queryLower = searchQuery.toLowerCase();

  let score = 0;

  // Extract key terms from search query
  const terms = queryLower.split(' ').filter(t => t.length > 2);

  // Check for exact phrase matches (high value)
  if (queryLower.includes('miami gp') && titleLower.includes('miami')) score += 50;
  if (queryLower.includes('bahrain gp') && titleLower.includes('bahrain')) score += 50;
  if (queryLower.includes('monaco gp') && titleLower.includes('monaco')) score += 50;
  if (queryLower.includes('winner') && titleLower.includes('winner')) score += 30;

  // Check for individual important terms
  for (const term of terms) {
    if (titleLower.includes(term)) {
      // Higher weight for manufacturer, scale, driver
      if (['minichamps', 'spark', 'bburago'].includes(term)) score += 20;
      else if (['1:43', '1:18', '1/43', '1/18'].includes(term)) score += 20;
      else if (term.length > 4) score += 10; // Driver names, teams, etc.
      else score += 5;
    }
  }

  // Penalize listings with wrong years (if year is in query)
  const queryYear = queryLower.match(/20\d{2}/)?.[0];
  const titleYear = titleLower.match(/20\d{2}|19\d{2}/)?.[0]; // Match 1900s and 2000s
  if (queryYear && titleYear && queryYear !== titleYear) score -= 60; // Increased penalty

  // Penalize listings with wrong scale
  if (queryLower.includes('1:43') && !titleLower.includes('1:43') && !titleLower.includes('1/43')) score -= 40;
  if (queryLower.includes('1:18') && !titleLower.includes('1:18') && !titleLower.includes('1/18')) score -= 40;

  return score;
}

export async function POST(request: NextRequest) {
  try {
    const { searchQuery, modelInfo, marketplaces } = await request.json();

    if (!searchQuery) {
      return NextResponse.json({ error: 'Search query required' }, { status: 400 });
    }

    if (!modelInfo) {
      return NextResponse.json({ error: 'Model info required for AI filtering' }, { status: 400 });
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

    // Search AU first, fall back to US.
    //
    // eBay AU carries a fraction of the inventory: a real query returned 9
    // results there against 216 in the US. But an AU listing is priced in AUD
    // with domestic shipping, which for an Australian buyer is a different
    // proposition to a US auction plus freight and possible GST — so prefer
    // local when it exists, and label which market each result came from.
    async function searchMarket(marketplace: string) {
      const url = new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');
      url.searchParams.set('q', searchQuery);
      url.searchParams.set('limit', '50');

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-EBAY-C-MARKETPLACE-ID': marketplace,
        },
      });

      if (!res.ok) {
        console.warn(`⚠️ ${marketplace} search failed: ${res.status}`);
        return [];
      }

      const body = await res.json();
      return (body.itemSummaries || []).map((i: any) => toCandidate(i, marketplace));
    }

    const preferred = marketplaces?.length ? marketplaces : ['EBAY_AU', 'EBAY_US'];
    let candidates: any[] = [];
    let usedMarket = preferred[0];

    for (const market of preferred) {
      candidates = await searchMarket(market);
      usedMarket = market;
      console.log(`🌏 ${market}: ${candidates.length} results`);
      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      // Genuinely nothing on eBay. Worth recording rather than re-searching
      // this model every week -- "not available anywhere" is real information.
      console.log('🔍 No results in any marketplace');
      return NextResponse.json({
        success: true,
        marketplace: usedMarket,
        autoLink: null,
        listings: [],
        count: 0,
        noResults: true,
      });
    }

    // Settle what can be settled without a model call.
    const target: TargetModel = {
      sku: modelInfo.sku || null,
      scale: modelInfo.scale || null,
      manufacturer: modelInfo.manufacturer || null,
      driver: modelInfo.driver || null,
      event: modelInfo.eventName || null,
      chassis: modelInfo.chassis || null,
      year: modelInfo.year ? parseInt(String(modelInfo.year), 10) : null,
    };

    const judged = candidates.map(c => ({ ...c, pre: preJudge(c.title, target) }));

    const skuMatches = judged.filter(c => c.pre.tier === 'sku-match');
    const rejected = judged.filter(c => c.pre.tier === 'rejected');
    const ambiguous = judged.filter(c => c.pre.tier === 'needs-judgement');

    console.log(
      `⚖️ ${skuMatches.length} SKU match, ${rejected.length} rejected outright, ` +
      `${ambiguous.length} need judgement`
    );

    // The seller printed the SKU — that settles it, cheaper and more reliably
    // than asking a model. Take the cheapest such listing.
    if (skuMatches.length > 0) {
      const best = skuMatches
        .slice()
        .sort((a, b) => (a.priceAud ?? Infinity) - (b.priceAud ?? Infinity))[0];

      console.log(`🎯 Auto-link candidate: ${best.title.slice(0, 70)}`);

      return NextResponse.json({
        success: true,
        marketplace: usedMarket,
        autoLink: { ...best, reason: best.pre.reason },
        listings: skuMatches,
        count: skuMatches.length,
        rejectedCount: rejected.length,
      });
    }

    // Nothing decisive — spend the AI call on the genuine judgement calls only
    if (ambiguous.length === 0) {
      return NextResponse.json({
        success: true,
        marketplace: usedMarket,
        autoLink: null,
        listings: [],
        count: 0,
        rejectedCount: rejected.length,
        allRejected: true,
      });
    }

    console.log(`🤖 Scoring ${ambiguous.length} listings with Claude...`);
    const scored = await scoreResultsWithAI(
      ambiguous.map(c => ({ title: c.title, price: c.price ? `$${c.price}` : '', url: c.url, image: c.imageUrl })),
      modelInfo
    );

    const merged = ambiguous
      .map((c, i) => ({ ...c, score: scored[i]?.score ?? 0, aiReason: scored[i]?.aiReason ?? '' }))
      .sort((a, b) => b.score - a.score)
      .filter(l => l.score >= 50);

    console.log(`🔍 ${merged.length} listings scored >= 50`);

    return NextResponse.json({
      success: true,
      marketplace: usedMarket,
      autoLink: null,
      listings: merged,
      count: merged.length,
      rejectedCount: rejected.length,
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
