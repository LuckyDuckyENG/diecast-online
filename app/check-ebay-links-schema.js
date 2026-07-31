require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  // Check if ebay_links table exists and what it references
  const { data, error } = await supabase
    .from('ebay_links')
    .select('*')
    .limit(1);
  
  if (error) {
    console.log('Error querying ebay_links:', error.message);
  } else {
    console.log('✅ ebay_links table exists');
    console.log('Sample row:', data[0]);
  }
  
  // Check what tables exist
  const { data: models, error: modelsError } = await supabase
    .from('models')
    .select('id')
    .limit(1);
    
  console.log('models table exists:', !modelsError);
  
  const { data: diecastModels, error: diecastError } = await supabase
    .from('diecast_models')
    .select('id')
    .limit(1);
    
  console.log('diecast_models table exists:', !diecastError);
}

checkSchema();
