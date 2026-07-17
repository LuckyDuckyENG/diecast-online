import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const {
      title,
      price,
      url,
      imageUrl,
      sourceType,
      sourceName,
      retailerId,
      aiScore,
      aiReason,
      searchedModelId,
      searchQuery,
    } = await request.json();

    // Validate required fields
    if (!title || !url || !sourceType || aiScore === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: title, url, sourceType, aiScore' },
        { status: 400 }
      );
    }

    console.log(`📦 Adding to inventory: "${title}" (score: ${aiScore})`);
    console.log(`📦 Data being inserted:`, {
      title,
      price,
      url,
      image_url: imageUrl,
      source_type: sourceType,
      source_name: sourceName,
      retailer_id: retailerId || null,
      ai_score: aiScore,
      ai_reason: aiReason,
      searched_model_id: searchedModelId || null,
      search_query: searchQuery || null,
      status: 'pending',
    });

    // Insert into inventory
    const { data, error } = await supabase
      .from('listing_inventory')
      .insert({
        title,
        price,
        url,
        image_url: imageUrl,
        source_type: sourceType,
        source_name: sourceName,
        retailer_id: retailerId || null,
        ai_score: aiScore,
        ai_reason: aiReason,
        searched_model_id: searchedModelId || null,
        search_query: searchQuery || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error adding to inventory:', error);
      console.error('❌ Error code:', error.code);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error details:', error.details);
      console.error('❌ Error hint:', error.hint);
      return NextResponse.json(
        { error: 'Failed to add to inventory', details: error.message || error.details || JSON.stringify(error) },
        { status: 500 }
      );
    }

    console.log(`✅ Added to inventory (ID: ${data.id})`);

    return NextResponse.json({
      success: true,
      item: data,
    });
  } catch (error: any) {
    console.error('❌ Error in add-to-inventory:', error.message);

    return NextResponse.json(
      { error: 'Failed to add to inventory', details: error.message },
      { status: 500 }
    );
  }
}
