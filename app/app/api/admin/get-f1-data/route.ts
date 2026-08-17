import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { selectAll } from '@/lib/selectAll';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Admin data must never be served from a cache. Without this the browser
 * is free to reuse an earlier response, which is how a freshly added eBay
 * link kept showing as "Not linked" while the API was returning it.
 */
export const dynamic = 'force-dynamic';

/**
 * Normalize team names to handle variations and historical changes
 */
function normalizeTeamName(teamName: string): string {
  return teamName
    .replace(/^Scuderia\s+/i, '')
    .replace(/\s*-?\s*AMG Petronas$/i, '')
    .replace(/^Visa Cash App\s+/i, '')
    .replace(/\s+F1 Team$/i, '')
    .replace(/\s+Racing$/i, '')
    .trim();
}

/**
 * Normalize chassis names to handle variations
 */
function normalizeChassis(chassis: string): string {
  return chassis
    .replace(/^F1\s+/i, '')
    .replace(/\s+F1$/i, '')
    .trim();
}

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching F1 cars and models from Supabase...');

    // Fetch all F1 cars
    const { data: cars, error: carsError } = await supabase
      .from('cars')
      .select(`
        id,
        chassis_name,
        event_name,
        team:teams(name),
        season:seasons(year),
        driver:drivers(name)
      `)
      .order('id', { ascending: false });

    if (carsError) {
      throw new Error(`Failed to fetch cars: ${carsError.message}`);
    }

    console.log(`📊 Fetched ${cars?.length || 0} cars from database`);

    // Fetch all models with manufacturer data (driver comes from car now)
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select(`
        *,
        manufacturer:manufacturers(name)
      `);

    if (modelsError) {
      throw new Error(`Failed to fetch models: ${modelsError.message}`);
    }

    // Both paged. These drive what the admin believes is already linked, and a
    // plain .select() stops at 1000 rows without erroring -- which would show
    // linked models as unlinked and invite duplicate work.
    const ebayLinks = await selectAll<any>(supabase, 'ebay_links', '*');

    let priceHistory: any[] = [];
    try {
      priceHistory = await selectAll<any>(
        supabase,
        'price_history',
        '*, retailer:retailers(name)'
      );
    } catch (err: any) {
      console.warn('⚠️ Warning fetching price history:', err.message);
    }

    // Build a map of eBay links by model_id for quick lookup
    const ebayLinksMap = new Map();
    ebayLinks?.forEach((link) => {
      ebayLinksMap.set(link.model_id, link);
    });

    console.log(`📊 Fetched ${ebayLinks?.length || 0} eBay links`);
    if (ebayLinks && ebayLinks.length > 0) {
      console.log(`📊 eBay link model IDs:`, ebayLinks.map(l => l.model_id));
    }

    // Build a map of price history by model_id (array of prices per model)
    const priceHistoryMap = new Map();
    priceHistory?.forEach((price) => {
      if (!priceHistoryMap.has(price.model_id)) {
        priceHistoryMap.set(price.model_id, []);
      }
      priceHistoryMap.get(price.model_id).push(price);
    });

    // Build a map of models by car_id
    const modelsByCar = new Map();
    models?.forEach((model) => {
      if (!modelsByCar.has(model.car_id)) {
        modelsByCar.set(model.car_id, []);
      }
      modelsByCar.get(model.car_id).push(model);
    });

    console.log(`📊 Total models in database: ${models?.length || 0}`);
    if (models && models.length > 0) {
      console.log(`📊 Sample model IDs:`, models.slice(0, 5).map(m => m.id));
    }

    // Group cars by chassis (year + team + chassis_name)
    const chassisMap = new Map();

    cars?.forEach((car: any) => {
      const year = car.season?.year || 2024;
      const team = normalizeTeamName(car.team?.name || 'Unknown Team');
      const chassis = normalizeChassis(car.chassis_name || 'Unknown');
      const chassisKey = `${year}-${team}-${chassis}`;

      if (!chassisMap.has(chassisKey)) {
        chassisMap.set(chassisKey, {
          id: chassisKey,
          year,
          team,
          chassis,
          // The real car UUIDs behind this group. `id` above is a synthetic
          // "year-team-chassis" key for display only — sending it to an API
          // that expects a UUID fails with a Postgres 22P02. Cars with no
          // models contribute nothing to driverGroups, so this is also the
          // only place an empty car is visible to the client at all.
          carIds: [],
          driverGroups: new Map(), // Group by driver
        });
      }

      const chassisData = chassisMap.get(chassisKey);
      if (!chassisData.carIds.includes(car.id)) {
        chassisData.carIds.push(car.id);
      }

      // Get models for this car entry
      const carModels = modelsByCar.get(car.id) || [];

      // Group models by car's driver (from car.driver), not model.driver (doesn't exist anymore)
      carModels.forEach((model: any) => {
        const modelDriverName = car.driver?.name || 'Unknown Driver';

        if (!chassisData.driverGroups.has(modelDriverName)) {
          chassisData.driverGroups.set(modelDriverName, []);
        }

        const ebayLink = ebayLinksMap.get(model.id);
        const pricesForModel = priceHistoryMap.get(model.id) || [];

        if (ebayLink) {
          console.log(`✅ Model ${model.id} has eBay link:`, ebayLink.ebay_url);
        }

        chassisData.driverGroups.get(modelDriverName).push({
          id: model.id,
          name: `${model.manufacturer?.name || 'Unknown'} ${model.scale}`,
          manufacturer: model.manufacturer?.name || 'Unknown',
          scale: model.scale,
          // The driver was only ever used as the grouping key above, so
          // model.driver came back undefined on the client and the eBay
          // search ran without a driver name in it. DiecastModel has always
          // declared this field; nothing typed the response, so nothing said.
          driver: modelDriverName,
          // Needed by preJudge, which uses the chassis code as its sharpest
          // discriminator — an RB21 listing matches an RB19 target on every
          // other field.
          chassis: normalizeChassis(car.chassis_name || ''),
          eventName: car.event_name,
          sku: model.manufacturer_sku || '',
          // So the admin can say whether setting an image would REPLACE one
          // rather than just asking "set image?" and quietly overwriting.
          imageUrl: model.image_url || null,
          discoveredFrom: model.discovered_from || null,
          price: model.price || null,
          ebayLinked: !!ebayLink,
          ebayUrl: ebayLink?.ebay_url,
          ebayPrice: ebayLink?.ebay_price,
          ebayTitle: ebayLink?.ebay_title,
          ebayImage: ebayLink?.ebay_image,
          lastUpdated: ebayLink?.last_updated,
          retailerPrices: pricesForModel.map((price: any) => ({
            // The price_history row id. Without it the per-row refresh button
            // sent priceHistoryId: undefined and silently refreshed every
            // retailer on the model instead of the one that was clicked.
            id: price.id,
            retailerId: price.retailer_id,
            retailerName: price.retailer?.name,
            productUrl: price.product_url,
            price: price.price,
            currency: price.currency,
            priceAud: price.price_aud,
            inStock: price.in_stock,
            recordedAt: price.recorded_at,
          })),
        });
      });
    });

    // Convert to array format expected by frontend
    const f1Cars = Array.from(chassisMap.values()).map((chassis) => ({
      id: chassis.id,
      year: chassis.year,
      team: chassis.team,
      chassis: chassis.chassis,
      carIds: chassis.carIds,
      driverGroups: Array.from(chassis.driverGroups.entries()).map((entry: any) => ({
        driver: entry[0],
        models: entry[1],
      })),
    }));

    console.log(`✅ Loaded ${f1Cars.length} cars with ${models?.length || 0} total models`);

    return NextResponse.json({
      success: true,
      cars: f1Cars,
    });

  } catch (error: any) {
    console.error('❌ Error fetching F1 data:', error.message);

    return NextResponse.json(
      {
        error: 'Failed to fetch F1 data',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
