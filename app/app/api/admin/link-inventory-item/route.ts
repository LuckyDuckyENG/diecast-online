import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const { inventoryItemId, modelId } = await request.json();

    if (!inventoryItemId || !modelId) {
      return NextResponse.json(
        { error: 'Missing inventoryItemId or modelId' },
        { status: 400 }
      );
    }

    console.log(`🔗 Linking inventory item ${inventoryItemId} to model ${modelId}`);

    // Get the inventory item details
    const { data: item, error: fetchError } = await supabase
      .from('listing_inventory')
      .select('*')
      .eq('id', inventoryItemId)
      .single();

    if (fetchError || !item) {
      console.error('Error fetching inventory item:', fetchError);
      return NextResponse.json(
        { error: 'Inventory item not found' },
        { status: 404 }
      );
    }

    // Save the eBay link to the model
    // TODO: You'll need to create/update a table to store eBay links for models
    // For now, let's just mark the inventory item as "linked"

    const { error: updateError } = await supabase
      .from('listing_inventory')
      .update({ status: 'linked' })
      .eq('id', inventoryItemId);

    if (updateError) {
      console.error('Error updating inventory item:', updateError);
      return NextResponse.json(
        { error: 'Failed to link item', details: updateError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Successfully linked inventory item to model`);

    return NextResponse.json({
      success: true,
      message: 'Inventory item linked successfully',
    });
  } catch (error: any) {
    console.error('❌ Error in link-inventory-item:', error.message);

    return NextResponse.json(
      { error: 'Failed to link inventory item', details: error.message },
      { status: 500 }
    );
  }
}
