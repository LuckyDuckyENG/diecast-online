import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDiscovered() {
  const { data, count } = await supabase
    .from('models')
    .select('*', { count: 'exact' })
    .eq('needs_review', true)
    .order('discovered_at', { ascending: false });

  console.log(`\n🆕 Auto-discovered models: ${count}\n`);
  console.log('Recent discoveries:');
  data?.slice(0, 15).forEach(m => {
    console.log(`  - ${m.manufacturer_sku.padEnd(15)} | ${m.description.substring(0, 70)}`);
  });

  console.log('\n📊 Discovery sources:');
  const sources = data?.reduce((acc: any, m) => {
    acc[m.discovered_from] = (acc[m.discovered_from] || 0) + 1;
    return acc;
  }, {});
  Object.entries(sources || {}).forEach(([source, count]) => {
    console.log(`  - ${source}: ${count} models`);
  });
}

checkDiscovered();
