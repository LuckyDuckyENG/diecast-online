const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Get the 1:18 model
  const { data: model118 } = await s.from('models').select('id').eq('manufacturer_sku', '117241803').single();

  // Get Anthony's Diecasts retailer
  const { data: anthonys } = await s.from('retailers').select('id').eq('name', "Anthony's Diecasts").single();

  // Check if already connected
  const { data: existing } = await s.from('retailer_models')
    .select('*')
    .eq('model_id', model118.id)
    .eq('retailer_id', anthonys.id)
    .single();

  if (!existing) {
    await s.from('retailer_models').insert({
      model_id: model118.id,
      retailer_id: anthonys.id,
      price: 293.00,
      currency: 'AUD',
      url: 'https://anthonysdiecasts.com.au/products/1-18-2024-daniel-ricciardo-last-race-singapore-gp-3-racing-bulls-minichamps-f1',
      in_stock: true
    });
    console.log("✅ Added Anthony's Diecasts for 117241803 (AUD $293.00)");
  } else {
    console.log('✅ Already connected to Anthony\'s Diecasts');
  }

  // Get the 1:43 model
  const { data: model143 } = await s.from('models').select('id').eq('manufacturer_sku', '417241803').single();

  // Get DrivenBy retailer
  const { data: drivenby } = await s.from('retailers').select('id').eq('name', 'DrivenBy').single();

  // Check if already connected
  const { data: existing43 } = await s.from('retailer_models')
    .select('*')
    .eq('model_id', model143.id)
    .eq('retailer_id', drivenby.id)
    .single();

  if (!existing43) {
    await s.from('retailer_models').insert({
      model_id: model143.id,
      retailer_id: drivenby.id,
      url: 'https://drivenby.co/products/daniel-ricciardo-last-race-visa-cash-app-rb-vcarb-01-singapore-gp-2024-special-livery-model-car-minichamps',
      in_stock: true
    });
    console.log("✅ Added DrivenBy for 417241803");
  } else {
    console.log('✅ Already connected to DrivenBy');
  }
})();
