import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { title, snippet } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: 'Product title required' },
        { status: 400 }
      );
    }

    console.log('🤖 Parsing product:', title.substring(0, 60) + '...');

    const productText = `
Title: ${title}
${snippet ? `Description: ${snippet}` : ''}
    `.trim();

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are an expert at extracting F1 diecast model metadata from product listings.

Extract structured data from this product listing:

${productText}

Return ONLY valid JSON with these fields:

{
  "manufacturer": "string (REQUIRED - e.g., Minichamps, Spark, Bburago, Looksmart, TSM, BBR)",
  "scale": "string (REQUIRED - e.g., 1:43, 1:18, 1:12, 1:8)",
  "team": "string (e.g., McLaren, Red Bull Racing, Ferrari, Mercedes)",
  "driver": "string (e.g., Lando Norris, Max Verstappen, Lewis Hamilton)",
  "season_year": number (e.g., 2024, 2023),
  "chassis": "string (e.g., MCL38, RB20, SF-24, W15)",
  "event_name": "string (e.g., Miami GP Winner, Monaco GP Podium, British GP)",
  "sku": "string (manufacturer part number if found)",
  "price": number (numeric value in USD, extract from description if present),
  "driver_number": number (car number if mentioned, e.g., 4, 1, 44)
}

Important instructions:
- MANUFACTURER and SCALE are REQUIRED fields - always extract them!
- Look for manufacturer in the title or SKU prefix (M = Minichamps, S = Spark, 18S = Spark 1:18)
- Look for scale like "1:18", "1/18", "1-18" or in product title
- For team names, use full official names (e.g., "Red Bull Racing" not "RBR")
- For drivers, use full names (e.g., "Lando Norris" not "Norris")
- Extract price as a number without currency symbols
- Return ONLY the JSON object, no explanation`,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      // If JSON parsing fails, try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    console.log('✅ Parsed metadata:', JSON.stringify(parsed, null, 2));

    return NextResponse.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error('❌ Error parsing product:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to parse product',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
