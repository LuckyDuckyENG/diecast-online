import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function emergencyReset() {
  console.log('🚨 EMERGENCY RESET - Unlinking ALL discovered models from cars\n');

  // First check how many are currently linked
  const { data: before } = await supabase
    .from('models')
    .select('id')
    .not('discovered_from', 'is', null)
    .not('car_id', 'is', null);

  console.log(`Found ${before?.length || 0} discovered models currently linked to cars`);

  // Reset them all
  const { data, error } = await supabase
    .from('models')
    .update({ car_id: null, needs_review: true })
    .not('discovered_from', 'is', null)
    .select('id');

  if (error) {
    console.error('❌ Error:', error);
  } else {
    console.log(`✅ Successfully unlinked ${data?.length || 0} discovered models`);
    console.log('✅ Your 4 original cars should now only have their original manually-added models');
  }
}

emergencyReset();
