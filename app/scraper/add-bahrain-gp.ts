import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function addBahrainGP2024() {
  console.log('\n🏎️  Adding Bahrain GP 2024 Models\n');

  // Get 2024 season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('year', 2024)
    .single();

  if (!season) {
    console.error('❌ 2024 season not found');
    return;
  }

  // Get all teams
  const { data: redBull } = await supabase.from('teams').select('id').eq('name', 'Red Bull Racing').single();
  const { data: ferrari } = await supabase.from('teams').select('id').eq('name', 'Ferrari').single();
  const { data: mercedes } = await supabase.from('teams').select('id').eq('name', 'Mercedes-AMG Petronas').single();
  const { data: mclaren } = await supabase.from('teams').select('id').eq('name', 'McLaren').single();
  const { data: alpine } = await supabase.from('teams').select('id').eq('name', 'Alpine').single();

  // Get all manufacturers
  const { data: spark } = await supabase.from('manufacturers').select('id').eq('name', 'Spark').single();
  const { data: minichamps } = await supabase.from('manufacturers').select('id').eq('name', 'Minichamps').single();
  const { data: looksmart } = await supabase.from('manufacturers').select('id').eq('name', 'Looksmart').single();

  // Define all Bahrain GP cars
  const carsData = [
    {
      driver: 'Max Verstappen',
      team: redBull,
      livery: 'RB20',
      event: 'Bahrain GP Winner',
      models: [
        { manufacturer: spark, sku_18: '18S982', sku_43: 'S9519', scale_18: '1:18', scale_43: '1:43' },
        { manufacturer: minichamps, sku_18: '110240101', sku_43: '410240101', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'Sergio Perez',
      team: redBull,
      livery: 'RB20',
      event: 'Bahrain GP',
      models: [
        { manufacturer: spark, sku_18: '18S983', sku_43: 'S9520', scale_18: '1:18', scale_43: '1:43' },
        { manufacturer: minichamps, sku_18: '110240111', sku_43: '410240111', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'Carlos Sainz',
      team: ferrari,
      livery: 'SF-24',
      event: 'Bahrain GP',
      models: [
        { manufacturer: looksmart, sku_18: 'LS18F1064', sku_43: 'LSF1064', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'Charles Leclerc',
      team: ferrari,
      livery: 'SF-24',
      event: 'Bahrain GP',
      models: [
        { manufacturer: looksmart, sku_18: 'LS18F1063', sku_43: 'LSF1063', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'George Russell',
      team: mercedes,
      livery: 'F1 W15',
      event: 'Bahrain GP',
      models: [
        { manufacturer: minichamps, sku_18: '110240163', sku_43: '410240163', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'Lewis Hamilton',
      team: mercedes,
      livery: 'F1 W15',
      event: 'Bahrain GP',
      models: [
        { manufacturer: minichamps, sku_18: '110240144', sku_43: '410240144', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
    {
      driver: 'Pierre Gasly',
      team: alpine,
      livery: 'A524',
      event: 'Bahrain GP',
      models: [
        { manufacturer: spark, sku_18: '18S980', sku_43: 'S9517', scale_18: '1:18', scale_43: '1:43' },
      ]
    },
  ];

  let totalModelsAdded = 0;

  for (const carData of carsData) {
    console.log(`\n📝 Processing ${carData.driver} - ${carData.team ? carData.team.id : 'Unknown Team'} ${carData.livery}...`);

    if (!carData.team) {
      console.error(`❌ Team not found for ${carData.driver}, skipping...`);
      continue;
    }

    // Get or create driver
    let { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('name', carData.driver)
      .single();

    if (!driver) {
      console.log(`Creating driver: ${carData.driver}...`);
      const { data: newDriver } = await supabase
        .from('drivers')
        .insert({ name: carData.driver })
        .select()
        .single();
      driver = newDriver;
    }

    // Create car
    const { data: car, error: carError } = await supabase
      .from('cars')
      .insert({
        livery_name: carData.livery,
        event_name: carData.event,
        team_id: carData.team.id,
        season_id: season.id,
      })
      .select()
      .single();

    if (carError) {
      console.error(`❌ Error creating car for ${carData.driver}:`, carError);
      continue;
    }

    console.log(`✅ Created car: ${car.event_name} - ${car.livery_name} (ID: ${car.id})`);

    // Link car to driver
    const { error: linkError } = await supabase
      .from('car_drivers')
      .insert({
        car_id: car.id,
        driver_id: driver!.id,
      });

    if (linkError) {
      console.error(`❌ Error linking car to driver:`, linkError);
    }

    // Add models
    for (const modelData of carData.models) {
      if (!modelData.manufacturer) {
        console.log(`⚠️  Manufacturer not found, skipping model...`);
        continue;
      }

      // Add 1:18 model
      if (modelData.sku_18) {
        const { error } = await supabase
          .from('models')
          .insert({
            car_id: car.id,
            manufacturer_id: modelData.manufacturer.id,
            manufacturer_sku: modelData.sku_18,
            scale: '1:18',
            description: `${carData.livery} ${carData.driver} - ${carData.event}`,
          });

        if (error) {
          console.error(`❌ Error adding 1:18 model:`, error);
        } else {
          console.log(`✅ Added 1:18 model: ${modelData.sku_18}`);
          totalModelsAdded++;
        }
      }

      // Add 1:43 model
      if (modelData.sku_43) {
        const { error } = await supabase
          .from('models')
          .insert({
            car_id: car.id,
            manufacturer_id: modelData.manufacturer.id,
            manufacturer_sku: modelData.sku_43,
            scale: '1:43',
            description: `${carData.livery} ${carData.driver} - ${carData.event}`,
          });

        if (error) {
          console.error(`❌ Error adding 1:43 model:`, error);
        } else {
          console.log(`✅ Added 1:43 model: ${modelData.sku_43}`);
          totalModelsAdded++;
        }
      }
    }
  }

  console.log(`\n✨ Done! Added Bahrain GP 2024 with ${totalModelsAdded} total models\n`);
}

addBahrainGP2024();
