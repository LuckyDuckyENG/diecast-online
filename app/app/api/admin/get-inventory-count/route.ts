import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET() {
  try {
    const { count, error } = await supabase
      .from('listing_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (error) {
      console.error('Error getting inventory count:', error);
      return NextResponse.json({ success: false, count: 0 });
    }

    return NextResponse.json({
      success: true,
      count: count || 0,
    });
  } catch (error: any) {
    console.error('Error in get-inventory-count:', error.message);
    return NextResponse.json({ success: false, count: 0 });
  }
}
