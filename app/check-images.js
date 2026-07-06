const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // Check how many models have image URLs
  const { data: withImages } = await s.from('models')
    .select('manufacturer_sku, image_url, scale')
    .not('image_url', 'is', null)
    .not('car_id', 'is', null);

  console.log('Models with images:', withImages?.length || 0, '/ 62');

  if (withImages && withImages.length > 0) {
    console.log('\nSample image URLs:');
    withImages.slice(0, 3).forEach(m => {
      console.log(`  ${m.manufacturer_sku} (${m.scale}): ${m.image_url?.substring(0, 80)}...`);
    });
  }

  // Check total car-linked models
  const { data: allModels } = await s.from('models')
    .select('id')
    .not('car_id', 'is', null);

  console.log('\nTotal car-linked models:', allModels?.length || 0);
})();
