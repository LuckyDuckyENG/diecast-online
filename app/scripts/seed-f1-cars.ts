import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Import all F1 cars data (we'll copy from the page.tsx file)
const f1CarsData: any[] = [
  // We'll extract this from page.tsx
];

async function seedF1Cars() {
  try {
    console.log('🌱 Starting F1 cars seed...');
    console.log(`📊 Total cars to insert: ${f1CarsData.length}`);

    // Insert in batches of 50 to avoid timeouts
    const batchSize = 50;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < f1CarsData.length; i += batchSize) {
      const batch = f1CarsData.slice(i, i + batchSize);

      console.log(`\n📦 Inserting batch ${Math.floor(i / batchSize) + 1} (${batch.length} cars)...`);

      const { data, error } = await supabase
        .from('f1_cars')
        .upsert(batch, { onConflict: 'id' });

      if (error) {
        console.error('❌ Batch error:', error.message);
        errorCount += batch.length;
      } else {
        console.log(`✅ Batch inserted successfully`);
        successCount += batch.length;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✨ Seed complete!`);
    console.log(`✅ Success: ${successCount} cars`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} cars`);
    }
    console.log('='.repeat(50));

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

seedF1Cars();
