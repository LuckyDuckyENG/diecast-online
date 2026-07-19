import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { carId } = await request.json();

    if (!carId) {
      return NextResponse.json({ error: 'Car ID is required' }, { status: 400 });
    }

    console.log('🗑️ Deleting car:', carId);

    // Delete the car - this will cascade delete all related models, car_drivers, etc.
    const { error: deleteError } = await supabase
      .from('cars')
      .delete()
      .eq('id', carId);

    if (deleteError) {
      console.error('❌ Error deleting car:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete car', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log('✅ Car deleted successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
