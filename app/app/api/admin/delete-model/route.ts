import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { modelId } = await request.json();

    if (!modelId) {
      return NextResponse.json({ error: 'Model ID is required' }, { status: 400 });
    }

    console.log('🗑️ Deleting model:', modelId);

    // First, delete related records that might block the delete
    console.log('🗑️ Deleting price history...');
    await supabase
      .from('price_history')
      .delete()
      .eq('model_id', modelId);

    console.log('🗑️ Deleting eBay links...');
    await supabase
      .from('ebay_links')
      .delete()
      .eq('model_id', modelId);

    // Now delete the model itself
    console.log('🗑️ Deleting model record...');
    const { error: deleteError } = await supabase
      .from('models')
      .delete()
      .eq('id', modelId);

    if (deleteError) {
      console.error('❌ Error deleting model:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete model', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ Model deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
