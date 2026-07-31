require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeMergedCars() {
  console.log('🔍 Analyzing database for wrongly merged cars...\n');

  const { data: cars } = await supabase
    .from('cars')
    .select('id, livery_name, event_name, season:seasons(year), team:teams(name)')
    .order('livery_name');

  const problematicCars = [];

  for (const car of cars || []) {
    // Get all models for this car
    const { data: models } = await supabase
      .from('models')
      .select('id, manufacturer_sku, event_name, driver:drivers(name)')
      .eq('car_id', car.id);

    if (!models || models.length === 0) continue;

    // Get retailer URLs for these models
    const modelIds = models.map(m => m.id);
    const { data: prices } = await supabase
      .from('price_history')
      .select('model_id, product_url')
      .in('model_id', modelIds);

    // Extract event hints from URLs
    const eventHints = new Set();
    prices?.forEach(p => {
      const url = p.product_url.toLowerCase();

      // Common event patterns in URLs
      if (url.includes('monaco')) eventHints.add('Monaco');
      if (url.includes('miami')) eventHints.add('Miami');
      if (url.includes('las-vegas') || url.includes('vegas')) eventHints.add('Las Vegas');
      if (url.includes('bahrain')) eventHints.add('Bahrain');
      if (url.includes('brazil') || url.includes('sao-paulo')) eventHints.add('Brazil');
      if (url.includes('canada')) eventHints.add('Canada');
      if (url.includes('silverstone') || url.includes('british')) eventHints.add('British');
      if (url.includes('-spa-') || url.includes('/spa-') || url.includes('belgium')) eventHints.add('Belgium');
      if (url.includes('monza') || url.includes('italian')) eventHints.add('Italian');
      if (url.includes('singapore')) eventHints.add('Singapore');
      if (url.includes('japan') || url.includes('suzuka')) eventHints.add('Japan');
      if (url.includes('australia')) eventHints.add('Australia');
      if (url.includes('austria') || url.includes('spielberg')) eventHints.add('Austria');
      if (url.includes('hungary') || url.includes('hungaroring')) eventHints.add('Hungary');
      if (url.includes('netherlands') || url.includes('zandvoort')) eventHints.add('Netherlands');
      if (url.includes('mexico')) eventHints.add('Mexico');
      if (url.includes('abu-dhabi')) eventHints.add('Abu Dhabi');
      if (url.includes('saudi') || url.includes('jeddah')) eventHints.add('Saudi Arabia');
      if (url.includes('azerbaijan') || url.includes('baku')) eventHints.add('Azerbaijan');
      if (url.includes('qatar')) eventHints.add('Qatar');
      if (url.includes('usa') || url.includes('austin') || url.includes('cota')) eventHints.add('USA/Austin');
    });

    // Check if this car has models from multiple events
    if (eventHints.size > 1) {
      problematicCars.push({
        car,
        modelCount: models.length,
        eventHints: Array.from(eventHints),
        drivers: [...new Set(models.map(m => m.driver?.name).filter(Boolean))],
      });
    }
  }

  console.log(`\n📊 SUMMARY:`);
  console.log(`Total cars: ${cars?.length}`);
  console.log(`Problematic cars: ${problematicCars.length}\n`);

  if (problematicCars.length > 0) {
    console.log('⚠️  CARS WITH MIXED EVENTS:\n');
    problematicCars.forEach(({ car, modelCount, eventHints, drivers }) => {
      console.log(`${car.season?.year} ${car.team?.name} ${car.livery_name}`);
      console.log(`  Car event_name: ${car.event_name || 'NULL'}`);
      console.log(`  ${modelCount} models with events: ${eventHints.join(', ')}`);
      console.log(`  Drivers: ${drivers.join(', ')}`);
      console.log(`  Car ID: ${car.id}`);
      console.log('');
    });
  } else {
    console.log('✅ No cars found with mixed events!');
  }

  return problematicCars;
}

analyzeMergedCars().catch(console.error);
