const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const { data: models } = await s.from('models')
    .select('id, manufacturer_sku')
    .or('manufacturer_sku.eq.117241803,manufacturer_sku.eq.417241803');

  console.log('Models:');
  models.forEach(m => console.log(`  ${m.manufacturer_sku} (ID: ${m.id})`));

  for (const model of models) {
    const { data: connections } = await s.from('retailer_models')
      .select('*, retailers(name)')
      .eq('model_id', model.id);

    console.log(`\nRetailer connections for ${model.manufacturer_sku}:`);
    if (!connections || connections.length === 0) {
      console.log('  NONE');
    } else {
      connections.forEach(c => console.log(`  - ${c.retailers.name}: ${c.currency} $${c.price}`));
    }
  }
})();
