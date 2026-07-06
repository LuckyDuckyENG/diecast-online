import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function addBritishGP2024() {
  console.log('\n🏎️  Adding Lewis Hamilton British GP 2024 Winner\n');

  // Get Mercedes-AMG Petronas team
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('name', 'Mercedes-AMG Petronas')
    .single();

  if (!team) {
    console.error('❌ Mercedes-AMG Petronas team not found');
    return;
  }

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

  // Get or create Lewis Hamilton
  let { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('name', 'Lewis Hamilton')
    .single();

  if (!driver) {
    console.log('Creating driver: Lewis Hamilton...');
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ name: 'Lewis Hamilton', number: 44 })
      .select()
      .single();
    driver = newDriver;
  }

  console.log(`✅ Found driver: Lewis Hamilton (ID: ${driver.id})`);

  // Create car
  const { data: car, error: carError } = await supabase
    .from('cars')
    .insert({
      livery_name: 'W15',
      event_name: 'British GP Winner',
      team_id: team.id,
      season_id: season.id,
    })
    .select()
    .single();

  if (carError) {
    console.error('❌ Error creating car:', carError);
    return;
  }

  console.log(`✅ Created car: ${car.event_name} - ${car.livery_name} (ID: ${car.id})\n`);

  // Link car to driver
  const { error: linkError } = await supabase
    .from('car_drivers')
    .insert({
      car_id: car.id,
      driver_id: driver.id,
    });

  if (linkError) {
    console.error('❌ Error linking car to driver:', linkError);
    return;
  }

  console.log('✅ Linked car to driver\n');

  // Get manufacturer IDs
  const { data: spark } = await supabase.from('manufacturers').select('id').eq('name', 'Spark').single();
  const { data: minichamps } = await supabase.from('manufacturers').select('id').eq('name', 'Minichamps').single();

  // Define models
  const models = [];

  // 1:18 scale models
  if (spark) {
    models.push({
      car_id: car.id,
      manufacturer_id: spark.id,
      manufacturer_sku: '18S999',
      scale: '1:18',
      description: 'Mercedes W15 #44 Lewis Hamilton - Winner British GP 2024 with Flag (Resin)',
    });
  }

  if (minichamps) {
    models.push({
      car_id: car.id,
      manufacturer_id: minichamps.id,
      manufacturer_sku: '110241244',
      scale: '1:18',
      description: 'Mercedes W15 #44 Lewis Hamilton - Winner British GP 2024 with Flag (Diecast)',
    });
  }

  // 1:43 scale models
  if (spark) {
    models.push({
      car_id: car.id,
      manufacturer_id: spark.id,
      manufacturer_sku: 'S9533',
      scale: '1:43',
      description: 'Mercedes W15 #44 Lewis Hamilton - Winner British GP 2024 with Flag (Resin)',
    });
  }

  if (minichamps) {
    models.push({
      car_id: car.id,
      manufacturer_id: minichamps.id,
      manufacturer_sku: '410241244',
      scale: '1:43',
      description: 'Mercedes W15 #44 Lewis Hamilton - Winner British GP 2024 with Flag (Diecast)',
    });
  }

  console.log(`📦 Adding ${models.length} manufacturer variants:\n`);

  for (const model of models) {
    const { data, error } = await supabase
      .from('models')
      .insert(model)
      .select()
      .single();

    if (error) {
      console.error(`❌ Error adding model ${model.manufacturer_sku}:`, error);
    } else {
      console.log(`✅ Added: ${model.scale} ${model.manufacturer_sku}`);
    }
  }

  console.log(`\n✨ Done! Added British GP 2024 Winner with ${models.length} variants\n`);
}

addBritishGP2024();
