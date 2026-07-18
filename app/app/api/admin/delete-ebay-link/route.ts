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

    console.log('❌ Deleting eBay link for model:', modelId);

    // Delete the eBay link from the database
    const { error: deleteError } = await supabase
      .from('ebay_links')
      .delete()
      .eq('model_id', modelId);

    if (deleteError) {
      console.error('❌ Error deleting eBay link:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete eBay link', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ eBay link deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
