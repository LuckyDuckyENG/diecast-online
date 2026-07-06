import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetDiscovered() {
  // Reset all discovered models back to needs_review
  const { data, error } = await supabase
    .from('models')
    .update({
      car_id: null,
      needs_review: true
    })
    .not('discovered_from', 'is', null);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log(`✅ Reset ${data?.length || 0} discovered models back to needs_review`);
  }
}

resetDiscovered();
