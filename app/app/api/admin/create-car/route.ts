import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { eventMatches, chassisMatches } from '@/lib/eventName';
import { resolveDriver } from '@/lib/driverName';
import { buildCarSlug } from '@/lib/carSlug';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CAR_SELECT = `
  id,
  chassis_name,
  event_name,
  driver_id,
  team:teams(id, name),
  season:seasons(id, year),
  driver:drivers(id, name)
`;

// Normalize chassis names to prevent duplicates
// "Mercedes-AMG W13 E" → "W13"
// "Mercedes-AMG W13 E Performance" → "W13"
function normalizeChassis(chassis: string): string {
  if (!chassis) return chassis;

  return chassis
    .replace(/Mercedes-AMG\s+/i, '')
    .replace(/\s+E\s+Performance/i, '')
    .replace(/\s+E$/i, '')
    .replace(/F1\s+/i, '')
    .trim();
}

export async function POST(request: Request) {
  try {
    const { year, team, chassis, driver, eventName } = await request.json();

    if (!year || !team) {
      return NextResponse.json(
        { error: 'Year and team are required' },
        { status: 400 }
      );
    }

    // A car IS the tuple (season, team, chassis, driver, event). Creating one
    // without a driver or event writes NULLs into the composite key — and
    // Postgres treats NULLs as distinct, so the UNIQUE constraint would not
    // stop it duplicating a car that already exists.
    if (!driver || !eventName) {
      return NextResponse.json(
        {
          error: 'Driver and event name are required to create a car',
          details:
            'A car is uniquely identified by season + team + chassis + driver + event. ' +
            'Creating one without a driver or event would duplicate existing cars.',
        },
        { status: 400 }
      );
    }

    if (!chassis) {
      return NextResponse.json(
        { error: 'Chassis is required to create a car' },
        { status: 400 }
      );
    }

    console.log(`🏗️ Creating car: ${year} ${team} ${chassis} - ${eventName} - ${driver}`);

    // Step 1: Create or get season
    let { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, year')
      .eq('year', parseInt(year))
      .maybeSingle();

    if (seasonError) {
      throw new Error(`Season lookup failed: ${seasonError.message}`);
    }

    if (!season) {
      console.log(`📅 Creating season ${year}...`);
      const { data: newSeason, error: createSeasonError } = await supabase
        .from('seasons')
        .insert({ year: parseInt(year) })
        .select('id, year')
        .single();

      if (createSeasonError) {
        throw new Error(`Failed to create season: ${createSeasonError.message}`);
      }
      season = newSeason;
      console.log(`✅ Created season ${year}`);
    }

    // Step 2: Create or get team
    const { data: teams, error: teamSearchError } = await supabase
      .from('teams')
      .select('id, name')
      .ilike('name', `%${team}%`);

    if (teamSearchError) {
      throw new Error(`Team lookup failed: ${teamSearchError.message}`);
    }

    let teamId: string;
    if (!teams || teams.length === 0) {
      console.log(`🏁 Creating team ${team}...`);
      const { data: newTeam, error: createTeamError } = await supabase
        .from('teams')
        .insert({ name: team })
        .select('id, name')
        .single();

      if (createTeamError) {
        throw new Error(`Failed to create team: ${createTeamError.message}`);
      }
      teamId = newTeam.id;
      console.log(`✅ Created team ${team}`);
    } else {
      teamId = teams[0].id;
    }

    // Step 3: Create or get driver.
    // resolveDriver folds accents and trims before matching — an ilike misses
    // on "Sergio Pérez" vs "Sergio Perez" and then creates a second row,
    // splitting one driver's cars across two identities.
    const resolvedDriver = await resolveDriver(supabase, driver);
    if (!resolvedDriver) {
      return NextResponse.json({ error: 'Driver name is empty' }, { status: 400 });
    }

    const driverId = resolvedDriver.id;
    if (resolvedDriver.created) {
      console.log(`✅ Created driver ${resolvedDriver.name}`);
    } else if (resolvedDriver.name !== driver) {
      console.log(`🔗 Driver "${driver}" → existing "${resolvedDriver.name}"`);
    }

    const normalizedChassis = normalizeChassis(chassis);
    console.log(`📝 Normalized chassis: "${chassis}" → "${normalizedChassis}"`);

    // Step 4: Don't create what already exists. The unique constraint is exact,
    // but incoming event/chassis strings are fuzzy ("Spanish GP Winner",
    // "SF-24" vs "SF24"), so match leniently before inserting.
    const { data: siblings, error: siblingError } = await supabase
      .from('cars')
      .select(CAR_SELECT)
      .eq('season_id', season.id)
      .eq('team_id', teamId)
      .eq('driver_id', driverId);

    if (siblingError) {
      throw new Error(`Duplicate check failed: ${siblingError.message}`);
    }

    const duplicate = (siblings || []).find(
      (car: any) =>
        eventMatches(car.event_name, eventName) &&
        chassisMatches(car.chassis_name, normalizedChassis)
    );

    if (duplicate) {
      console.log(`♻️ Car already exists (${duplicate.id}) — returning it instead of creating`);
      return NextResponse.json({
        success: true,
        car: duplicate,
        existed: true,
        message: `Car already existed: ${year} ${team} ${duplicate.chassis_name} - ${duplicate.event_name} - ${driver}`,
      });
    }

    // Step 5: Create car.
    // The slug is set at creation, not backfilled later — otherwise every new
    // car ships with slug: null and falls back to a UUID URL until someone
    // notices. The column has a unique index, so a genuine collision surfaces
    // here as 23505 rather than producing two cars fighting over one URL.
    const { data: car, error: carError } = await supabase
      .from('cars')
      .insert({
        season_id: season.id,
        team_id: teamId,
        chassis_name: normalizedChassis,
        driver_id: driverId,
        event_name: eventName,
        slug: buildCarSlug({
          year,
          team: teams?.[0]?.name || team,
          chassis: normalizedChassis,
          driver: resolvedDriver.name,
          event: eventName,
        }),
      })
      .select(CAR_SELECT)
      .single();

    if (carError) {
      throw new Error(`Failed to create car: ${carError.message}`);
    }

    console.log(`✅ Created car: ${year} ${team} ${normalizedChassis} - ${eventName} - ${driver}`);

    return NextResponse.json({
      success: true,
      car,
      existed: false,
      message: `Created ${year} ${team} ${normalizedChassis} - ${eventName} - ${driver}`,
    });
  } catch (error: any) {
    console.error('❌ Error creating car:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
