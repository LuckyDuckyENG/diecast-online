require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check2024() {
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('year', 2024)
    .single();

  const { data: cars } = await supabase
    .from('cars')
    .select(`
      id,
      livery_name,
      event_name,
      team:teams(name),
      car_drivers(driver:drivers(name))
    `)
    .eq('season_id', season.id)
    .order('livery_name');

  console.log('2024 cars in database:', cars?.length, '\n');

  const noDriver = cars?.filter(c => !c.car_drivers || c.car_drivers.length === 0);
  const multiDriver = cars?.filter(c => c.car_drivers && c.car_drivers.length > 1);

  console.log('Cars with NO driver:', noDriver?.length);
  noDriver?.forEach(c => {
    console.log(`  - ${c.team?.name} ${c.livery_name} - ${c.event_name || 'Season'} (${c.id.substring(0, 8)})`);
  });

  console.log('\nCars with MULTIPLE drivers:', multiDriver?.length);
  multiDriver?.forEach(c => {
    const drivers = c.car_drivers.map(d => d.driver?.name).join(' + ');
    console.log(`  - ${c.team?.name} ${c.livery_name} - ${c.event_name || 'Season'} - ${drivers} (${c.id.substring(0, 8)})`);
  });

  console.log('\nCorrect cars (1 driver):', cars?.length - noDriver?.length - multiDriver?.length);
}

check2024().catch(console.error);
