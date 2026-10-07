/**
 * Script to import F1 cars data into Supabase
 * Run with: npx tsx scripts/import-f1-data.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface DiecastModel {
  id: string;
  name: string;
  manufacturer: string;
  scale: string;
  driver: string;
  eventName: string;
  sku?: string;
}

interface F1Car {
  id: string;
  year: number;
  team: string;
  chassis: string;
  drivers: string[];
  models: DiecastModel[];
}

async function importF1Data(cars: F1Car[]) {
  try {
    console.log('🚀 Starting F1 data import...');
    console.log(`📊 Total cars: ${cars.length}`);

    // Step 1: Insert F1 cars (without models)
    console.log('\n📦 Step 1: Inserting F1 cars...');

    const carsToInsert = cars.map(car => ({
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
      throw carsError;
    }

    console.log(`✅ Inserted ${carsToInsert.length} F1 cars`);

    // Step 2: Insert diecast models
    console.log('\n📦 Step 2: Inserting diecast models...');

    const allModels: any[] = [];

    cars.forEach(car => {
      car.models.forEach(model => {
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
    });

    if (allModels.length > 0) {
      const { error: modelsError } = await supabase
        .from('diecast_models')
        .upsert(allModels, { onConflict: 'id' });

      if (modelsError) {
        console.error('❌ Error inserting models:', modelsError);
        throw modelsError;
      }

      console.log(`✅ Inserted ${allModels.length} diecast models`);
    } else {
      console.log('⚠️  No models to insert');
    }

    console.log('\n✨ Import complete!');
    console.log(`📊 Summary:`);
    console.log(`   - F1 Cars: ${carsToInsert.length}`);
    console.log(`   - Diecast Models: ${allModels.length}`);

  } catch (error) {
    console.error('💥 Fatal error during import:', error);
    process.exit(1);
  }
}

// Export the function so we can call it from Next.js API route
export { importF1Data };

// If running directly with tsx
if (require.main === module) {
  console.log('⚠️  Run this from a Next.js API route or provide data as argument');
  console.log('Usage: Create an API route that calls importF1Data(carsArray)');
}
