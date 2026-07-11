import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Starting F1 data import via API...');

    const { cars } = await request.json();

    if (!cars || !Array.isArray(cars)) {
      return NextResponse.json(
        { error: 'Invalid data: expected array of cars' },
        { status: 400 }
      );
    }

    console.log(`📊 Received ${cars.length} cars to import`);

    // Step 1: Insert F1 cars
    const carsToInsert = cars.map((car: any) => ({
      id: car.id,
      year: car.year,
      team: car.team,
      chassis: car.chassis,
      drivers: car.drivers,
    }));

    const { error: carsError } = await supabase
      .from('f1_cars')
      .upsert(carsToInsert, { onConflict: 'id' });

    if (carsError) {
      console.error('❌ Error inserting cars:', carsError);
      return NextResponse.json(
        { error: 'Failed to insert cars', details: carsError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Inserted ${carsToInsert.length} F1 cars`);

    // Step 2: Insert diecast models
    const allModels: any[] = [];

    cars.forEach((car: any) => {
      if (car.models && car.models.length > 0) {
        car.models.forEach((model: any) => {
          allModels.push({
            id: model.id,
            car_id: car.id,
            name: model.name,
            manufacturer: model.manufacturer,
            scale: model.scale,
            driver: model.driver,
            event_name: model.eventName,
            sku: model.sku || null,
          });
        });
      }
    });

    if (allModels.length > 0) {
      const { error: modelsError } = await supabase
        .from('diecast_models')
        .upsert(allModels, { onConflict: 'id' });

      if (modelsError) {
        console.error('❌ Error inserting models:', modelsError);
        return NextResponse.json(
          { error: 'Failed to insert models', details: modelsError.message },
          { status: 500 }
        );
      }

      console.log(`✅ Inserted ${allModels.length} diecast models`);
    }

    console.log('✨ Import complete!');

    return NextResponse.json({
      success: true,
      carsImported: carsToInsert.length,
      modelsImported: allModels.length,
    });

  } catch (error: any) {
    console.error('💥 Fatal error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error.message },
      { status: 500 }
    );
  }
}
