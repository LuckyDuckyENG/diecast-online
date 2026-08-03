import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { eventMatches } from '@/lib/eventName';
import { driverMatches } from '@/lib/driverName';
import { attachRetailerLink } from '@/lib/retailerLink';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);



// Parsers return these when a listing doesn't name the maker. Creating a
// manufacturer row from one pollutes the table permanently.
const PLACEHOLDER_MANUFACTURERS = ['unknown', 'n/a', 'na', 'none', 'null', 'tbd', ''];

const isPlaceholder = (name?: string) =>
  !name || PLACEHOLDER_MANUFACTURERS.includes(name.trim().toLowerCase());

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
      price, // Price from Smart Paste
      currency, // Currency from Smart Paste
      retailerUrl, // Retailer URL from Smart Paste
      imageUrl, // Image URL from Smart Paste
    } = body;

    const parsedPrice = (() => {
      const raw = price ?? ebayPrice;
      if (raw === undefined || raw === null) return null;
      const n = parseFloat(raw.toString().replace(/[^0-9.]/g, ''));
      return isNaN(n) ? null : n;
    })();

    // ---------------------------------------------------------------------
    // The catalogue was seeded from CSV, so most pastes are a retailer link
    // for a model that ALREADY exists. Check the SKU before anything else —
    // and check it globally, since manufacturer_sku is unique on its own.
    // ---------------------------------------------------------------------
    if (sku) {
      const { data: existing, error: existingError } = await supabase
        .from('models')
        .select(`
          id, manufacturer_sku, scale, price, image_url,
          manufacturer:manufacturers(id, name),
          car:cars(id, chassis_name, event_name, driver:drivers(name), season:seasons(year))
        `)
        .eq('manufacturer_sku', sku)
        .maybeSingle();

      if (existingError) {
        throw new Error(`SKU lookup failed: ${existingError.message}`);
      }

      if (existing) {
        const car = existing.car as any;
        const carDriver = car?.driver?.name as string | undefined;
        console.log(
          `♻️ SKU ${sku} already exists → ${(existing.manufacturer as any)?.name} ` +
          `${existing.scale} on ${car?.chassis_name} / ${car?.event_name} / ${carDriver}`
        );

        // Guard against linking a retailer page to the wrong product
        if (driver && carDriver && !driverMatches(driver, carDriver)) {
          return NextResponse.json(
            {
              error: 'SKU belongs to a different driver',
              details:
                `SKU ${sku} is already registered to ${carDriver} ` +
                `(${car?.chassis_name} - ${car?.event_name}), but this listing says ${driver}. ` +
                `Check the SKU on the retailer page before linking.`,
            },
            { status: 409 }
          );
        }

        if (eventName && car?.event_name && !eventMatches(car.event_name, eventName)) {
          return NextResponse.json(
            {
              error: 'SKU belongs to a different event',
              details:
                `SKU ${sku} is already registered to "${car.event_name}", but this listing ` +
                `says "${eventName}". Check the SKU on the retailer page before linking.`,
            },
            { status: 409 }
          );
        }

        // A retailer link was requested but there's no usable price. Say so —
        // returning success here means the UI reports "added" while nothing was
        // written, and the car never appears on the site.
        if (retailerUrl && parsedPrice === null) {
          console.log(`⚠️ No price for ${sku} — refusing to report success`);
          return NextResponse.json(
            {
              error: 'No price found on that listing',
              details:
                `The model ${sku} exists, but no price could be read from the page — ` +
                `sold-out listings often don't show one. Nothing was linked. ` +
                `Enter the price manually to add this retailer.`,
              needsPrice: true,
              modelId: existing.id,
              model: existing,
            },
            { status: 422 }
          );
        }

        // Same product — attach the retailer link instead of failing
        let linkResult = null;
        if (retailerUrl) {
          linkResult = await attachRetailerLink(supabase, {
            modelId: existing.id,
            retailerUrl,
            price: parsedPrice as number,
            currency,
          });

          if (!linkResult.ok) {
            return NextResponse.json(
              {
                error: 'Could not link that retailer',
                details: linkResult.reason,
                modelId: existing.id,
              },
              { status: 422 }
            );
          }
        }

        // Backfill image only if we don't already have one
        if (imageUrl && !existing.image_url) {
          await supabase.from('models').update({ image_url: imageUrl }).eq('id', existing.id);
          console.log(`🖼️ Backfilled image for ${sku}`);
        }

        return NextResponse.json({
          success: true,
          existed: true,
          model: existing,
          retailerLink: linkResult,
          message: linkResult?.ok
            ? `${linkResult.updated ? 'Updated' : 'Linked'} ${linkResult.retailerName} for existing model ${sku}`
            : `Model ${sku} already existed`,
        });
      }
    }

    // ---------------------------------------------------------------------
    // Genuinely new model from here on
    // ---------------------------------------------------------------------

    // Validate required fields
    if (!manufacturer || !scale || !driver || !carId) {
      console.log('❌ Missing required fields:', { manufacturer, scale, driver, carId });
      return NextResponse.json(
        { error: 'Missing required fields: manufacturer, scale, driver, carId' },
        { status: 400 }
      );
    }

    if (isPlaceholder(manufacturer)) {
      return NextResponse.json(
        {
          error: 'Manufacturer could not be identified',
          details:
            `The listing didn't name a manufacturer (got "${manufacturer}"). ` +
            `Set it manually — Spark, Minichamps, Looksmart, Bburago, GP Replicas, BBR, ` +
            `Amalgam or Solido — rather than creating a placeholder.`,
          needsManufacturer: true,
        },
        { status: 400 }
      );
    }

    console.log(`➕ Creating new model: ${manufacturer} ${scale} ${driver}`);

    // Check if carId is already a UUID (from Smart Paste) or synthetic ID (from old manual form)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(carId);

    let actualCarId;

    if (isUUID) {
      // Already a UUID, use it directly
      actualCarId = carId;
      console.log(`✅ Using provided car UUID: ${actualCarId}`);
    } else {
      // Synthetic ID (year-team-chassis), need to find actual car ID
      const [year, ...rest] = carId.split('-');
      const chassis = rest.pop(); // Last part is chassis
      const team = rest.join('-'); // Middle parts are team name

      console.log(`🔍 Looking for car: year=${year}, team=${team}, chassis=${chassis}`);

      // Find a matching car in the database
      const { data: matchingCars, error: carSearchError } = await supabase
        .from('cars')
        .select('id, chassis_name, team:teams(name), season:seasons(year)')
        .limit(100);

      if (carSearchError) {
        console.error('❌ Error finding car:', carSearchError);
        return NextResponse.json(
          { error: 'Failed to find matching car', details: carSearchError.message },
          { status: 500 }
        );
      }

      // Find the first car that matches our criteria
      const matchingCar = matchingCars?.find((car: any) => {
        const carYear = car.season?.year?.toString();
        const carTeam = car.team?.name?.toLowerCase().replace(/[^a-z0-9]/g, '');
        const carChassis = car.chassis_name?.toLowerCase().replace(/[^a-z0-9]/g, '');
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

      actualCarId = matchingCar.id;
      console.log(`✅ Found matching car ID: ${actualCarId}`);
    }

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

    // The driver and event belong to the CAR, not the model. Don't write them
    // here — instead verify the incoming values agree with the car we resolved.
    // A mismatch means the wrong car was picked, and silently attaching the
    // model would recreate the mixed-driver/mixed-event data we cleaned up.
    const { data: targetCar, error: targetCarError } = await supabase
      .from('cars')
      .select('id, chassis_name, event_name, driver:drivers(name), season:seasons(year), team:teams(name)')
      .eq('id', actualCarId)
      .maybeSingle();

    if (targetCarError) {
      return NextResponse.json(
        { error: 'Failed to load target car', details: targetCarError.message },
        { status: 500 }
      );
    }

    if (!targetCar) {
      return NextResponse.json(
        { error: `Car ${actualCarId} does not exist` },
        { status: 404 }
      );
    }

    const carDriverName = (targetCar.driver as any)?.name as string | undefined;

    if (driver && carDriverName) {
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (norm(carDriverName) !== norm(driver)) {
        console.error(
          `❌ Driver mismatch: model says "${driver}", car ${actualCarId} is "${carDriverName}"`
        );
        return NextResponse.json(
          {
            error: 'Driver mismatch',
            details:
              `This model is for ${driver}, but the selected car belongs to ${carDriverName} ` +
              `(${(targetCar.season as any)?.year} ${(targetCar.team as any)?.name} ` +
              `${targetCar.chassis_name} - ${targetCar.event_name}). ` +
              `Pick the car for ${driver} instead.`,
            carDriver: carDriverName,
          },
          { status: 409 }
        );
      }
    }

    // Event is part of the car's identity too — a mismatch means the wrong car
    // was selected. Attaching anyway is how models from different races end up
    // merged under one car.
    if (eventName && targetCar.event_name && !eventMatches(targetCar.event_name, eventName)) {
      console.error(
        `❌ Event mismatch: model says "${eventName}", car is "${targetCar.event_name}"`
      );
      return NextResponse.json(
        {
          error: 'Event mismatch',
          details:
            `This listing is for "${eventName}", but the selected car is ` +
            `"${targetCar.event_name}" (${(targetCar.season as any)?.year} ` +
            `${(targetCar.team as any)?.name} ${targetCar.chassis_name} - ${carDriverName}). ` +
            `Pick the "${eventName}" car instead.`,
          carEvent: targetCar.event_name,
        },
        { status: 409 }
      );
    }

    console.log(
      `✅ Car verified: ${targetCar.chassis_name} - ${targetCar.event_name} - ${carDriverName}`
    );

    // Clean the price - remove currency symbols and convert to number
    let cleanPrice = null;
    const priceToUse = price || ebayPrice; // Use price from Smart Paste, or ebayPrice from eBay linking
    if (priceToUse) {
      const priceStr = priceToUse.toString().replace(/[^0-9.]/g, ''); // Remove everything except numbers and decimal
      const priceNum = parseFloat(priceStr);
      if (!isNaN(priceNum)) {
        cleanPrice = priceNum;
      }
    }

    // Check if a model with this SKU already exists.
    // Driver/event now live on the car, so read them through the join.
    if (sku) {
      const { data: duplicateModel } = await supabase
        .from('models')
        .select(
          'id, manufacturer_sku, scale, manufacturer:manufacturers(name), car:cars(event_name, driver:drivers(name))'
        )
        .eq('manufacturer_sku', sku)
        .eq('manufacturer_id', manufacturerId)
        .maybeSingle();

      if (duplicateModel) {
        console.log('⚠️ Duplicate SKU found:', duplicateModel);
        return NextResponse.json(
          {
            error: `A model with SKU "${sku}" already exists for this manufacturer`,
            duplicate: true,
            duplicateModel: {
              id: duplicateModel.id,
              sku: duplicateModel.manufacturer_sku,
              manufacturer: (duplicateModel.manufacturer as any)?.name,
              scale: duplicateModel.scale,
              driver: ((duplicateModel.car as any)?.driver)?.name,
              eventName: (duplicateModel.car as any)?.event_name,
            },
          },
          { status: 400 }
        );
      }
    }

    // Insert the new model into the models table (id will be auto-generated as UUID)
    const { data: newModel, error: insertError } = await supabase
      .from('models')
      .insert({
        // driver and event are NOT stored here — they belong to the car
        // (migration 007 dropped models.driver_id and models.event_name)
        car_id: actualCarId,
        manufacturer_id: manufacturerId,
        manufacturer_sku: sku || null,
        scale,
        price: cleanPrice,
        image_url: imageUrl || null,
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
    if (imageUrl) {
      console.log('🖼️ Image URL saved:', imageUrl);
    }

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

    // If there's a retailer URL (from Smart Paste), create retailer link
    let linkResult = null;
    if (retailerUrl) {
      linkResult = cleanPrice
        ? await attachRetailerLink(supabase, {
            modelId,
            retailerUrl,
            price: cleanPrice,
            currency,
          })
        : { ok: false, reason: 'No price could be read from that listing' };

      if (!linkResult.ok) {
        // The model WAS created — report partial success rather than a bare
        // success, so the operator knows the link still needs doing.
        console.error('⚠️ Retailer link failed:', linkResult.reason);
        return NextResponse.json({
          success: true,
          existed: false,
          linkFailed: true,
          needsPrice: !cleanPrice,
          model: newModel,
          message: `Model created, but no retailer was linked: ${linkResult.reason}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      existed: false,
      model: newModel,
      retailerLink: linkResult,
    });
  } catch (error: any) {
    console.error('❌ Error in create-model API:', error);
    return NextResponse.json(
      { error: 'Failed to create model', details: error.message },
      { status: 500 }
    );
  }
}
