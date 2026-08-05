import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isUuid } from '@/lib/carSlug';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Delete one car, or every car in a chassis group.
 *
 * The admin backend groups cars by chassis under a synthetic display id
 * ("2023-Mercedes-AMG Petronas Formula One Team-W14"). Sending that to this
 * route used to produce a raw Postgres 22P02 ("invalid input syntax for type
 * uuid") with no explanation of what to do instead — the caller has to send
 * the real UUIDs, which get-f1-data now exposes as `carIds`.
 */
export async function POST(request: Request) {
  try {
    const { carId, carIds } = await request.json();

    const requested: string[] = Array.isArray(carIds) && carIds.length
      ? carIds
      : carId
        ? [carId]
        : [];

    if (requested.length === 0) {
      return NextResponse.json({ error: 'Car ID is required' }, { status: 400 });
    }

    // Reject synthetic group keys with something actionable rather than
    // letting Postgres complain about UUID syntax.
    const invalid = requested.filter(id => !isUuid(id));
    if (invalid.length > 0) {
      console.error('❌ Not a car UUID:', invalid.join(', '));
      return NextResponse.json(
        {
          error: 'Not a valid car id',
          details:
            `"${invalid[0]}" is a chassis group key, not a car. A chassis group covers ` +
            `several cars (one per driver and event), so send their carIds instead.`,
        },
        { status: 400 }
      );
    }

    console.log(`🗑️ Deleting ${requested.length} car(s)`);

    // Models cascade-delete with the car (migration 007), so report what goes
    // with it rather than silently destroying retailer links.
    const { data: doomedModels } = await supabase
      .from('models')
      .select('id')
      .in('car_id', requested);

    const modelCount = doomedModels?.length || 0;

    let linkCount = 0;
    if (modelCount > 0) {
      const { count } = await supabase
        .from('price_history')
        .select('*', { count: 'exact', head: true })
        .in('model_id', doomedModels!.map(m => m.id));
      linkCount = count || 0;
      console.log(`⚠️ Cascade will also delete ${modelCount} model(s) and ${linkCount} retailer link(s)`);
    }

    const { error: deleteError } = await supabase
      .from('cars')
      .delete()
      .in('id', requested);

    if (deleteError) {
      console.error('❌ Error deleting car:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete car', details: deleteError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Deleted ${requested.length} car(s), ${modelCount} model(s)`);

    return NextResponse.json({
      success: true,
      deletedCars: requested.length,
      deletedModels: modelCount,
      deletedRetailerLinks: linkCount,
    });
  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
