import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addBarcelonaGP() {
  console.log('Adding 2024 Barcelona GP Winner - Max Verstappen - Red Bull RB20\n');

  // 1. Get or create Red Bull Racing team
  let { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('name', 'Red Bull Racing')
    .single();

  if (!team) {
    const { data: newTeam } = await supabase
      .from('teams')
      .insert({ name: 'Red Bull Racing' })
      .select()
      .single();
    team = newTeam;
  }

  console.log(`✅ Team: Red Bull Racing (ID: ${team.id})`);

  // 2. Get or create 2024 season
  let { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', 2024)
    .single();

  if (!season) {
    const { data: newSeason } = await supabase
      .from('seasons')
      .insert({ year: 2024, name: '2024 F1 Season' })
      .select()
      .single();
    season = newSeason;
  }

  console.log(`✅ Season: 2024 (ID: ${season.id})`);

  // 3. Get or create Max Verstappen driver
  let { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('name', 'Max Verstappen')
    .single();

  if (!driver) {
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ name: 'Max Verstappen', nationality: 'Dutch' })
      .select()
      .single();
    driver = newDriver;
  }

  console.log(`✅ Driver: Max Verstappen (ID: ${driver.id})`);

  // 4. Create the car
  const { data: car, error: carError } = await supabase
    .from('cars')
    .insert({
      livery_name: 'RB20',
      event_name: 'Barcelona GP Winner',
      team_id: team.id,
      season_id: season.id,
    })
    .select()
    .single();

  if (carError) {
    console.error('❌ Error creating car:', carError);
    return;
  }

  console.log(`✅ Created car: Barcelona GP Winner - RB20 (ID: ${car.id})\n`);

  // 5. Link car to driver
  const { error: linkError } = await supabase
    .from('car_drivers')
    .insert({
      car_id: car.id,
      driver_id: driver.id,
    });

  if (linkError) {
    console.error('❌ Error linking driver:', linkError);
    return;
  }

  console.log(`✅ Linked Max Verstappen to Barcelona GP Winner car`);
  console.log(`\n🎉 Done! Barcelona GP 2024 added to your database`);
  console.log(`📋 Car ID: ${car.id}`);
}

addBarcelonaGP();
