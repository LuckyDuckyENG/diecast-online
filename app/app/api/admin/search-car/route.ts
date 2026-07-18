import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const { year, team } = await request.json();

    if (!year || !team) {
      return NextResponse.json(
        { error: 'Year and team are required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Searching for car: ${year} ${team}`);

    // First, find the season
    const { data: season, error: seasonError } = await supabase
      .from('seasons')
      .select('id, year')
      .eq('year', parseInt(year))
      .single();

    if (seasonError || !season) {
      console.log(`⚠️ Season ${year} not found`);
      return NextResponse.json({
        success: false,
        message: `Season ${year} not found. Would you like to create it?`,
      });
    }

    // Search for team (case-insensitive, partial match)
    const { data: teams, error: teamError } = await supabase
      .from('teams')
      .select('id, name')
      .ilike('name', `%${team}%`);

    if (teamError || !teams || teams.length === 0) {
      console.log(`⚠️ Team "${team}" not found`);
      return NextResponse.json({
        success: false,
        message: `Team "${team}" not found. Would you like to create it?`,
      });
    }

    const matchedTeam = teams[0];

    // Search for car with this season and team
    const { data: car, error: carError } = await supabase
      .from('cars')
      .select(`
        id,
        livery_name,
        event_name,
        team:teams(id, name),
        season:seasons(id, year)
      `)
      .eq('season_id', season.id)
      .eq('team_id', matchedTeam.id)
      .limit(1)
      .single();

    if (carError || !car) {
      console.log(`⚠️ No car found for ${year} ${matchedTeam.name}`);
      return NextResponse.json({
        success: false,
        message: `No car found for ${year} ${matchedTeam.name}. Would you like to create it?`,
        seasonId: season.id,
        teamId: matchedTeam.id,
      });
    }

    console.log(`✅ Found car: ${(car.season as any)?.year} ${(car.team as any)?.name} ${car.livery_name}`);

    return NextResponse.json({
      success: true,
      car: car,
    });
  } catch (error: any) {
    console.error('❌ Error searching for car:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
