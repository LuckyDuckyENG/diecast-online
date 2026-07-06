const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: car } = await s.from('cars')
    .select(`
      id,
      event_name,
      driver_name,
      models(
        id,
        manufacturer_sku,
        scale,
        car_id,
        manufacturer:manufacturers(name)
      )
    `)
    .eq('event_name', 'Abu Dhabi GP Winner')
    .single();

  console.log('Abu Dhabi GP Winner:');
  console.log('Driver:', car.driver_name);
  console.log('Models:', car.models.length);
  car.models.forEach(m => {
    console.log(`  - ${m.scale} ${m.manufacturer?.name || 'Unknown'} (${m.manufacturer_sku}) - car_id: ${m.car_id}`);
  });
})();
