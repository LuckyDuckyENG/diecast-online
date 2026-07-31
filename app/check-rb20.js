require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRB20() {
  const { data: rb20 } = await supabase
    .from('cars')
    .select('id, livery_name, event_name')
    .eq('livery_name', 'RB20')
    .single();

  const { data: models } = await supabase
    .from('models')
    .select('manufacturer_sku, event_name, driver:drivers(name)')
    .eq('car_id', rb20.id);

  console.log('RB20 Car:');
  console.log('  event_name:', rb20.event_name || 'NULL');
  console.log('  Total models:', models?.length);
  console.log('\nModels by event:');

  const eventGroups = {};
  models?.forEach(m => {
    const event = m.event_name || 'NULL';
    if (!eventGroups[event]) eventGroups[event] = [];
    eventGroups[event].push(m);
  });

  Object.entries(eventGroups).forEach(([event, mods]) => {
    console.log('  -', event, ':', mods.length, 'models');
  });
}

checkRB20().catch(console.error);
