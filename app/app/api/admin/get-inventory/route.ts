import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Admin data must never be served from a cache. Without this the browser
 * is free to reuse an earlier response, which is how a freshly added eBay
 * link kept showing as "Not linked" while the API was returning it.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('listing_inventory')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error getting inventory:', error);
      return NextResponse.json({ success: false, items: [] }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      items: data || [],
    });
  } catch (error: any) {
    console.error('Error in get-inventory:', error.message);
    return NextResponse.json({ success: false, items: [] }, { status: 500 });
  }
}
