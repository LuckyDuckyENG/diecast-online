import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic({ apiKey: anthropicApiKey });

interface ParsedModel {
  driver: string;
  team: string;
  event: string;
  year: number;
  scale: string;
  manufacturer: string;
  livery_description?: string;
}

// Parse a model title using Claude API
async function parseModelTitle(title: string, sku: string, scale: string): Promise<ParsedModel | null> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Parse this F1 diecast model product title and extract structured data.

Product Title: "${title}"
SKU: ${sku}
Scale: ${scale}

Extract:
- driver: Full driver name (e.g., "Lando Norris", "Max Verstappen")
- team: Team name (e.g., "McLaren", "Red Bull Racing", "Ferrari")
- event: Race/event description (e.g., "Miami GP Winner", "Monaco GP", "World Champion 2024")
- year: Year (extract from title, usually 2024-2026)
- manufacturer: Manufacturer brand (e.g., "Minichamps", "Spark", "BBR", "Looksmart", "Solido")
- livery_description: Optional livery details (e.g., "Special Senna Livery", "Launch Spec", "RB20")

Return ONLY valid JSON with these exact fields. If you cannot extract a field, use null.

Example response:
{
  "driver": "Lando Norris",
  "team": "McLaren",
  "event": "Miami GP Winner",
  "year": 2024,
  "scale": "1:43",
  "manufacturer": "Minichamps",
  "livery_description": "MCL38"
}`
      }]
    });

    let responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Strip markdown code blocks if present
    responseText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(responseText);

    // Validate required fields
    if (!parsed.driver || !parsed.team || !parsed.year) {
      console.log(`   ⚠️  Incomplete parse result for: ${title}`);
      return null;
    }

    return {
      driver: parsed.driver,
      team: parsed.team,
      event: parsed.event || 'Unknown Event',
      year: parsed.year,
      scale: parsed.scale || scale,
      manufacturer: parsed.manufacturer || 'Unknown',
      livery_description: parsed.livery_description,
    };
  } catch (error: any) {
    console.error(`   ❌ Error parsing title:`, error.message);
    return null;
  }
}

// Find matching existing car (no auto-creation for now)
async function findMatchingCar(parsed: ParsedModel): Promise<number | null> {
  // Get all existing cars with their event names
  const { data: existingCars, error } = await supabaseAdmin
    .from('cars')
    .select('id, event_name, livery_name');

  if (error) {
    console.log(`   ❌ Error fetching cars:`, error);
    return null;
  }

  if (!existingCars || existingCars.length === 0) {
    console.log(`   ⚠️  No existing cars in database`);
    return null;
  }

  console.log(`   📋 Found ${existingCars.length} existing cars to match against`);

  // STRICT matching: require specific race location name to match
  const eventLower = parsed.event.toLowerCase();

  // List of specific GP location keywords (not generic terms like "GP" or "Winner")
  const raceLocations = ['miami', 'monaco', 'british', 'silverstone', 'las vegas', 'vegas',
                         'monza', 'spa', 'suzuka', 'singapore', 'austin', 'cota', 'barcelona',
                         'melbourne', 'bahrain', 'saudi', 'jeddah', 'shanghai', 'imola',
                         'canada', 'montreal', 'austria', 'spielberg', 'hungary', 'zandvoort',
                         'baku', 'qatar', 'mexico', 'brazil', 'interlagos', 'abu dhabi'];

  for (const car of existingCars) {
    const carEventLower = (car.event_name || '').toLowerCase();

    // Find the specific race location in both parsed event and car event
    const parsedLocation = raceLocations.find(loc => eventLower.includes(loc));
    const carLocation = raceLocations.find(loc => carEventLower.includes(loc));

    // ONLY match if SAME specific location found in both
    // This prevents "Barcelona GP" matching to "Miami GP"
    if (parsedLocation && carLocation && parsedLocation === carLocation) {
      console.log(`   ✅ Matched "${parsed.event}" to car "${car.event_name}" (race: ${parsedLocation})`);
      return car.id;
    }
  }

  console.log(`   ⚠️  No matching car - ${parsed.event} doesn't match any existing race`);
  return null;
}

// Link model to car and mark as reviewed
async function linkModelToCar(modelId: string, carId: number, parsedData: ParsedModel) {
  const { error } = await supabaseAdmin
    .from('models')
    .update({
      car_id: carId,
      needs_review: false,
      description: `${parsedData.driver} - ${parsedData.event} - ${parsedData.manufacturer}`,
    })
    .eq('id', modelId);

  if (error) {
    console.error(`   ❌ Error linking model:`, error);
  } else {
    console.log(`   ✅ Linked model to car ID ${carId}`);
  }
}

// Main normalizer
async function normalizeDiscoveredModels() {
  console.log('🤖 Starting AI Model Normalizer\n');
  console.log('=' .repeat(60) + '\n');

  // Get all models that need review
  const { data: models } = await supabaseAdmin
    .from('models')
    .select('id, manufacturer_sku, description, scale, discovered_from, needs_review')
    .eq('needs_review', true)
    .order('discovered_at', { ascending: true });

  if (!models || models.length === 0) {
    console.log('✅ No models need review!');
    return;
  }

  console.log(`📋 Found ${models.length} models to normalize\n`);
  console.log(`⚠️  This will use Claude API - estimated cost: ~$${(models.length * 0.003).toFixed(2)}\n`);

  // Process in batches to avoid rate limits
  let processed = 0;
  let linked = 0;
  let failed = 0;

  for (const model of models) { // Process all models
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Model: ${model.manufacturer_sku}`);
    console.log(`📝 Title: ${model.description}`);
    console.log(`🏪 Discovered at: ${model.discovered_from}`);
    console.log(`${'='.repeat(60)}\n`);

    // Parse the title with Claude
    const parsed = await parseModelTitle(model.description, model.manufacturer_sku, model.scale);

    if (!parsed) {
      console.log(`   ❌ Failed to parse - skipping\n`);
      failed++;
      continue;
    }

    console.log(`   ✨ Parsed:`, parsed);

    // Find matching car (only existing ones)
    const carId = await findMatchingCar(parsed);

    if (!carId) {
      console.log(`   ⚠️  No matching car - will skip for now\n`);
      failed++;
      continue;
    }

    // Link model to car
    await linkModelToCar(model.id, carId, parsed);

    processed++;
    linked++;

    // Rate limit: wait 1 second between API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('✨ Normalization Complete!');
  console.log('='.repeat(60));
  console.log(`📊 Processed: ${processed} models`);
  console.log(`✅ Linked: ${linked} models to cars`);
  console.log(`❌ Failed: ${failed} models`);
  console.log(`\n💡 Remaining models needing review: ${models.length - processed}`);
}

normalizeDiscoveredModels();
