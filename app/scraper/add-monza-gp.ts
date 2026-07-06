import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addMonzaGP() {
  console.log('Adding 2024 Monza/Italian GP Winner - Charles Leclerc - Ferrari SF-24\n');

  let { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('name', 'Ferrari')
    .single();

  if (!team) {
    const { data: newTeam } = await supabase
      .from('teams')
      .insert({ name: 'Ferrari' })
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
    .eq('name', 'Charles Leclerc')
    .single();

  if (!driver) {
    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ name: 'Charles Leclerc', nationality: 'Monégasque' })
      .select()
      .single();
    driver = newDriver;
  }

  const { data: car, error: carError } = await supabase
    .from('cars')
    .insert({
      livery_name: 'SF-24',
      event_name: 'Italian GP Winner',
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

  console.log(`✅ Created Italian GP Winner car (ID: ${car.id})`);
}

addMonzaGP();
