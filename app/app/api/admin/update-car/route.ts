import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { resolveDriver } from '@/lib/driverName';

export async function POST(request: Request) {
  try {
    const { carId, liveryName, chassisName, drivers, driver, eventName } = await request.json();

    if (!carId) {
      return NextResponse.json({ success: false, message: 'Car ID is required' }, { status: 400 });
    }

    // Under Pattern 2 a car has exactly ONE driver (it's part of the composite
    // key). Accept the legacy `drivers` array but only ever apply one.
    const driverList: string[] = Array.isArray(drivers)
      ? drivers.filter(Boolean)
      : driver
        ? [driver]
        : [];

    if (driverList.length > 1) {
      return NextResponse.json(
        {
          success: false,
          message:
            `A car has one driver. You passed ${driverList.length} (${driverList.join(', ')}). ` +
            `Create a separate car per driver instead — that's what keeps events from merging.`,
        },
        { status: 400 }
      );
    }

    const updates: Record<string, any> = {};

    // `chassisName` is the current name; `liveryName` is kept for older callers
    const newChassis = chassisName ?? liveryName;
    if (newChassis) {
      updates.chassis_name = newChassis;
    }

    if (eventName !== undefined) {
      updates.event_name = eventName;
    }

    // Resolve the driver to an id (create only if genuinely new).
    // Matching folds accents and trims, so "Sergio Pérez" resolves to the
    // existing "Sergio Perez" rather than creating a rival row.
    if (driverList.length === 1) {
      try {
        const resolved = await resolveDriver(supabase, driverList[0]);
        if (!resolved) {
          return NextResponse.json(
            { success: false, message: 'Driver name is empty' },
            { status: 400 }
          );
        }
        updates.driver_id = resolved.id;
        if (resolved.created) console.log(`✅ Created driver ${resolved.name}`);
      } catch (err: any) {
        return NextResponse.json({ success: false, message: err.message }, { status: 500 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, message: 'Nothing to update' });
    }

    const { error: updateError } = await supabase
      .from('cars')
      .update(updates)
      .eq('id', carId);

    if (updateError) {
      console.error('Error updating car:', updateError);

      // The composite key is UNIQUE — a collision means this edit would have
      // produced a duplicate of a car that already exists.
      if (updateError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Another car already has this season + team + chassis + driver + event combination. ' +
              'Edit or merge that car instead of duplicating it.',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { success: false, message: 'Failed to update car: ' + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Car updated successfully',
    });
  } catch (error) {
    console.error('Error in update-car API:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error'
    }, { status: 500 });
  }
}
