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

    // Models cascade-delete with the car (migration 007), so warn about what
    // is going with it rather than silently destroying retailer links.
    const { count: modelCount } = await supabase
      .from('models')
      .select('*', { count: 'exact', head: true })
      .eq('car_id', carId);

    if (modelCount) {
      console.log(`⚠️ Cascade will also delete ${modelCount} model(s) attached to this car`);
    }

    // Delete the car itself (car_drivers no longer exists — the driver is a
    // column on cars, and models cascade via ON DELETE CASCADE)
    console.log('🗑️ Deleting car record...');
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

    return NextResponse.json({ success: true, deletedModels: modelCount || 0 });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
