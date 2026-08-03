import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { eventMatches } from '@/lib/eventName';
import { driverMatches, resolveDriver } from '@/lib/driverName';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);



export async function POST(request: NextRequest) {
  try {
    const { modelId, manufacturer, scale, sku, driver, eventName, price, imageUrl } = await request.json();

    if (!modelId) {
      return NextResponse.json(
        { error: 'Model ID required' },
        { status: 400 }
      );
    }

    console.log('🔄 Updating model:', modelId);

    // Driver and event live on the CAR now, so read them through the join
    // rather than off the model (migration 007 dropped both columns).
    const { data: currentModel, error: fetchError } = await supabase
      .from('models')
      .select(`
        *,
        manufacturer:manufacturers(id, name),
        car:cars(id, season_id, team_id, chassis_name, event_name, driver:drivers(id, name))
      `)
      .eq('id', modelId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Model lookup failed: ${fetchError.message}`);
    }

    if (!currentModel) {
      return NextResponse.json({ error: `Model ${modelId} not found` }, { status: 404 });
    }

    const car = currentModel.car as any;
    const carDriverName = car?.driver?.name as string | undefined;

    console.log(
      `📝 Current: ${(currentModel.manufacturer as any)?.name} ${currentModel.scale} ` +
      `${currentModel.manufacturer_sku} → ${car?.chassis_name} / ${car?.event_name} / ${carDriverName}`
    );

    // Handle manufacturer change
    let manufacturerId = currentModel.manufacturer_id;
    if (manufacturer && manufacturer !== (currentModel.manufacturer as any)?.name) {
      console.log('🏭 Updating manufacturer from', (currentModel.manufacturer as any)?.name, 'to', manufacturer);

      const { data: existingManufacturer } = await supabase
        .from('manufacturers')
        .select('id, name')
        .ilike('name', manufacturer)
        .maybeSingle();

      if (existingManufacturer) {
        manufacturerId = existingManufacturer.id;
        console.log('✅ Found existing manufacturer:', existingManufacturer.name);
      } else {
        const { data: newManufacturer, error: manufacturerError } = await supabase
          .from('manufacturers')
          .insert({ name: manufacturer })
          .select()
          .single();

        if (manufacturerError) {
          throw new Error(`Failed to create manufacturer: ${manufacturerError.message}`);
        }

        manufacturerId = newManufacturer.id;
        console.log('✅ Created new manufacturer:', manufacturer);
      }
    }

    // Driver and event belong to the CAR. Changing them here doesn't edit the
    // car — it means "this model belongs under a different car", so move it.
    // The destination is fully determined: season/team/chassis come from the
    // current car, driver/event from this edit. Nothing is guessed.
    let movedTo: any = null;
    let createdCar = false;

    const wantsDriverChange =
      !!driver && !!carDriverName && !driverMatches(driver, carDriverName);
    const wantsEventChange =
      !!eventName && !!car?.event_name && !eventMatches(car.event_name, eventName);

    if (wantsDriverChange || wantsEventChange) {
      const targetDriverName = driver || carDriverName!;
      const targetEventName = eventName || car.event_name;

      console.log(
        `🔀 Moving ${currentModel.manufacturer_sku}: ` +
        `"${car.event_name}" / ${carDriverName} → "${targetEventName}" / ${targetDriverName}`
      );

      // Resolve the destination driver. Accent- and whitespace-tolerant, so
      // moving a model to "Sergio Pérez" lands on the existing "Sergio Perez"
      // rather than minting a duplicate to hold it.
      const resolvedTarget = await resolveDriver(supabase, targetDriverName);
      if (!resolvedTarget) {
        throw new Error('Destination driver name is empty');
      }
      const targetDriverId = resolvedTarget.id;
      if (resolvedTarget.created) {
        console.log(`✅ Created driver ${resolvedTarget.name}`);
      }

      // Look for the destination car among this chassis's siblings
      const { data: siblings, error: sibErr } = await supabase
        .from('cars')
        .select('id, chassis_name, event_name, driver_id, driver:drivers(name)')
        .eq('season_id', car.season_id)
        .eq('team_id', car.team_id)
        .eq('chassis_name', car.chassis_name);

      if (sibErr) {
        throw new Error(`Destination lookup failed: ${sibErr.message}`);
      }

      let targetCar: any = (siblings || []).find(
        (c: any) => c.driver_id === targetDriverId && eventMatches(c.event_name, targetEventName)
      );

      if (!targetCar) {
        const { data: newCar, error: createCarErr } = await supabase
          .from('cars')
          .insert({
            season_id: car.season_id,
            team_id: car.team_id,
            chassis_name: car.chassis_name,
            driver_id: targetDriverId,
            event_name: targetEventName,
          })
          .select('id, chassis_name, event_name, driver:drivers(name)')
          .single();

        if (createCarErr) {
          return NextResponse.json(
            {
              error: 'Could not create the destination car',
              details: createCarErr.message,
              availableEvents: (siblings || []).map((c: any) => ({
                id: c.id,
                event_name: c.event_name,
                driver: (c.driver as any)?.name,
              })),
            },
            { status: 409 }
          );
        }

        targetCar = newCar;
        createdCar = true;
        console.log(`🏗️ Created destination car: ${car.chassis_name} / ${targetEventName} / ${targetDriverName}`);
      }

      const { error: moveErr } = await supabase
        .from('models')
        .update({ car_id: targetCar.id })
        .eq('id', modelId);

      if (moveErr) {
        throw new Error(`Failed to move model: ${moveErr.message}`);
      }

      movedTo = targetCar;
      console.log(`✅ Moved ${currentModel.manufacturer_sku} to car ${targetCar.id}`);

      // Report if the old car is now empty, so it can be tidied up
      const { count: leftBehind } = await supabase
        .from('models')
        .select('*', { count: 'exact', head: true })
        .eq('car_id', car.id);

      if (leftBehind === 0) {
        console.log(`⚠️ Source car ${car.id} now has no models`);
      }
    }

    // Check if SKU is being changed and if the new one is already taken.
    // Search by SKU alone — the DB constraint (models_manufacturer_sku_key) is
    // global, so scoping this to manufacturer_id would miss the collision and
    // surface a raw Postgres error instead of the merge prompt.
    const nextScale = scale || currentModel.scale;
    if (sku && sku !== currentModel.manufacturer_sku) {
      const { data: duplicateModel } = await supabase
        .from('models')
        .select(`
          id, manufacturer_sku, scale,
          manufacturer:manufacturers(name),
          car:cars(chassis_name, event_name, driver:drivers(name), season:seasons(year))
        `)
        .eq('manufacturer_sku', sku)
        .neq('id', modelId) // Exclude current model
        .maybeSingle();

      if (duplicateModel) {
        console.log('⚠️ Duplicate SKU found:', duplicateModel.id);
        return NextResponse.json(
          {
            // `duplicate: true` is the contract the UI should branch on.
            // It used to sniff the message for "duplicate key", which broke
            // the moment the wording changed.
            duplicate: true,
            error: `A model with SKU "${sku}" already exists`,
            duplicateModel: {
              id: duplicateModel.id,
              sku: duplicateModel.manufacturer_sku,
              manufacturer: (duplicateModel.manufacturer as any)?.name,
              scale: duplicateModel.scale,
              driver: ((duplicateModel.car as any)?.driver)?.name,
              eventName: (duplicateModel.car as any)?.event_name,
              chassis: (duplicateModel.car as any)?.chassis_name,
              year: ((duplicateModel.car as any)?.season)?.year,
            },
          },
          { status: 400 }
        );
      }
    }

    // Update the model. driver_id / event_name are deliberately absent —
    // those columns no longer exist on models.
    const { data: updatedModel, error: updateError } = await supabase
      .from('models')
      .update({
        manufacturer_id: manufacturerId,
        scale: nextScale,
        manufacturer_sku: sku !== undefined ? sku : currentModel.manufacturer_sku,
        price: price !== undefined ? price : currentModel.price,
        image_url: imageUrl !== undefined ? imageUrl : currentModel.image_url,
      })
      .eq('id', modelId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json(
          {
            error: 'Another model already uses this manufacturer + SKU + scale combination',
            details: updateError.message,
          },
          { status: 409 }
        );
      }
      throw new Error(`Failed to update model: ${updateError.message}`);
    }

    console.log('✅ Model updated successfully');
    if (imageUrl !== undefined) {
      console.log('🖼️ Image URL:', imageUrl || '(cleared)');
    }

    return NextResponse.json({
      success: true,
      model: updatedModel,
      moved: movedTo
        ? {
            carId: movedTo.id,
            chassis: movedTo.chassis_name,
            event: movedTo.event_name,
            driver: (movedTo.driver as any)?.name,
            createdCar,
          }
        : null,
      message: movedTo
        ? `Moved to ${movedTo.chassis_name} — ${movedTo.event_name}` +
          (createdCar ? ' (new car created)' : '')
        : 'Model updated',
    });
  } catch (error: any) {
    console.error('❌ Error updating model:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to update model',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
