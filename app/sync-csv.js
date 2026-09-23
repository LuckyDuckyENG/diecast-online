require('dotenv').config({path: '.env.local'});
const {createClient} = require('@supabase/supabase-js');
const fs = require('fs');
const { buildSlugFromParts } = require('./slug-util');
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

  const findTeam = (name, year) => {
    // Special case mappings for team name variations
    const teamMappings = {
      'VCARB': ['RB', 'Visa Cash App RB'],
      // 2025 renamed the team again. No existing row contains the words
      // "Racing Bulls", so the partial-match fallback finds nothing and every
      // row for this team fails with an unhelpful "Missing reference".
      'Racing Bulls': ['RB', 'Visa Cash App RB'],
      /**
       * SAUBER IS THREE TEAMS DEPENDING ON THE YEAR, and the row names in the
       * database follow that: "Sauber" up to 2017, "Alfa Romeo" from 2018 to
       * 2023, "Kick Sauber" from 2024. Mapping the bare word to Kick Sauber
       * unconditionally sent 2017 cars to a team that did not exist yet, and
       * then could not FIND them again on a re-import -- 21 cars reported
       * missing while sitting under the correct name.
       *
       * Handled below rather than here, because it is the one mapping that
       * needs to know what season the row is for.
       */
      'Sauber': ['Kick Sauber'],
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

    // The Sauber lineage, by era. Falls through to the table when no year
    // is given, so nothing that relied on the old behaviour changes shape.
    if (/^(sauber|alfa romeo|kick sauber)$/i.test(name) && year) {
      const y = parseInt(year, 10);
      const era = y <= 2017 ? 'Sauber' : y <= 2023 ? 'Alfa Romeo' : 'Kick Sauber';
      const hit = teams?.find(t => t.name.toLowerCase() === era.toLowerCase());
      if (hit) return hit;
    }

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
    carsWouldCreate: 0,
    // A dry run inserts nothing, so two rows for the same car -- the Spark and
    // the Minichamps of one race -- would both count as a new car. The live run
    // creates it once and skips the second. Remembering what a dry run has
    // already "created" makes the two agree: predicted 76, actual 54.
    dryCars: new Set(),
    modelsWouldCreate: 0,
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
    const team = findTeam(row.team, row.year);
    const driver = findDriver(row.driver_name);
    const manufacturer = findManufacturer(row.manufacturer);
    
    if (!season || !team || !driver || !manufacturer) {
      stats.errors.push(`Row ${i}: Missing reference - season:${!!season} team:${!!team} driver:${!!driver} mfr:${!!manufacturer}`);
      continue;
    }
    
    console.log(`Processing: ${row.year} ${row.team} ${row.chassis_name} - ${row.event_name} - ${row.driver_name}`);
    
    {
      // Create or find car.
      //
      // The lookups run in dry-run mode as well. They used to be inside an
      // `if (!dryRun)`, so a dry run printed "Would create car and models" for
      // every row without ever asking the database -- on a 164-row 2022 file
      // it claimed 164 new cars when half of them already existed. That made
      // the dry run useless as the gate for the one failure this script warns
      // loudest about: inventing a car that never existed. Only the INSERTs
      // are gated now; every SELECT always runs.
      const {data: existingCars} = await supabase
        .from('cars')
        .select('id, event_name')
        .eq('season_id', season.id)
        .eq('team_id', team.id)
        .eq('chassis_name', row.chassis_name)
        .eq('driver_id', driver.id);

      /**
       * The circuit in brackets is decoration, not identity.
       *
       * Rows imported at different times spell the same race two ways --
       * "Italian GP (Monza)" and "Italian GP", "Tuscan GP (Mugello)" and
       * "Tuscan GP", "Pre-season Testing (Fiorano)" and "Pre-season Testing".
       * An exact match on event_name therefore treated them as different races
       * and created a SECOND car for one that already existed: 17 such pairs
       * across 2017, 2019 and 2020, each splitting a car's models and prices
       * over two pages.
       *
       * Neither spelling is wrong and the parenthetical is not reliably on the
       * older row, so the fix is to compare without it rather than to pick a
       * winner. The existing row keeps whatever name it already had.
       */
      const baseEvent = e => String(e || '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
      const existingCar = (existingCars || []).find(
        c => baseEvent(c.event_name) === baseEvent(row.event_name)
      );

      let carId = existingCar?.id;
      
      if (!carId && dryRun) {
        const sig = [season.id, team.id, row.chassis_name, driver.id, row.event_name].join('|');
        if (stats.dryCars.has(sig)) {
          stats.carsSkipped++;
          console.log(`  [DRY RUN] car already queued by an earlier row`);
        } else {
          stats.dryCars.add(sig);
          stats.carsWouldCreate++;
          console.log(`  [DRY RUN] would CREATE car`);
        }
      } else if (!carId) {
        const {data: newCar, error: carError} = await supabase
          .from('cars')
          .insert({
            season_id: season.id,
            team_id: team.id,
            chassis_name: row.chassis_name,
            driver_id: driver.id,
            event_name: row.event_name,
            notes: row.notes,
            // Without this every imported car keeps a NULL slug and its page
            // falls back to a UUID URL, undoing migration 011 and the SEO work
            // for the whole import. Rules live in slug-util.js, shared with
            // backfill-car-slugs.js so the two cannot drift.
            slug: buildSlugFromParts({
              year: row.year,
              team: team.name,
              chassis: row.chassis_name,
              driver: driver.name,
              event: row.event_name
            })
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
      } else if (carId) {
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
        
        /**
         * Part numbers are case-insensitive. The shops are not.
         *
         * miniatures-minichamps writes its URLs in lower case, so an import
         * built from them offers "lsf1031" for a model the catalogue already
         * holds as "LSF1031". `.eq()` is case-sensitive, so the model looked
         * new and a SECOND row was created for the same physical product --
         * 53 of them, 22 sitting on the same car as their twin.
         *
         * `ilike` with no wildcards is an exact match that ignores case, which
         * is what a part number actually is. The existing row keeps its own
         * spelling; nothing is rewritten to match the CSV.
         */
        /**
         * Not maybeSingle(). It ERRORS when the query matches more than one
         * row, and the data already contains part numbers held twice -- so the
         * lookup returned nothing, the model looked new, and the importer
         * created a THIRD copy. Taking the first match instead means a
         * duplicate that already exists cannot breed further ones.
         */
        const {data: existingModels} = await supabase
          .from('models')
          .select('id')
          .eq('manufacturer_id', manufacturer.id)
          .ilike('manufacturer_sku', sku)
          .eq('scale', scale)
          .limit(1);
        const existingModel = existingModels?.[0];
        
        if (!existingModel && dryRun) {
          stats.modelsWouldCreate++;
          console.log(`  [DRY RUN] would CREATE model ${scale} ${sku}`);
        } else if (!existingModel) {
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
    }
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('📊 SYNC COMPLETE\n');
  if (dryRun) {
    console.log(`Cars    : ${stats.carsWouldCreate} would be CREATED, ${stats.carsSkipped} already exist`);
    console.log(`Models  : ${stats.modelsWouldCreate} would be CREATED, ${stats.modelsSkipped} already exist`);
  } else {
    console.log(`Cars created: ${stats.carsCreated}`);
    console.log(`Cars skipped: ${stats.carsSkipped}`);
    console.log(`Models created: ${stats.modelsCreated}`);
    console.log(`Models skipped: ${stats.modelsSkipped}`);
  }
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
