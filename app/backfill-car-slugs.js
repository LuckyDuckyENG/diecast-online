/**
 * Populate cars.slug for every car.
 *
 * Idempotent: only writes rows whose slug is missing or has drifted from what
 * the current rules produce. Run with --dry-run to preview.
 *
 *   node backfill-car-slugs.js --dry-run
 *   node backfill-car-slugs.js
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Mirrors lib/carSlug.ts + lib/teamName.ts. Kept in plain JS so this runs
// without a TypeScript step; the app imports the .ts version.
const TEAM_PATTERNS = [
  [/williams/, 'williams'],
  [/mclaren/, 'mclaren'],
  [/aston\s*martin/, 'aston-martin'],
  [/alpine/, 'alpine'],
  [/haas/, 'haas'],
  [/sauber|stake|kick/, 'sauber'],
  [/alfa\s*romeo/, 'alfa-romeo'],
  [/ferrari/, 'ferrari'],
  [/red\s*bull/, 'red-bull'],
  [/alphatauri/, 'alphatauri'],
  [/visa\s*cash\s*app|racing\s*bulls|(^|[^a-z])rb([^a-z]|$)/, 'rb'],
  [/mercedes/, 'mercedes'],   // last: powers several other teams
];

const teamSlug = name => {
  const s = (name || '').toLowerCase();
  for (const [re, slug] of TEAM_PATTERNS) if (re.test(s)) return slug;
  return name || '';
};

const slugify = t =>
  t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const buildSlug = c =>
  slugify([
    c.season?.year,
    teamSlug(c.team?.name),
    c.chassis_name,
    c.driver?.name,
    c.event_name,
  ].filter(Boolean).join(' '));

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '🧪 DRY RUN — nothing will be written\n' : '🔖 Backfilling car slugs\n');

  const { data: cars, error } = await supabase
    .from('cars')
    .select('id, slug, chassis_name, event_name, driver:drivers(name), team:teams(name), season:seasons(year)');

  if (error) throw new Error(error.message);

  const planned = cars.map(c => ({ car: c, slug: buildSlug(c) }));

  // The column has a unique index — catch clashes here rather than mid-write
  const counts = {};
  planned.forEach(p => (counts[p.slug] = (counts[p.slug] || 0) + 1));
  const clashes = Object.entries(counts).filter(([, n]) => n > 1);
  if (clashes.length) {
    console.error(`❌ ${clashes.length} slug collision(s) — aborting, nothing written:`);
    clashes.forEach(([slug]) => {
      console.error(`   ${slug}`);
      planned.filter(p => p.slug === slug)
        .forEach(p => console.error(`      ${p.car.id}  ${p.car.chassis_name} / ${p.car.event_name} / ${p.car.driver?.name}`));
    });
    process.exit(1);
  }

  const toWrite = planned.filter(p => p.car.slug !== p.slug);
  console.log(`cars: ${cars.length}   already correct: ${cars.length - toWrite.length}   to write: ${toWrite.length}\n`);

  let written = 0, failed = 0;
  for (const { car, slug } of toWrite) {
    if (dryRun) {
      console.log(`   ${car.slug ? car.slug + '  ->  ' : ''}${slug}`);
      continue;
    }
    const { error: e } = await supabase.from('cars').update({ slug }).eq('id', car.id);
    if (e) { console.error(`   ❌ ${car.id}: ${e.message}`); failed++; }
    else written++;
  }

  if (!dryRun) console.log(`\n✅ written: ${written}   failed: ${failed}`);
})().catch(e => { console.error(e.message); process.exit(1); });
