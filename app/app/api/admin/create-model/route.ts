import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('📥 Received request body:', JSON.stringify(body, null, 2));

    const {
      manufacturer,
      scale,
      driver,
      eventName,
      sku,
      carId,
      inventoryItemId,
      ebayUrl,
      ebayPrice,
      ebayImageUrl,
    } = body;

    // Validate required fields
    if (!manufacturer || !scale || !driver || !carId) {
      console.log('❌ Missing required fields:', { manufacturer, scale, driver, carId });
      return NextResponse.json(
        { error: 'Missing required fields: manufacturer, scale, driver, carId' },
        { status: 400 }
      );
    }

    console.log(`➕ Creating new model: ${manufacturer} ${scale} ${driver}`);

    // The carId from frontend is synthetic (year-team-chassis), we need to find actual car ID
    // Parse the synthetic ID to extract year, team, chassis
    const [year, ...rest] = carId.split('-');
    const chassis = rest.pop(); // Last part is chassis
    const team = rest.join('-'); // Middle parts are team name

    console.log(`🔍 Looking for car: year=${year}, team=${team}, chassis=${chassis}`);

    // Find a matching car in the database
    const { data: matchingCars, error: carSearchError } = await supabase
      .from('cars')
      .select('id, livery_name, team:teams(name), season:seasons(year)')
      .limit(100);

    if (carSearchError) {
      console.error('❌ Error finding car:', carSearchError);
      return NextResponse.json(
        { error: 'Failed to find matching car', details: carSearchError.message },
        { status: 500 }
      );
    }

    // Find the first car that matches our criteria
    const matchingCar = matchingCars?.find((car) => {
      const carYear = car.season?.year?.toString();
      const carTeam = car.team?.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const carChassis = car.livery_name?.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetTeam = team.toLowerCase().replace(/[^a-z0-9]/g, '');
      const targetChassis = chassis.toLowerCase().replace(/[^a-z0-9]/g, '');

      return carYear === year && carTeam?.includes(targetTeam) && carChassis?.includes(targetChassis);
    });

    if (!matchingCar) {
      console.error('❌ No matching car found in database for:', { year, team, chassis });
      return NextResponse.json(
        { error: `No car found for ${year} ${team} ${chassis}` },
        { status: 404 }
      );
    }

    const actualCarId = matchingCar.id;
    console.log(`✅ Found matching car ID: ${actualCarId}`);

    // First, find or create the manufacturer
    let manufacturerId = null;

    // Check if manufacturer exists
    const { data: existingManufacturer } = await supabase
      .from('manufacturers')
      .select('id')
      .ilike('name', manufacturer)
      .single();

    if (existingManufacturer) {
      manufacturerId = existingManufacturer.id;
      console.log(`✅ Found existing manufacturer: ${manufacturer} (${manufacturerId})`);
    } else {
      // Create new manufacturer
      const { data: newManufacturer, error: mfgError } = await supabase
        .from('manufacturers')
        .insert({ name: manufacturer })
        .select('id')
        .single();

      if (mfgError) {
        console.error('❌ Error creating manufacturer:', mfgError);
        return NextResponse.json(
          { error: 'Failed to create manufacturer', details: mfgError.message },
          { status: 500 }
        );
      }

      manufacturerId = newManufacturer.id;
      console.log(`✅ Created new manufacturer: ${manufacturer} (${manufacturerId})`);
    }

    // Clean the price - remove currency symbols and convert to number
    let cleanPrice = null;
    if (ebayPrice) {
      const priceStr = ebayPrice.replace(/[^0-9.]/g, ''); // Remove everything except numbers and decimal
      const priceNum = parseFloat(priceStr);
      if (!isNaN(priceNum)) {
        cleanPrice = priceNum;
      }
    }

    // Insert the new model into the models table (id will be auto-generated as UUID)
    const { data: newModel, error: insertError } = await supabase
      .from('models')
      .insert({
        car_id: actualCarId,
        manufacturer_id: manufacturerId,
        manufacturer_sku: sku || null,
        scale,
        price: cleanPrice,
        discovered_from: 'admin_manual',
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating model:', insertError);
      console.error('❌ Error details:', JSON.stringify(insertError, null, 2));
      return NextResponse.json(
        { error: 'Failed to create model', details: insertError.message, code: insertError.code },
        { status: 500 }
      );
    }

    const modelId = newModel.id;
    console.log('✅ Model created successfully:', modelId);

    // If there's an eBay URL, create an eBay link
    if (ebayUrl) {
      console.log('🔗 Creating eBay link for new model');

      const { error: ebayLinkError } = await supabase
        .from('ebay_links')
        .insert({
          model_id: modelId,
          ebay_url: ebayUrl,
          ebay_price: ebayPrice || null,
          ebay_image: ebayImageUrl || null,
        });

      if (ebayLinkError) {
        console.error('⚠️ Failed to create eBay link:', ebayLinkError);
        // Don't fail the whole request if eBay link fails
      } else {
        console.log('✅ eBay link created');
      }
    }

    // If there's an inventory item, link it to the new model
    if (inventoryItemId) {
      console.log(`🔗 Linking inventory item ${inventoryItemId} to new model`);

      const { error: linkError } = await supabase
        .from('listing_inventory')
        .update({
          status: 'linked',
          searched_model_id: modelId,
        })
        .eq('id', inventoryItemId);

      if (linkError) {
        console.error('⚠️ Failed to link inventory item:', linkError);
        // Don't fail the whole request if linking fails
      } else {
        console.log('✅ Inventory item linked to new model');
      }
    }

    return NextResponse.json({
      success: true,
      model: newModel,
    });
  } catch (error: any) {
    console.error('❌ Error in create-model API:', error);
    return NextResponse.json(
      { error: 'Failed to create model', details: error.message },
      { status: 500 }
    );
  }
}
