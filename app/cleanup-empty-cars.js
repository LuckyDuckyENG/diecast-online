require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function cleanupEmptyCars() {
  console.log('🧹 Cleaning up empty cars...\n');

  const { data: allCars } = await supabase
    .from('cars')
    .select('id, livery_name, event_name');

  let deleted = 0;

  for (const car of allCars || []) {
    const { data: models } = await supabase
      .from('models')
      .select('id')
      .eq('car_id', car.id);

    if (!models || models.length === 0) {
      // Delete car_drivers first
      const { data: carDrivers } = await supabase
        .from('car_drivers')
        .select('id')
        .eq('car_id', car.id);

      if (carDrivers && carDrivers.length > 0) {
        await supabase
          .from('car_drivers')
          .delete()
          .eq('car_id', car.id);
      }

      // Delete car
      await supabase
        .from('cars')
        .delete()
        .eq('id', car.id);

      console.log('Deleted:', car.livery_name, car.event_name || '(no event)', '-', car.id);
      deleted++;
    }
  }

  console.log('\n✅ Deleted', deleted, 'empty cars');
}

cleanupEmptyCars().catch(console.error);
