import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching F1 cars and models from Supabase...');

    // Fetch all F1 cars
    const { data: cars, error: carsError } = await supabase
      .from('f1_cars')
      .select('*')
      .order('year', { ascending: false });

    if (carsError) {
      throw new Error(`Failed to fetch cars: ${carsError.message}`);
    }

    // Fetch all models
    const { data: models, error: modelsError } = await supabase
      .from('diecast_models')
      .select('*');

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

    // Build a map of eBay links by model_id for quick lookup
    const ebayLinksMap = new Map();
    ebayLinks?.forEach((link) => {
      ebayLinksMap.set(link.model_id, link);
    });

    // Build a map of models by car_id
    const modelsByCar = new Map();
    models?.forEach((model) => {
      if (!modelsByCar.has(model.car_id)) {
        modelsByCar.set(model.car_id, []);
      }
      modelsByCar.get(model.car_id).push(model);
    });

    // Combine cars with their models and eBay links
    const f1Cars = cars?.map((car) => {
      const carModels = modelsByCar.get(car.id) || [];

      const modelsWithEbayLinks = carModels.map((model) => {
        const ebayLink = ebayLinksMap.get(model.id);

        return {
          id: model.id,
          name: model.name,
          manufacturer: model.manufacturer,
          scale: model.scale,
          driver: model.driver,
          eventName: model.event_name,
          sku: model.sku,
          ebayLinked: !!ebayLink,
          ebayUrl: ebayLink?.ebay_url,
          ebayPrice: ebayLink?.ebay_price,
          ebayTitle: ebayLink?.ebay_title,
          ebayImage: ebayLink?.ebay_image,
          lastUpdated: ebayLink?.last_updated,
        };
      });

      return {
        id: car.id,
        year: car.year,
        team: car.team,
        chassis: car.chassis,
        drivers: car.drivers,
        models: modelsWithEbayLinks,
      };
    }) || [];

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
