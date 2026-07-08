import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// F1 2024 Team Colors (hex codes)
const TEAM_COLORS = {
  'Ferrari': { primary: '#DC0000', text: '#FFFFFF' },
  'Scuderia Ferrari': { primary: '#DC0000', text: '#FFFFFF' },
  'Red Bull Racing': { primary: '#0600EF', text: '#FCD700' },
  'Mercedes': { primary: '#00D2BE', text: '#000000' },
  'Mercedes-AMG Petronas': { primary: '#00D2BE', text: '#000000' },
  'McLaren': { primary: '#FF8700', text: '#FFFFFF' },
  'Aston Martin': { primary: '#006F62', text: '#00F5D0' },
  'Alpine': { primary: '#0090FF', text: '#FFFFFF' },
  'Haas F1 Team': { primary: '#FFFFFF', text: '#000000' }, // White/Red
  'Kick Sauber': { primary: '#52E252', text: '#000000' }, // Green
  'RB': { primary: '#6692FF', text: '#FFFFFF' }, // VCARB Blue
  'Visa Cash App RB': { primary: '#6692FF', text: '#FFFFFF' },
  'Williams': { primary: '#005AFF', text: '#FFFFFF' },
};

async function addTeamColors() {
  console.log('🎨 Adding team colors to database...\n');

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name');

  if (!teams) {
    console.log('❌ No teams found');
    return;
  }

  for (const team of teams) {
    const colors = TEAM_COLORS[team.name as keyof typeof TEAM_COLORS];

    if (!colors) {
      console.log(`⚠️  No colors defined for: ${team.name}`);
      continue;
    }

    console.log(`🎨 ${team.name}`);
    console.log(`   Primary: ${colors.primary}`);
    console.log(`   Text: ${colors.text}`);

    // Check if team already has color columns
    const { data: existing } = await supabase
      .from('teams')
      .select('*')
      .eq('id', team.id)
      .single();

    // Update team with colors
    const { error } = await supabase
      .from('teams')
      .update({
        primary_color: colors.primary,
        text_color: colors.text,
      })
      .eq('id', team.id);

    if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    } else {
      console.log(`   ✅ Updated with colors\n`);
    }
  }

  console.log('\n🎉 All team colors added!');
}

addTeamColors();
