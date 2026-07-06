import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addSingaporeGP() {
  console.log('Adding 2024 Singapore GP Winner - Lando Norris - McLaren MCL38\n');

  let { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('name', 'McLaren')
    .single();

  if (!team) {
    const { data: newTeam } = await supabase
      .from('teams')
      .insert({ name: 'McLaren' })
      .select()
      .single();
    team = newTeam;
  }

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', 2024)
    .single();

  let { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('name', 'Lando Norris')
    .single();

  if (!driver) {
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ name: 'Lando Norris', nationality: 'British' })
      .select()
      .single();
    driver = newDriver;
  }

  const { data: car, error: carError } = await supabase
    .from('cars')
    .insert({
      livery_name: 'MCL38',
      event_name: 'Singapore GP Winner',
      team_id: team!.id,
      season_id: season!.id,
    })
    .select()
    .single();

  if (carError) {
    console.error('❌ Error creating car:', carError);
    return;
  }

  await supabase
    .from('car_drivers')
    .insert({
      car_id: car.id,
      driver_id: driver!.id,
    });

  console.log(`✅ Created Singapore GP Winner car (ID: ${car.id})`);
}

addSingaporeGP();
