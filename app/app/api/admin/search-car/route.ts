import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { eventMatches, chassisMatches } from '@/lib/eventName';
import { pickTeam } from '@/lib/teamName';

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

export async function POST(request: Request) {
  try {
    const { year, team, driver, eventName, chassis } = await request.json();

    if (!year || !team) {
      return NextResponse.json(
        { error: 'Year and team are required' },
        { status: 400 }
      );
    }

    console.log(
      `🔍 Searching for car: ${year} ${team} - ${chassis || 'any chassis'} - ${eventName || 'any event'} - ${driver || 'any driver'}`
    );

    // First, find the season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, year')
      .eq('year', parseInt(year))
      .maybeSingle();

    if (seasonError) {
      throw new Error(`Season lookup failed: ${seasonError.message}`);
    }

    if (!season) {
      console.log(`⚠️ Season ${year} not found`);
      return NextResponse.json({
        success: false,
        message: `Season ${year} not found. Would you like to create it?`,
      });
    }

    // Resolve the team by canonical name, not substring. Retailers write
    // "Oracle Red Bull Racing" / "Williams Racing" where we store "Red Bull
    // Racing" / "Williams", and an ilike on the longer parsed name never
    // matched the shorter stored one.
    const { data: teams, error: teamError } = await supabase
      .from('teams')
      .select('id, name');

    if (teamError) {
      throw new Error(`Team lookup failed: ${teamError.message}`);
    }

    // Rank duplicate team rows by how many cars actually reference them, so a
    // junk row can never win over the real one.
    const { data: allCarTeams } = await supabase.from('cars').select('team_id');
    const carCountByTeam = new Map<string, number>();
    (allCarTeams || []).forEach((c: any) => {
      if (c.team_id) carCountByTeam.set(c.team_id, (carCountByTeam.get(c.team_id) || 0) + 1);
    });

    const matchedTeam = pickTeam(teams || [], team, carCountByTeam);

    if (!matchedTeam) {
      console.log(`⚠️ Team "${team}" not recognised`);
      return NextResponse.json({
        success: false,
        message: `Team "${team}" not recognised. Would you like to create it?`,
      });
    }

    if (matchedTeam.name.trim().toLowerCase() !== team.trim().toLowerCase()) {
      console.log(`🔗 Team "${team}" → "${matchedTeam.name}"`);
    }

    // Search for ALL cars with this season and team
    const { data: cars, error: carError } = await supabase
      .from('cars')
      .select(CAR_SELECT)
      .eq('season_id', season.id)
      .eq('team_id', matchedTeam.id);

    // A query failure is NOT "no car found" — surface it instead of falling
    // through to car creation, which would duplicate an existing car.
    if (carError) {
      throw new Error(`Car lookup failed: ${carError.message}`);
    }

    if (!cars || cars.length === 0) {
      console.log(`⚠️ No cars exist for ${year} ${matchedTeam.name}`);
      return NextResponse.json({
        success: false,
        message: `No car found for ${year} ${matchedTeam.name}. Would you like to create it?`,
        seasonId: season.id,
        teamId: matchedTeam.id,
      });
    }

    // Resolve driver name -> id (drivers are on the car directly under Pattern 2)
    let driverId: string | null = null;
    if (driver) {
      const { data: driverData } = await supabase
        .from('drivers')
        .select('id')
        .ilike('name', driver)
        .maybeSingle();
      driverId = driverData?.id ?? null;

      if (!driverId) {
        console.log(`⚠️ Driver "${driver}" not found in database`);
      }
    }

    let matchedCar: any = null;

    // Strategy 1: event + driver (most specific — this is the composite key)
    if (eventName && driverId) {
      matchedCar =
        cars.find(
          (car: any) =>
            car.driver_id === driverId && eventMatches(car.event_name, eventName)
        ) || null;
      if (matchedCar) {
        console.log(`✅ Matched by event + driver: ${matchedCar.event_name} / ${matchedCar.driver?.name}`);
      }
    }

    // Strategy 1b: event only
    if (!matchedCar && eventName && !driverId) {
      const candidates = cars.filter((car: any) => eventMatches(car.event_name, eventName));
      if (candidates.length === 1) {
        matchedCar = candidates[0];
        console.log(`✅ Matched by event: ${matchedCar.event_name}`);
      } else if (candidates.length > 1) {
        // Ambiguous without a driver — don't guess, and don't let the caller
        // create a duplicate either.
        console.log(`⚠️ ${candidates.length} cars match event "${eventName}" — driver required`);
        return NextResponse.json({
          success: false,
          ambiguous: true,
          message: `${candidates.length} cars match "${eventName}" for ${year} ${matchedTeam.name}. Specify a driver.`,
          candidates: candidates.map((c: any) => ({
            id: c.id,
            chassis_name: c.chassis_name,
            event_name: c.event_name,
            driver: c.driver?.name,
          })),
          seasonId: season.id,
          teamId: matchedTeam.id,
        });
      }
    }

    // If an event WAS supplied but nothing matched it, stop here. Falling back
    // to chassis or "the only car" would silently return a different race —
    // e.g. asking for Brazil and getting Bahrain because both are RB20s.
    if (eventName && !matchedCar) {
      const candidates = cars.filter((car: any) => !driverId || car.driver_id === driverId);
      console.log(
        `⚠️ Event "${eventName}" did not match any of ${candidates.length} car(s) for ` +
        `${driver || 'any driver'} — refusing to guess`
      );
      return NextResponse.json({
        success: false,
        eventUnmatched: true,
        message:
          `No car matches event "${eventName}" for ${driver || year + ' ' + matchedTeam.name}. ` +
          `Pick the right event below, or create the car if it's genuinely new.`,
        seasonId: season.id,
        teamId: matchedTeam.id,
        existing: candidates.map((c: any) => ({
          id: c.id,
          chassis_name: c.chassis_name,
          event_name: c.event_name,
          driver: c.driver?.name,
        })),
      });
    }

    // Strategy 2: chassis + driver, only when no event was given to go on
    if (!matchedCar && chassis && driverId) {
      const chassisHits = cars.filter(
        (car: any) => car.driver_id === driverId && chassisMatches(car.chassis_name, chassis)
      );
      // Only safe when it's unambiguous — one chassis, one driver, one car
      if (chassisHits.length === 1) {
        matchedCar = chassisHits[0];
        console.log(`✅ Matched by chassis + driver: ${matchedCar.chassis_name}`);
      } else if (chassisHits.length > 1) {
        console.log(`⚠️ ${chassisHits.length} cars share chassis ${chassis} + ${driver} — need an event`);
        return NextResponse.json({
          success: false,
          ambiguous: true,
          message:
            `${chassisHits.length} cars share ${chassis} for ${driver}. Specify which event.`,
          seasonId: season.id,
          teamId: matchedTeam.id,
          existing: chassisHits.map((c: any) => ({
            id: c.id,
            chassis_name: c.chassis_name,
            event_name: c.event_name,
            driver: c.driver?.name,
          })),
        });
      }
    }

    // Strategy 3: only one car for this team/year
    if (!matchedCar && cars.length === 1) {
      matchedCar = cars[0];
      console.log(`✅ Single car for ${year} ${matchedTeam.name}: ${matchedCar.chassis_name}`);
    }

    if (!matchedCar) {
      console.log(`⚠️ No match for ${chassis || eventName} - ${year} ${matchedTeam.name}`);
      return NextResponse.json({
        success: false,
        message: `No car found for ${eventName || chassis} - ${year} ${matchedTeam.name}. Would you like to create it?`,
        seasonId: season.id,
        teamId: matchedTeam.id,
        // Help the operator see what *does* exist before creating a duplicate
        existing: cars.map((c: any) => ({
          id: c.id,
          chassis_name: c.chassis_name,
          event_name: c.event_name,
          driver: c.driver?.name,
        })),
      });
    }

    console.log(
      `✅ Found car: ${matchedCar.season?.year} ${matchedCar.team?.name} ${matchedCar.chassis_name} - ${matchedCar.event_name} - ${matchedCar.driver?.name}`
    );

    return NextResponse.json({
      success: true,
      car: matchedCar,
    });
  } catch (error: any) {
    console.error('❌ Error searching for car:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
