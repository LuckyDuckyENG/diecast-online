import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function unlinkAll() {
  console.log('Unlinking ALL discovered models from cars...\n');

  // Unlink ALL models that were discovered (have discovered_from set)
  const { error, count } = await supabase
    .from('models')
    .update({
      car_id: null,
      needs_review: true
    })
    .not('discovered_from', 'is', null);

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log(`✅ Unlinked ${count} discovered models from cars`);
    console.log('✅ Set needs_review = true for all discovered models');
  }
}

unlinkAll();
