import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function addCanadaGP() {
  console.log('Adding 2024 Canada GP Winner - Max Verstappen - Red Bull RB20\n');

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('name', 'Red Bull Racing')
    .single();

  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', 2024)
    .single();

  const { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('name', 'Max Verstappen')
    .single();

  const { data: car, error: carError } = await supabase
    .from('cars')
    .insert({
      livery_name: 'RB20',
      event_name: 'Canada GP Winner',
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

  console.log(`✅ Created Canada GP Winner car (ID: ${car.id})`);
}

addCanadaGP();
