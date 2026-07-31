import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { fromModelId, toModelId } = await request.json();

    if (!fromModelId || !toModelId) {
      return NextResponse.json(
        { error: 'Both fromModelId and toModelId required' },
        { status: 400 }
      );
    }

    console.log('🔄 Transferring retailer links from', fromModelId, 'to', toModelId);

    // Get all price_history entries for the source model
    const { data: priceEntries, error: fetchError } = await supabase
      .from('price_history')
      .select('*')
      .eq('model_id', fromModelId);

    if (fetchError) {
      throw new Error(`Failed to fetch price entries: ${fetchError.message}`);
    }

    console.log(`📊 Found ${priceEntries?.length || 0} price entries to transfer`);

    let transferred = 0;

    // Transfer each price entry to the new model
    for (const entry of priceEntries || []) {
      // Check if target model already has a link for this retailer
      const { data: existingEntry } = await supabase
        .from('price_history')
        .select('id')
        .eq('model_id', toModelId)
        .eq('retailer_id', entry.retailer_id)
        .single();

      if (existingEntry) {
        console.log(`⚠️ Target model already has retailer ${entry.retailer_id}, skipping...`);
        // Delete the duplicate from source model
        await supabase
          .from('price_history')
          .delete()
          .eq('id', entry.id);
      } else {
        // Update the model_id to transfer the link
        const { error: updateError } = await supabase
          .from('price_history')
          .update({ model_id: toModelId })
          .eq('id', entry.id);

        if (updateError) {
          console.error('❌ Failed to transfer entry:', updateError.message);
        } else {
          transferred++;
          console.log(`✅ Transferred price entry ${entry.id}`);
        }
      }
    }

    console.log(`✅ Successfully transferred ${transferred} retailer link(s)`);

    return NextResponse.json({
      success: true,
      transferred,
    });
  } catch (error: any) {
    console.error('❌ Error transferring retailer links:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to transfer retailer links',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
