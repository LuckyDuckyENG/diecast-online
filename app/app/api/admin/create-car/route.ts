import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { year, team, chassis } = await request.json();

    if (!year || !team) {
      return NextResponse.json(
        { error: 'Year and team are required' },
        { status: 400 }
      );
    }

    console.log(`🏗️ Creating car: ${year} ${team} ${chassis || 'Unknown chassis'}`);

    // Step 1: Create or get season
    let { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, year')
      .eq('year', parseInt(year))
      .single();

    if (seasonError || !season) {
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
    let { data: teams, error: teamSearchError } = await supabase
      .from('teams')
      .select('id, name')
      .ilike('name', `%${team}%`);

    let teamId;
    if (teamSearchError || !teams || teams.length === 0) {
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

    // Step 3: Create car
    const liveryName = chassis || `${team} ${year}`;

    const { data: car, error: carError } = await supabase
      .from('cars')
      .insert({
        season_id: season.id,
        team_id: teamId,
        livery_name: liveryName,
        event_name: null,
      })
      .select(`
        id,
        livery_name,
        event_name,
        team:teams(id, name),
        season:seasons(id, year)
      `)
      .single();

    if (carError) {
      throw new Error(`Failed to create car: ${carError.message}`);
    }

    console.log(`✅ Created car: ${year} ${team} ${liveryName}`);

    return NextResponse.json({
      success: true,
      car: car,
      message: `Created ${year} ${team} ${liveryName}`,
    });
  } catch (error: any) {
    console.error('❌ Error creating car:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
