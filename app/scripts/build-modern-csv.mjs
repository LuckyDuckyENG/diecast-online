/**
 * Turn cached miniatures-minichamps product pages into a sync-csv CSV, for a
 * modern season.
 *
 *   node scripts/minichamps-fetch.mjs 2017          # read the pages first
 *   node scripts/build-modern-csv.mjs 2017 --review # what it cannot parse
 *   node scripts/build-modern-csv.mjs 2017 > ../f1_2017_GAP2.csv
 *
 * The historic sibling is build-villeneuve-csv.mjs. Same method -- parse the
 * slug, cross-check against what the season actually was, refuse to guess --
 * but the modern grid needs a far wider vocabulary: ten teams, twenty drivers
 * and twenty-odd rounds per year instead of one driver at one team.
 *
 * THREE KINDS OF CONTAMINATION, all seen in the 2017 fetch:
 *
 *   Formula E    12 products. Not F1, and the shared WRONG filter has no term
 *                for it because "formula-e" is not "formula-2".
 *   demo runs     3 products. Mick Schumacher driving a 1994 Benetton at Spa
 *                in 2017: a real product whose CAR is 23 years older than its
 *                slug's year.
 *   fake years   10 products. minichamps-fetch matches its term as a plain
 *                substring, so part number 110201750 -- a 2020 Haas --
 *                contains "2017". Every one would have imported as a 2017 car
 *                with a 2020 chassis.
 *
 * The year is therefore read as a DELIMITED token from the slug with the part
 * number stripped off the end, never as a substring.
 */
import { readFileSync } from 'fs';

const year = Number(process.argv.find(a => /^\d{4}$/.test(a)));
const REVIEW = process.argv.includes('--review');
if (!year) {
  console.error('usage: node scripts/build-modern-csv.mjs <year> [--review]');
  process.exit(1);
}

const src = `.feed-cache/miniatures-minichamps/${year}-pages.json`;
const all = JSON.parse(readFileSync(src, 'utf8'));

/** The year as a delimited token, with the trailing part number removed. */
const yearsIn = slug => {
  const body = slug.replace(/^\d+-/, '').replace(/-[a-z0-9]+$/i, '');
  return [...body.matchAll(/(?:^|-)((?:19|20)\d{2})(?=-|$)/g)].map(m => +m[1]);
};

const EXCLUDE = [
  [/formula-e|formule-e/, 'Formula E'],
  [/demonstration-run|demo-run|(?:^|-)demo(?:-|$)/, 'demonstration run'],
  [/formule-[23]|formula-[23]|indycar|nascar|motogp|rallye|dtm|24-heures/, 'not F1'],
  [/2-car-set|two-car-set|teamset|team-set|coffret|(?:^|-)set-/, 'multi-car set'],
  /**
   * Road cars in team livery. "renault-megane-rs-f1-team-2017-yellow-metallic"
   * is a hot hatch, not a race car, and it carries "f1-team" so the F1 filter
   * waves it through.
   */
  [/megane|clio|(?:^|-)road-car(?:-|$)|safety-car|medical-car|medical-support-car|dbx-?707|vantage/, 'road car'],
  /**
   * Formula 3. "dallara-mercedes-f317-macau-gp-2018" is Mick Schumacher's F3
   * car; the shared filter looks for "f3" as a token and this says "f317".
   * Dallara builds no F1 car, and Macau is not an F1 round, so either alone
   * settles it.
   */
  [/(?:^|-)dallara(?:-|$)|macau/, 'Formula 3'],
  /**
   * Japanese Super Formula. The SF19 is a Dallara-built single-seater and the
   * slugs say "f1" nowhere -- they reach here because the shop files them
   * under an F1 category. Twelve of them in 2022.
   */
  [/super-formula|(?:^|-)sf19(?:-|$)/, 'Super Formula'],
  /**
   * A car from another era at a modern event. "renault-rs01-...-f1-monaco-
   * 2018" is the 1977 RS01, the first turbo F1 car, demonstrated at Monaco in
   * 2018 -- one of them by Alain Prost. Real products, but importing them
   * under the slug's year would file a 1977 car as a 2018 one. Same class as
   * the Mick Schumacher Benetton demo runs.
   */
  [/(?:^|-)rs01(?:-|$)/, 'historic car at a modern event'],
  /**
   * A McLaren MP4/x from the turbo era at a modern event. Alonso drove Senna's
   * MP4/4 at Catalunya in 2015 and the MP4/6 at Honda Thanks Day the same
   * year; the slug's year is 2015 and the car is 27 years old.
   *
   * The digit must END the token, so this catches mp4-4 and mp4-6 and cannot
   * touch MP4-30 or MP4-31, which are the real 2015 and 2016 cars.
   */
  [/(?:^|-)mp4-[0-9](?:-|$)|honda-thanks-day/, 'historic car at a modern event'],
  /**
   * A team's old car used for a test. Ferrari ran the 2018 SF71H at Fiorano in
   * January 2021 for Sainz's and Schumacher's first drives -- teams use a
   * two-year-old car for private testing, so the slug's year and the car's
   * year genuinely differ.
   */
  [/sf71h[a-z0-9-]*-(?:f1-)?testing/, 'old car at a test session'],
  /**
   * Toro Rosso's STR7 is a 2012 car. It appears dated 2014 because Verstappen
   * had his first F1 test in it at Adria that year -- teams run a two-year-old
   * chassis for private testing, so the slug's year is the event's, not the
   * car's.
   */
  [/(?:^|-)str7(?:-|$)/, 'old car at a test session'],
  /** Not race cars: a launch presentation and a concept study. */
  [/(?:^|-)presentation(?:-|$)|concept-study|(?:^|-)concept(?:-|$)/, 'presentation or concept'],
  /**
   * Road cars again, this time as team merchandise: a Ferrari 488 Pista in
   * "piloti" colours, a McLaren 600LT "f1-team-tribute". Both carry F1 wording
   * and neither is a race car.
   */
  [/488-pista|600lt|570s|720s|(?:^|-)piloti(?:-|$)|f1-team-tribute/, 'road car'],
  /**
   * Promotional ride swaps. Valentino Rossi drove a Mercedes W10 at Valencia
   * in 2019 and Hamilton rode his bike. A real product of a real event, but
   * the driver is a MotoGP rider and importing it would add him to the F1
   * driver list for a car he never raced.
   */
  [/ride-swap/, 'promotional ride swap'],
  /**
   * Parade and demonstration road cars. "ferrari308-gts-1982-charles-leclerc-
   * carlos-sainz-f1-parade-mexico-gp-2020" is a 1982 road Ferrari the drivers
   * rode in before the race.
   */
  [/308-gts|(?:^|-)parade(?:-|$)/, 'parade road car'],
];

const dropped = [];
const kept = all.filter(o => {
  const hit = EXCLUDE.find(([re]) => re.test(o.slug));
  if (hit) { dropped.push([o.urlSku, hit[1]]); return false; }
  if (!yearsIn(o.slug).includes(year)) { dropped.push([o.urlSku, `not a ${year} car`]); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  return true;
});

/** Rounds as this shop names them. French-led, a few English. */
const EVENTS = [
  [/abou?-dhabi/, 'Abu Dhabi GP'], [/australie/, 'Australian GP'],
  [/bahrain|bahrein/, 'Bahrain GP'], [/(?:^|-)chine(?:-|$)/, 'Chinese GP'],
  [/russie/, 'Russian GP'], [/espagne/, 'Spanish GP'],
  [/(?:^|-)monaco(?:-|$)|montecarlo/, 'Monaco GP'], [/(?:^|-)canada(?:-|$)/, 'Canadian GP'],
  [/azerbaidjan|azerbaijan|bakou|baku/, 'Azerbaijan GP'], [/autriche/, 'Austrian GP'],
  [/angleterre|silverstone|grande-bretagne/, 'British GP'], [/hongrie/, 'Hungarian GP'],
  [/belgique|spa-francorchamps/, 'Belgian GP'], [/(?:^|-)italie(?:-|$)|monza/, 'Italian GP'],
  [/singapour/, 'Singapore GP'], [/malaisie/, 'Malaysian GP'],
  [/(?:^|-)japon(?:-|$)|suzuka/, 'Japanese GP'], [/mexique/, 'Mexican GP'],
  [/(?:^|-)bresil(?:-|$)|interlagos/, 'Brazilian GP'], [/(?:^|-)usa(?:-|$)|austin|etats-unis/, 'United States GP'],
  [/allemagne|hockenheim/, 'German GP'], [/(?:^|-)france(?:-|$)|castellet/, 'French GP'],
  [/pays-bas|zandvoort/, 'Dutch GP'], [/portugal|portimao/, 'Portuguese GP'],
  [/toscane|mugello/, 'Tuscan GP'], [/eifel/, 'Eifel GP'], [/sakhir/, 'Sakhir GP'],
  [/styrie/, 'Styrian GP'], [/emilie-romagne|imola/, 'Emilia Romagna GP'],
  [/turquie/, 'Turkish GP'], [/qatar/, 'Qatar GP'], [/arabie-saoudite/, 'Saudi Arabian GP'],
];

/**
 * Chassis by season. Keyed by year so a code cannot leak across seasons -- the
 * mistake that put a 2020 Haas in 2017 before the year filter was tightened.
 */
const CHASSIS = {
  /**
   * 2014. The first hybrid season, and the last for Caterham and Marussia.
   *
   * Red Bull's RB10 and Toro Rosso's STR9 sit next to 2015's RB11 and STR10,
   * so the patterns must not run on: /rb10/ would match inside "rb10" only,
   * but /str9/ has to refuse a following digit or it reads STR9 out of a
   * hypothetical STR90. Lotus is the E22, not to be confused with 2015's E23.
   */
  2014: [[/(?:^|-)w05(?:-|$)/, 'W05'], [/f14-?t|(?:^|-)f14(?:-|$)/, 'F14 T'],
         [/rb10/, 'RB10'], [/vjm07/, 'VJM07'], [/fw36/, 'FW36'],
         [/(?:^|-)e22(?:-|$)/, 'E22'], [/str9(?![0-9])/, 'STR9'],
         [/mp4-?29/, 'MP4-29'], [/(?:^|-)c33(?:-|$)/, 'C33'],
         [/mr03(?!b)/, 'MR03'], [/(?:^|-)ct05(?:-|$)/, 'CT05']],
  /**
   * 2015. Manor ran the previous year's Marussia as the MR03B, so both names
   * appear. Red Bull's RB11 and Toro Rosso's STR10 are the last of the
   * Renault-badged-as-TAG-Heuer era, which shows up in slugs but not in the
   * chassis code.
   */
  2015: [[/w06/, 'W06'], [/sf15|sf-?15-?t/, 'SF15-T'], [/rb11/, 'RB11'], [/vjm08/, 'VJM08'],
         [/fw37/, 'FW37'], [/(?:^|-)e23(?:-|$)|e23-hybrid/, 'E23'], [/str10/, 'STR10'],
         [/mp4-?30/, 'MP4-30'], [/(?:^|-)c34(?:-|$)/, 'C34'], [/mr03/, 'MR03B']],
  /**
   * 2016. The first season the catalogue reaches back to on this side of the
   * historic block, and the last before the 2017 aero rules.
   *
   * McLaren's MP4-31 shares the MP4 prefix with Senna's MP4/4 and MP4/8, which
   * is harmless only because CHASSIS is keyed by year -- a 1988 slug can never
   * be offered the 2016 patterns. Manor ran as MRT after the Marussia name
   * went, so both spellings are matched.
   */
  2016: [[/w07/, 'W07'], [/sf16/, 'SF16-H'], [/rb12/, 'RB12'], [/vjm09/, 'VJM09'],
         [/fw38/, 'FW38'], [/rs16/, 'RS16'], [/str11/, 'STR11'], [/vf-?16/, 'VF-16'],
         [/mp4-?31/, 'MP4-31'], [/(?:^|-)c35(?:-|$)/, 'C35'], [/mrt05|mrt-?05/, 'MRT05']],
  2017: [[/w08/, 'W08'], [/sf70/, 'SF70H'], [/rb13/, 'RB13'], [/vjm10/, 'VJM10'],
         [/fw40/, 'FW40'], [/rs17/, 'RS17'], [/str12/, 'STR12'], [/vf-?17/, 'VF-17'],
         [/mcl32/, 'MCL32'], [/(?:^|-)c36(?:-|$)/, 'C36']],
  2018: [[/w09/, 'W09'], [/sf71/, 'SF71H'], [/rb14/, 'RB14'], [/vjm11/, 'VJM11'],
         [/fw41/, 'FW41'], [/rs18/, 'RS18'], [/str13/, 'STR13'], [/vf-?18/, 'VF-18'],
         [/mcl33/, 'MCL33'], [/(?:^|-)c37(?:-|$)/, 'C37']],
  2019: [[/w10/, 'W10'], [/sf90/, 'SF90'], [/rb15/, 'RB15'], [/rp19/, 'RP19'],
         [/fw42/, 'FW42'], [/rs19/, 'RS19'], [/str14/, 'STR14'], [/vf-?19/, 'VF-19'],
         [/mcl34/, 'MCL34'], [/(?:^|-)c38(?:-|$)/, 'C38']],
  2020: [[/w11/, 'W11'], [/sf1000/, 'SF1000'], [/rb16(?!b)/, 'RB16'], [/rp20/, 'RP20'],
         [/fw43(?!b)/, 'FW43'], [/rs20/, 'RS20'], [/(?:^|-)at0?1(?:-|$)/, 'AT01'], [/vf-?20/, 'VF-20'],
         [/mcl35(?!m)/, 'MCL35'], [/(?:^|-)c39(?:-|$)/, 'C39']],
  /**
   * 2021's B and M suffixes are not decoration. RB16B, FW43B and MCL35M are
   * the 2021 cars; RB16, FW43 and MCL35 are the 2020 ones, and the shop sells
   * both from one catalogue. The 2020 patterns above already refuse a
   * following b or m so the two seasons cannot borrow each other's cars.
   */
  2021: [[/w12/, 'W12'], [/sf21/, 'SF21'], [/rbr?16b/, 'RB16B'], [/amr21/, 'AMR21'],
         [/fw43b/, 'FW43B'], [/a521/, 'A521'], [/(?:^|-)at0?2(?:-|$)/, 'AT02'],
         [/vf-?21/, 'VF-21'], [/mcl35m/, 'MCL35M'], [/(?:^|-)c41(?:-|$)/, 'C41']],
  /**
   * 2022 is the ground-effect reset, so every code changes and none of them
   * collide with an earlier season. Alfa Romeo drops the C-number for C42 and
   * AlphaTauri's AT03 keeps the at0?N shape the shop uses inconsistently.
   */
  2022: [[/w13/, 'W13'], [/f1-?75|(?:^|-)f75(?:-|$)|(?:^|-)sf22(?:-|$)/, 'F1-75'], [/rb18/, 'RB18'],
         [/amr22/, 'AMR22'], [/fw44/, 'FW44'], [/a522/, 'A522'],
         [/(?:^|-)at0?3(?:-|$)/, 'AT03'], [/vf-?22/, 'VF-22'], [/mcl36/, 'MCL36'],
         [/(?:^|-)c42(?:-|$)/, 'C42']],
  /**
   * 2023. McLaren jumps to MCL60 for the team's 60th year rather than MCL37,
   * and Ferrari writes SF-23 with a hyphen the shop sometimes drops.
   */
  2023: [[/w14/, 'W14'], [/sf-?23/, 'SF-23'], [/rb19/, 'RB19'], [/amr23/, 'AMR23'],
         [/fw45/, 'FW45'], [/a523/, 'A523'], [/(?:^|-)at0?4(?:-|$)/, 'AT04'],
         [/vf-?23/, 'VF-23'], [/mcl60/, 'MCL60'], [/(?:^|-)c43(?:-|$)/, 'C43']],
};

/**
 * THE CONSTRUCTOR IS THE ONE THAT COMES FIRST IN THE SLUG.
 *
 * "williams-mercedes-fw40" is a Williams with a Mercedes engine;
 * "haas-ferrari-vf17" is a Haas; "sauber-ferrari-c36" is a Sauber. Picking by
 * list order instead of position gave every one of those to the ENGINE
 * SUPPLIER -- 11 Williams became Mercedes, and Haas and Sauber vanished from
 * the team tally entirely while their chassis sat plainly in the data.
 *
 * So the winner is the match with the smallest index, not the first rule that
 * happens to fire. The chassis/team cross-check below exists to catch this
 * class of error, since a 2017 chassis belongs to exactly one constructor.
 */
const TEAMS = [
  [/red-?bull/, 'Red Bull'], [/toro-rosso/, 'Toro Rosso'], [/force-india|racing-point/, 'Force India'],
  [/alpha-?tauri/, 'AlphaTauri'], [/aston-martin/, 'Aston Martin'], [/(?:^|-)alpine(?:-|$)/, 'Alpine'],
  [/mercedes/, 'Mercedes'], [/ferrari/, 'Ferrari'],
  [/mclaren/, 'McLaren'], [/williams/, 'Williams'], [/renault/, 'Renault'],
  [/haas/, 'Haas'], [/sauber|alfa-romeo/, 'Sauber'], [/(?:^|-)lotus(?:-|$)/, 'Lotus'], [/(?:^|-)manor(?:-|$)|marussia|(?:^|-)mrt(?:-|$)/, 'Manor'],
];
/**
 * What the team was CALLED in a given season.
 *
 * The Sauber entry exists because sync-csv maps the bare word "Sauber" to
 * Kick Sauber -- right for a 2024 CSV, wrong for every earlier one -- so 2017
 * and 2018 cars landed under a team that did not exist until 2024, and 2018
 * ended up split across two teams with neither page showing the full season.
 *
 * Force India became Racing Point in 2019, and the RP19 is a Racing Point.
 */
const ERA_NAME = (team, year) => {
  if (team === 'Sauber') return year >= 2018 ? 'Alfa Romeo' : 'Sauber';
  if (team === 'Force India' && year >= 2019) return 'Racing Point';
  return team;
};

const teamIn = slug => {
  /**
   * Title sponsors that sit in front of the constructor. Aston Martin badged
   * Red Bull 2018-2020; its own cars are AMR21 onward and are matched by
   * chassis, so demoting the name here cannot lose them.
   */
  if (/aston-martin-red-bull|red-bull.*aston-martin/.test(slug)) return 'Red Bull';
  let best = null, at = Infinity;
  for (const [re, name] of TEAMS) {
    const m = slug.match(re);
    if (m && m.index < at) { at = m.index; best = name; }
  }
  return best;
};

/** Which constructor each 2017-2020 chassis belongs to. A disagreement is a bug. */
const CHASSIS_TEAM = {
  W08: 'Mercedes', SF70H: 'Ferrari', RB13: 'Red Bull', VJM10: 'Force India',
  FW40: 'Williams', RS17: 'Renault', STR12: 'Toro Rosso', 'VF-17': 'Haas',
  MCL32: 'McLaren', C36: 'Sauber',
  W09: 'Mercedes', SF71H: 'Ferrari', RB14: 'Red Bull', VJM11: 'Force India',
  FW41: 'Williams', RS18: 'Renault', STR13: 'Toro Rosso', 'VF-18': 'Haas',
  MCL33: 'McLaren', C37: 'Sauber',
  W10: 'Mercedes', SF90: 'Ferrari', RB15: 'Red Bull', RP19: 'Force India',
  FW42: 'Williams', RS19: 'Renault', STR14: 'Toro Rosso', 'VF-19': 'Haas',
  MCL34: 'McLaren', C38: 'Sauber',
  W11: 'Mercedes', SF1000: 'Ferrari', RB16: 'Red Bull', RP20: 'Force India',
  FW43: 'Williams', RS20: 'Renault', AT01: 'AlphaTauri', 'VF-20': 'Haas',
  MCL35: 'McLaren', C39: 'Sauber',
  W12: 'Mercedes', SF21: 'Ferrari', RB16B: 'Red Bull', AMR21: 'Aston Martin',
  FW43B: 'Williams', A521: 'Alpine', AT02: 'AlphaTauri', 'VF-21': 'Haas',
  MCL35M: 'McLaren', C41: 'Sauber',
  W13: 'Mercedes', 'F1-75': 'Ferrari', RB18: 'Red Bull', AMR22: 'Aston Martin',
  FW44: 'Williams', A522: 'Alpine', AT03: 'AlphaTauri', 'VF-22': 'Haas',
  MCL36: 'McLaren', C42: 'Sauber',
  W14: 'Mercedes', 'SF-23': 'Ferrari', RB19: 'Red Bull', AMR23: 'Aston Martin',
  FW45: 'Williams', A523: 'Alpine', AT04: 'AlphaTauri', 'VF-23': 'Haas',
  MCL60: 'McLaren', C43: 'Sauber',
  W07: 'Mercedes', 'SF16-H': 'Ferrari', RB12: 'Red Bull', VJM09: 'Force India',
  FW38: 'Williams', RS16: 'Renault', STR11: 'Toro Rosso', 'VF-16': 'Haas',
  'MP4-31': 'McLaren', C35: 'Sauber', MRT05: 'Manor',
  W06: 'Mercedes', 'SF15-T': 'Ferrari', RB11: 'Red Bull', VJM08: 'Force India',
  FW37: 'Williams', E23: 'Lotus', STR10: 'Toro Rosso', 'MP4-30': 'McLaren',
  C34: 'Sauber', MR03B: 'Manor',
  W05: 'Mercedes', 'F14 T': 'Ferrari', RB10: 'Red Bull', VJM07: 'Force India',
  FW36: 'Williams', E22: 'Lotus', STR9: 'Toro Rosso', 'MP4-29': 'McLaren',
  C33: 'Sauber', MR03: 'Marussia', CT05: 'Caterham',
};

/**
 * Surname -> the name as the DATABASE spells it.
 *
 * Keyed on surname because the shop drops first names as often as it includes
 * them: "...-mexique-2017-hamilton-minichamps-..." and
 * "...-malaisie-2017-verstappen-spark-s5050" are ordinary forms. Matching only
 * full names left seven rows unparsed, all of them surname-only.
 *
 * The value is what `drivers.name` holds, NOT a prettified version of the
 * slug. "carlos-sainz-jr" and "carlos-sainz" are the same person and the
 * database calls him Carlos Sainz; deriving the name from the slug produced
 * both spellings and would have created a second driver row for him.
 */
const DRIVERS = {
  hamilton: 'Lewis Hamilton', bottas: 'Valtteri Bottas', vettel: 'Sebastian Vettel',
  raikkonen: 'Kimi Raikkonen', verstappen: 'Max Verstappen', ricciardo: 'Daniel Ricciardo',
  perez: 'Sergio Perez', ocon: 'Esteban Ocon', massa: 'Felipe Massa',
  stroll: 'Lance Stroll', hulkenberg: 'Nico Hulkenberg', palmer: 'Jolyon Palmer',
  sainz: 'Carlos Sainz', kvyat: 'Daniil Kvyat', gasly: 'Pierre Gasly',
  grosjean: 'Romain Grosjean', magnussen: 'Kevin Magnussen', alonso: 'Fernando Alonso',
  vandoorne: 'Stoffel Vandoorne', ericsson: 'Marcus Ericsson', wehrlein: 'Pascal Wehrlein',
  giovinazzi: 'Antonio Giovinazzi', leclerc: 'Charles Leclerc', norris: 'Lando Norris',
  albon: 'Alexander Albon', russell: 'George Russell', kubica: 'Robert Kubica',
  latifi: 'Nicholas Latifi', fittipaldi: 'Pietro Fittipaldi', aitken: 'Jack Aitken',
  mazepin: 'Nikita Mazepin', tsunoda: 'Yuki Tsunoda', sirotkin: 'Sergey Sirotkin',
  hartley: 'Brendon Hartley', button: 'Jenson Button', schumacher: 'Mick Schumacher',
  // The shop spells it "george-russel" with one l on its 2019 FW42. Left as a
  // tolerated misspelling rather than corrected upstream, because the slug is
  // the shop's and we only read it.
  russel: 'George Russell',
  // "daniil-kyvat" on one 2020 AlphaTauri: the shop's transposition.
  kyvat: 'Daniil Kvyat',
  // "lewis-hamilon" on a 2021 Bburago W12: the shop dropped the t.
  hamilon: 'Lewis Hamilton',
  // 2022 arrivals. De Vries is matched on the full surname because "vries"
  // alone is too short to anchor safely.
  zhou: 'Guanyu Zhou', piastri: 'Oscar Piastri', 'de-vries': 'Nyck de Vries',
  // 2023 arrivals: Sargeant at Williams all season, Lawson standing in for
  // Ricciardo at AlphaTauri from Zandvoort.
  sargeant: 'Logan Sargeant', lawson: 'Liam Lawson',
  // The 2016 grid. Rosberg's championship year, Haas's first season, and
  // Manor's last.
  rosberg: 'Nico Rosberg', gutierrez: 'Esteban Gutierrez', nasr: 'Felipe Nasr',
  // 2015 only: Maldonado at Lotus, Merhi and Stevens at Manor.
  maldonado: 'Pastor Maldonado', merhi: 'Roberto Merhi', stevens: 'Will Stevens',
  // 2014 only: Chilton and Bianchi at Marussia, Kobayashi and Ericsson at
  // Caterham, Sutil and Gutierrez at Sauber, Vergne at Toro Rosso.
  chilton: 'Max Chilton', bianchi: 'Jules Bianchi', kobayashi: 'Kamui Kobayashi',
  sutil: 'Adrian Sutil', vergne: 'Jean-Eric Vergne', lotterer: 'Andre Lotterer',
  haryanto: 'Rio Haryanto', 'jenson-button': 'Jenson Button',
};
/** Longest surname first, so "sainz" cannot win inside another token. */
const SURNAMES = Object.keys(DRIVERS).sort((a, b) => b.length - a.length);
const driverIn = slug => {
  const k = SURNAMES.find(s => new RegExp(`(?:^|-)${s}(?:-|$)`).test(slug));
  return k ? DRIVERS[k] : null;
};

const MAKERS = {
  minichamps: 'Minichamps', spark: 'Spark', looksmart: 'Looksmart', bbr: 'BBR',
  ixo: 'IXO', tecnomodel: 'Tecnomodel', 'gp-replicas': 'GP Replicas',
  'premium-x': 'Premium X', bburago: 'Bburago', burago: 'Bburago', solido: 'Solido',
  norev: 'Norev', truescale: 'TrueScale', tsm: 'TrueScale', edicola: 'Edicola',
  altaya: 'Altaya', onyx: 'Onyx', schuco: 'Schuco', opo: 'OPO', mcg: 'MCG',
  'hot-wheels': 'Hot Wheels', hotwheels: 'Hot Wheels',
  // Makers that first appear in the older seasons.
  autoart: 'AutoArt', exoto: 'Exoto', '-spar-': 'Spark', quartzo: 'Quartzo', vitesse: 'Vitesse',
  matrix: 'Matrix', brumm: 'Brumm', amalgam: 'Amalgam',
};

const chassisFor = CHASSIS[year];
if (!chassisFor) {
  console.error(`no chassis map for ${year} — add one to CHASSIS`);
  process.exit(1);
}

const rows = [], review = [];
for (const o of kept) {
  const s = o.slug;
  /**
   * SHOWCARS ARE THEIR OWN THING.
   *
   * "mercedes-amg-petronas-f1-team-f1-showcar-2018-lewis-hamilton" is the
   * display car teams wheel out at launches. It carries no chassis code
   * because it is not the race car, and 18 of them appeared in 2018 alone.
   *
   * Labelling them with the season's chassis would say a W09 was sold when it
   * was not -- the same error class as a 1:2 steering wheel catalogued as a
   * 1:43 car. They get their own livery name instead, so a buyer sees exactly
   * what the product is.
   */
  const isShowcar = /(?:^|-)showcar(?:-|$)|(?:^|-)show-car(?:-|$)/.test(s);
  const chassis = isShowcar
    ? 'Showcar'
    : (chassisFor.find(([re]) => re.test(s)) || [])[1] || null;
  /**
   * THE CHASSIS NAMES THE CONSTRUCTOR BETTER THAN THE SLUG DOES.
   *
   * "aston-martin-red-bull-tag-heuer-rb14" is a RED BULL. Aston Martin was the
   * title sponsor from 2018 to 2020 and had no car of its own until the AMR21,
   * so reading the first team name in the slug handed 23 of Ricciardo's and
   * Verstappen's 2018 cars to Aston Martin -- and the same again in 2019 and
   * 2020. The earlier "williams-mercedes" fix was right that position matters;
   * it is just that a title sponsor sits in front of the constructor too.
   *
   * An RB14 can only be a Red Bull, so when the chassis is known it decides,
   * and the slug is only consulted for things with no chassis code -- showcars
   * being the case that matters.
   *
   * Caught by the chassis/team cross-check, which is exactly what it is for:
   * it put all 23 into review rather than filing them under the wrong team.
   */
  const fromChassis = isShowcar ? null : CHASSIS_TEAM[chassis];
  const team = ERA_NAME(fromChassis || teamIn(s), year);
  const event = (EVENTS.find(([re]) => re.test(s)) || [])[1] || 'Season';
  const driver = driverIn(s);
  const maker = Object.entries(MAKERS).find(([k]) => s.includes(k))?.[1] || null;

  const missing = [];
  if (!chassis) missing.push('chassis');
  if (!team) missing.push('team');
  if (!driver) missing.push('driver');
  if (!maker) missing.push('manufacturer');
  if (missing.length) { review.push({ o, missing }); continue; }

  // A 2017 chassis belongs to exactly one constructor. A disagreement means
  // the slug was read wrong, not that history is surprising.
  const expect = isShowcar ? null : ERA_NAME(CHASSIS_TEAM[chassis], year);
  if (expect && expect !== team) {
    review.push({ o, missing: [`chassis ${chassis} is ${expect}, read team as ${team}`] });
    continue;
  }

  rows.push({
    team, driver, event, chassis, year, maker,
    sku18: o.scale === '1:18' ? o.urlSku : '',
    sku43: o.scale === '1:43' ? o.urlSku : '',
  });
}

if (REVIEW) {
  console.log(`fetched ${all.length}, kept ${kept.length}, excluded ${dropped.length}`);
  const why = {}; for (const [, w] of dropped) why[w] = (why[w] || 0) + 1;
  for (const [w, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${w}`);
  console.log(`\nparsed into CSV rows : ${rows.length}`);
  console.log(`needing a human      : ${review.length}`);
  for (const r of review)
    console.log(`   missing ${r.missing.join('+').padEnd(22)} ${r.o.slug.replace(/^\d+-/, '').slice(0, 70)}`);
  const f = (k) => { const t = {}; for (const r of rows) t[r[k]] = (t[r[k]] || 0) + 1; return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${b}`).join(' · '); };
  console.log(`\nteams  : ${f('team')}`);
  console.log(`chassis: ${f('chassis')}`);
  console.log(`scales : 1:18 ${rows.filter(r => r.sku18).length} · 1:43 ${rows.filter(r => r.sku43).length}`);
  console.log(`drivers: ${f('driver')}`);
  process.exit(0);
}

const NOTE = `SINGLE SOURCE — miniatures-minichamps.com; scale read from the product page`;
console.log('team,driver_name,event_name,livery_name,year,manufacturer,sku_1_18,sku_1_43,notes,verification_status');
for (const r of rows)
  console.log([r.team, r.driver, r.event, r.chassis, r.year, r.maker, r.sku18, r.sku43, '', NOTE].join(','));
