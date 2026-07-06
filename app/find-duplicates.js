const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: cars, error } = await s.from('cars').select('id, event_name, season_id').order('event_name');

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  const counts = {};
  const carsByKey = {};

  cars.forEach(car => {
    const key = `${car.event_name} - ${car.year}`;
    counts[key] = (counts[key] || 0) + 1;
    if (!carsByKey[key]) carsByKey[key] = [];
    carsByKey[key].push(car.id);
  });

  const duplicates = Object.entries(counts).filter(([_, count]) => count > 1);

  if (duplicates.length > 0) {
    console.log('Duplicates found:\n');
    duplicates.forEach(([key, count]) => {
      console.log(`  ${key} (${count} entries)`);
      console.log(`    IDs: ${carsByKey[key].join(', ')}\n`);
    });
  } else {
    console.log('No duplicates found');
  }
})();
