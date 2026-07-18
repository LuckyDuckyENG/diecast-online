import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        livery_name,
        event_name,
        team:teams(name),
        season:seasons(year),
        car_drivers(
          driver:drivers(name)
        )
      `)
      .order('id', { ascending: false });

    if (carsError) {
      throw new Error(`Failed to fetch cars: ${carsError.message}`);
    }

    console.log(`📊 Fetched ${cars?.length || 0} cars from database`);

    // Fetch all models with manufacturer data
    const { data: models, error: modelsError } = await supabase
      .from('models')
      .select(`
        *,
        manufacturer:manufacturers(name)
      `);

    if (modelsError) {
      throw new Error(`Failed to fetch models: ${modelsError.message}`);
    }

    // Fetch all eBay links
    const { data: ebayLinks, error: ebayLinksError } = await supabase
      .from('ebay_links')
      .select('*');

    if (ebayLinksError) {
      throw new Error(`Failed to fetch eBay links: ${ebayLinksError.message}`);
    }

    // Fetch all retailer price history (this is what frontend uses!)
    const { data: priceHistory, error: priceHistoryError } = await supabase
      .from('price_history')
      .select('*, retailer:retailers(name)');

    if (priceHistoryError) {
      console.warn('⚠️ Warning fetching price history:', priceHistoryError.message);
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

    // Group cars by chassis (year + team + livery_name)
    const chassisMap = new Map();

    cars?.forEach((car: any) => {
      const year = car.season?.year || 2024;
      const team = normalizeTeamName(car.team?.name || 'Unknown Team');
      const chassis = normalizeChassis(car.livery_name || 'Unknown');
      const chassisKey = `${year}-${team}-${chassis}`;

      if (!chassisMap.has(chassisKey)) {
        chassisMap.set(chassisKey, {
          id: chassisKey,
          year,
          team,
          chassis,
          driverGroups: new Map(), // Group by driver
        });
      }

      const chassisData = chassisMap.get(chassisKey);
      const driverName = car.car_drivers?.[0]?.driver?.name || 'Unknown Driver';

      // Get models for this car entry
      const carModels = modelsByCar.get(car.id) || [];

      if (!chassisData.driverGroups.has(driverName)) {
        chassisData.driverGroups.set(driverName, []);
      }

      // Add models to this driver's group
      carModels.forEach((model: any) => {
        const ebayLink = ebayLinksMap.get(model.id);
        const pricesForModel = priceHistoryMap.get(model.id) || [];

        if (ebayLink) {
          console.log(`✅ Model ${model.id} has eBay link:`, ebayLink.ebay_url);
        }

        chassisData.driverGroups.get(driverName).push({
          id: model.id,
          name: `${model.manufacturer?.name || 'Unknown'} ${model.scale}`,
          manufacturer: model.manufacturer?.name || 'Unknown',
          scale: model.scale,
          eventName: car.event_name,
          sku: model.manufacturer_sku || '',
          discoveredFrom: model.discovered_from || null,
          price: model.price || null,
          ebayLinked: !!ebayLink,
          ebayUrl: ebayLink?.ebay_url,
          ebayPrice: ebayLink?.ebay_price,
          ebayTitle: ebayLink?.ebay_title,
          ebayImage: ebayLink?.ebay_image,
          lastUpdated: ebayLink?.last_updated,
          retailerPrices: pricesForModel.map((price: any) => ({
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
