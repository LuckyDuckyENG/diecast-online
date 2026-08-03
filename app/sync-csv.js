require('dotenv').config({path: '.env.local'});
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Split one CSV line, respecting quoted fields.
 *
 * The notes and verification columns contain commas inside quotes
 * ("6th Place, Special Livery"), which a plain split(',') would shred. It
 * happens not to matter for the SKU columns because they come earlier in the
 * row, but relying on column order for correctness is a trap.
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }  // escaped ""
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

async function syncCSV(dryRun = false, csvArg = null) {
  console.log('🔄 CSV SYNC SCRIPT');
  console.log('═══════════════════════════════════════════\n');

  if (dryRun) {
    console.log('🧪 DRY RUN MODE - No database changes will be made\n');
  }

  // Read CSV. Path can be given as an argument so this works for any season;
  // defaults to the 2024 file it was originally written for.
  const csvPath = csvArg
    ? (path.isAbsolute(csvArg) ? csvArg : path.resolve(process.cwd(), csvArg))
    : path.join(__dirname, '..', 'f1_2024_models_by_team.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ CSV not found: ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim());
  const headers = parseCsvLine(lines[0]);

  console.log(`📄 Loaded CSV: ${path.basename(csvPath)} — ${lines.length - 1} rows\n`);
  
  // Get reference data
  const {data: seasons} = await supabase.from('seasons').select('*');
  const {data: teams} = await supabase.from('teams').select('*');
  const {data: drivers} = await supabase.from('drivers').select('*');
  const {data: manufacturers} = await supabase.from('manufacturers').select('*');
  
  // Helper functions
  const findSeason = (year) => seasons?.find(s => s.year === parseInt(year));

  const findTeam = (name) => {
    // Special case mappings for team name variations
    const teamMappings = {
      'VCARB': ['RB', 'Visa Cash App RB'],
      'Red Bull': ['Red Bull Racing'],
      'Ferrari': ['Scuderia Ferrari', 'Ferrari'],
      'Mercedes': ['Mercedes-AMG Petronas', 'Mercedes', 'Mercedes '],
      'Aston Martin': ['Aston Martin'],
      'McLaren': ['McLaren'],
      'Alpine': ['Alpine'],
      'Williams': ['Williams'],
      'Haas': ['Haas F1 Team'],
      'Kick Sauber': ['Kick Sauber']
    };

    // Try direct mapping first
    const possibleNames = teamMappings[name] || [name];
    for (const possibleName of possibleNames) {
      const team = teams?.find(t =>
        t.name.toLowerCase() === possibleName.toLowerCase() ||
        t.name.toLowerCase().includes(possibleName.toLowerCase())
      );
      if (team) return team;
    }

    // Fallback to partial match
    return teams?.find(t => t.name.toLowerCase().includes(name.toLowerCase()));
  };

  const findDriver = (name) => drivers?.find(d => d.name.toLowerCase() === name.toLowerCase());
  const findManufacturer = (name) => manufacturers?.find(m => m.name.toLowerCase() === name.toLowerCase());
  
  let stats = {
    carsCreated: 0,
    carsSkipped: 0,
    modelsCreated: 0,
    modelsSkipped: 0,
    errors: []
  };
  
  // Process each row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const fields = parseCsvLine(line);
    const row = {
      team: fields[0]?.trim(),
      driver_name: fields[1]?.trim(),
      event_name: fields[2]?.trim(),
      chassis_name: fields[3]?.trim(),
      year: fields[4]?.trim(),
      manufacturer: fields[5]?.trim(),
      sku_1_18: fields[6]?.trim(),
      sku_1_43: fields[7]?.trim(),
      notes: fields[8]?.trim(),
      verification: fields[9]?.trim()
    };
    
    // Skip rows with no driver (means no release)
    if (!row.driver_name) {
      stats.carsSkipped++;
      continue;
    }
    
    // Find reference IDs
    const season = findSeason(row.year);
    const team = findTeam(row.team);
    const driver = findDriver(row.driver_name);
    const manufacturer = findManufacturer(row.manufacturer);
    
    if (!season || !team || !driver || !manufacturer) {
      stats.errors.push(`Row ${i}: Missing reference - season:${!!season} team:${!!team} driver:${!!driver} mfr:${!!manufacturer}`);
      continue;
    }
    
    console.log(`Processing: ${row.year} ${row.team} ${row.chassis_name} - ${row.event_name} - ${row.driver_name}`);
    
    if (!dryRun) {
      // Create or find car
      const {data: existingCar} = await supabase
        .from('cars')
        .select('id')
        .eq('season_id', season.id)
        .eq('team_id', team.id)
        .eq('chassis_name', row.chassis_name)
        .eq('driver_id', driver.id)
        .eq('event_name', row.event_name)
        .maybeSingle();
      
      let carId = existingCar?.id;
      
      if (!carId) {
        const {data: newCar, error: carError} = await supabase
          .from('cars')
          .insert({
            season_id: season.id,
            team_id: team.id,
            chassis_name: row.chassis_name,
            driver_id: driver.id,
            event_name: row.event_name,
            notes: row.notes
          })
          .select('id')
          .single();
        
        if (carError) {
          stats.errors.push(`Row ${i}: Car creation failed - ${carError.message}`);
          continue;
        }
        
        carId = newCar.id;
        stats.carsCreated++;
        console.log(`  ✅ Created car`);
      } else {
        stats.carsSkipped++;
        console.log(`  ⏭️  Car exists`);
      }
      
      // Create models for each SKU
      const skus = [
        {sku: row.sku_1_18, scale: '1:18'},
        {sku: row.sku_1_43, scale: '1:43'}
      ];
      
      for (const {sku, scale} of skus) {
        if (!sku) continue;
        
        // Check if model exists
        const {data: existingModel} = await supabase
          .from('models')
          .select('id')
          .eq('manufacturer_id', manufacturer.id)
          .eq('manufacturer_sku', sku)
          .eq('scale', scale)
          .maybeSingle();
        
        if (!existingModel) {
          const {error: modelError} = await supabase
            .from('models')
            .insert({
              car_id: carId,
              manufacturer_id: manufacturer.id,
              manufacturer_sku: sku,
              scale: scale,
              notes: row.verification
            });
          
          if (modelError) {
            stats.errors.push(`Row ${i}: Model ${sku} failed - ${modelError.message}`);
          } else {
            stats.modelsCreated++;
            console.log(`  ✅ Created model ${scale} ${sku}`);
          }
        } else {
          stats.modelsSkipped++;
          console.log(`  ⏭️  Model exists ${scale} ${sku}`);
        }
      }
    } else {
      console.log(`  [DRY RUN] Would create car and models`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('📊 SYNC COMPLETE\n');
  console.log(`Cars created: ${stats.carsCreated}`);
  console.log(`Cars skipped: ${stats.carsSkipped}`);
  console.log(`Models created: ${stats.modelsCreated}`);
  console.log(`Models skipped: ${stats.modelsSkipped}`);
  console.log(`Errors: ${stats.errors.length}`);
  
  if (stats.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    stats.errors.forEach(err => console.log(`  - ${err}`));
  }
}

// Usage: node sync-csv.js [path/to/file.csv] [--dry-run]
const dryRun = process.argv.includes('--dry-run');
const csvArg = process.argv.slice(2).find(a => !a.startsWith('--')) || null;
syncCSV(dryRun, csvArg).catch(console.error);
