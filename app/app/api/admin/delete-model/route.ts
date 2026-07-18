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

    // Delete the model from the database
    // This will cascade delete related records (price_history, ebay_links, etc.)
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
