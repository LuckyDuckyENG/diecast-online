import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkPrices() {
  const { data: prices } = await supabase
    .from('prices')
    .select(`
      *,
      models (manufacturer_sku, description),
      retailers (name)
    `)
    .order('scraped_at', { ascending: false })
    .limit(20);

  console.log(`\n💰 Recent prices (last 20):\n`);
  prices?.forEach(p => {
    console.log(`${p.retailers?.name?.padEnd(25)} | ${p.models?.manufacturer_sku?.padEnd(15)} | ${p.price_aud.toFixed(2).padStart(8)} AUD | ${p.in_stock ? '✅' : '❌'}`);
  });

  const { count } = await supabase
    .from('prices')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total prices in database: ${count}`);
}

checkPrices();
