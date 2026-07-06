import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface CSVRow {
  event_name: string;
  driver_name: string;
  team_name: string;
  livery_name: string;
  year: number;
  manufacturer: string;
  sku_1_18: string;
  sku_1_43: string;
}

// Parse CSV manually (simple parser)
function parseCSV(content: string): CSVRow[] {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',');

  return lines.slice(1).map(line => {
    const values = line.split(',');
    return {
      event_name: values[0],
      driver_name: values[1],
      team_name: values[2],
      livery_name: values[3],
      year: parseInt(values[4]),
      manufacturer: values[5],
      sku_1_18: values[6] || '',
      sku_1_43: values[7] || '',
    };
  });
}

// Get or create team
async function getOrCreateTeam(name: string) {
  let { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('name', name)
    .single();

  if (!team) {
    const { data: newTeam } = await supabase
      .from('teams')
      .insert({ name })
      .select()
      .single();
    team = newTeam;
  }

  return team;
}

// Get or create driver
async function getOrCreateDriver(name: string) {
  let { data: driver } = await supabase
    .from('drivers')
    .select('*')
    .eq('name', name)
    .single();

  if (!driver) {
    // Extract nationality from known drivers (basic mapping)
    const nationalityMap: Record<string, string> = {
      'Max Verstappen': 'Dutch',
      'Lewis Hamilton': 'British',
      'Charles Leclerc': 'Monégasque',
      'Lando Norris': 'British',
      'Carlos Sainz': 'Spanish',
      'George Russell': 'British',
      'Oscar Piastri': 'Australian',
      'Pierre Gasly': 'French',
      'Esteban Ocon': 'French',
      'Yuki Tsunoda': 'Japanese',
      'Daniel Ricciardo': 'Australian',
      'Franco Colapinto': 'Argentine',
      'Valtteri Bottas': 'Finnish',
    };

    const { data: newDriver } = await supabase
      .from('drivers')
      .insert({ name, nationality: nationalityMap[name] || 'Unknown' })
      .select()
      .single();
    driver = newDriver;
  }

  return driver;
}

// Get or create season
async function getOrCreateSeason(year: number) {
  let { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', year)
    .single();

  if (!season) {
    const { data: newSeason } = await supabase
      .from('seasons')
      .insert({ year, name: `${year} F1 Season` })
      .select()
      .single();
    season = newSeason;
  }

  return season;
}

// Get or create manufacturer
async function getOrCreateManufacturer(name: string) {
  let { data: manufacturer } = await supabase
    .from('manufacturers')
    .select('*')
    .eq('name', name)
    .single();

  if (!manufacturer) {
    const { data: newManufacturer } = await supabase
      .from('manufacturers')
      .insert({ name })
      .select()
      .single();
    manufacturer = newManufacturer;
  }

  return manufacturer;
}

async function importFromCSV() {
  console.log('🚀 Starting CSV Import\n');

  // Read CSV file
  const csvPath = path.join(__dirname, '../data/2024-gp-winners.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(csvContent);

  console.log(`📋 Found ${rows.length} cars to import\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🏁 ${row.event_name} - ${row.driver_name}`);
      console.log(`${'='.repeat(60)}`);

      // Get or create related entities
      const team = await getOrCreateTeam(row.team_name);
      const driver = await getOrCreateDriver(row.driver_name);
      const season = await getOrCreateSeason(row.year);
      const manufacturer = await getOrCreateManufacturer(row.manufacturer);

      console.log(`   ✅ Team: ${team.name}`);
      console.log(`   ✅ Driver: ${driver.name}`);
      console.log(`   ✅ Season: ${season.year}`);
      console.log(`   ✅ Manufacturer: ${manufacturer.name}`);

      // Check if car already exists
      const { data: existingCar } = await supabase
        .from('cars')
        .select('*')
        .eq('event_name', row.event_name)
        .eq('team_id', team.id)
        .eq('season_id', season.id)
        .single();

      let car;
      if (existingCar) {
        console.log(`   ⚠️  Car already exists (ID: ${existingCar.id}) - skipping`);
        car = existingCar;
      } else {
        // Create car
        const { data: newCar, error: carError } = await supabase
          .from('cars')
          .insert({
            livery_name: row.livery_name,
            event_name: row.event_name,
            team_id: team.id,
            season_id: season.id,
          })
          .select()
          .single();

        if (carError) {
          console.error(`   ❌ Error creating car:`, carError);
          errorCount++;
          continue;
        }

        car = newCar;
        console.log(`   ✅ Created car (ID: ${car.id})`);

        // Link car to driver
        await supabase
          .from('car_drivers')
          .insert({
            car_id: car.id,
            driver_id: driver.id,
          });

        console.log(`   ✅ Linked driver to car`);
      }

      // Add models (1:18 and 1:43)
      const modelsToAdd = [];

      if (row.sku_1_18) {
        // Check if model already exists
        const { data: existing18 } = await supabase
          .from('models')
          .select('*')
          .eq('manufacturer_sku', row.sku_1_18)
          .single();

        if (!existing18) {
          modelsToAdd.push({
            car_id: car.id,
            manufacturer_id: manufacturer.id,
            scale: '1:18',
            manufacturer_sku: row.sku_1_18,
            description: `${row.driver_name} - ${row.event_name} - ${row.livery_name}`,
          });
        } else {
          console.log(`   ⚠️  Model ${row.sku_1_18} already exists - skipping`);
        }
      }

      if (row.sku_1_43) {
        // Check if model already exists
        const { data: existing43 } = await supabase
          .from('models')
          .select('*')
          .eq('manufacturer_sku', row.sku_1_43)
          .single();

        if (!existing43) {
          modelsToAdd.push({
            car_id: car.id,
            manufacturer_id: manufacturer.id,
            scale: '1:43',
            manufacturer_sku: row.sku_1_43,
            description: `${row.driver_name} - ${row.event_name} - ${row.livery_name}`,
          });
        } else {
          console.log(`   ⚠️  Model ${row.sku_1_43} already exists - skipping`);
        }
      }

      if (modelsToAdd.length > 0) {
        const { error: modelsError } = await supabase
          .from('models')
          .insert(modelsToAdd);

        if (modelsError) {
          console.error(`   ❌ Error adding models:`, modelsError);
          errorCount++;
        } else {
          console.log(`   ✅ Added ${modelsToAdd.length} model(s): ${modelsToAdd.map(m => m.manufacturer_sku).join(', ')}`);
          successCount++;
        }
      }

    } catch (error: any) {
      console.error(`   ❌ Error processing row:`, error.message);
      errorCount++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`\n🎉 Import Complete!`);
  console.log(`   ✅ Successfully imported: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
  console.log(`\n💡 Next step: Run the price scraper to get images and prices`);
  console.log(`   cd app && npx tsx scraper/scrape-auto-with-images.ts\n`);
}

importFromCSV();
