const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get all cars
  const { data: allCars, error } = await s.from('cars')
    .select('id, event_name, livery_name')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching cars:', error);
    return;
  }

  console.log('Total cars:', allCars?.length || 0);
  console.log('\nChecking which have models...\n');

  for (const car of allCars) {
    const { data: models } = await s.from('models')
      .select('id')
      .eq('car_id', car.id);

    const hasModels = models && models.length > 0;
    const status = hasModels ? '✅' : '❌';
    console.log(`${status} ${car.event_name} - ${car.livery_name} (${models?.length || 0} models)`);
  }
})();
