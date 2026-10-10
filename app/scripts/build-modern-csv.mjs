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
  /**
   * The RS01 raced 1977-1979 AND was demonstrated at Monaco in 2018, so the
   * rule needs a native year or a 1979 run would drop the real race cars --
   * the STR7 mistake exactly. 1979 is the year this catalogue imports it for;
   * a future 1977 or 1978 run will need the same treatment.
   */
  [/(?:^|-)rs01(?:-|$)/, 'historic car at a modern event', 1979],
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
   *
   * THE THIRD ELEMENT IS THE YEAR THE CAR IS ACTUALLY FROM, and the rule is
   * skipped when importing that year. Without it, importing 2012 would drop
   * the real STR7 race cars as test cars -- the exclusion was only ever
   * correct because 2012 had not been imported.
   */
  [/(?:^|-)str7(?:-|$)/, 'old car at a test session', 2012],
  /**
   * Ligier's JS41 is a 1995 car. It appears dated 1996 because Jos Verstappen
   * ran it at a Suzuka tyre test that year. Same shape as the STR7 and the
   * R30, and carrying 1995 as its native year means a 1995 run still imports
   * the real race cars.
   */
  [/ligier[a-z-]*-js41/, 'old car at a tyre test', 1995],
  /**
   * Lotus ran the 2010 Renault R30 for private testing in 2012, which is how
   * Raikkonen prepared for his return. Same shape as the STR7 and the SF71H:
   * a two-year-old chassis at a later test, so the slug's year belongs to the
   * session rather than the car. No native year here -- the R30 is a 2010
   * car and would be imported as one by a 2010 run, under Renault.
   */
  [/(?:^|-)r30(?:-|$)[a-z0-9-]*test/, 'old car at a test session'],
  /**
   * A launch car names no driver, because at a launch there is not one yet.
   * "ferrari-f1-75-launch-version-f1-2022-looksmart-lsf1040" is the car as
   * shown in February, in launch livery. Same class as a presentation: a real
   * product with nobody to attribute it to, and every car here belongs to a
   * driver.
   */
  [/(?:^|-)presentation(?:-|$)|concept-study|(?:^|-)concept(?:-|$)|launch-version|press-version/, 'presentation, concept, launch or press car'],
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
  /**
   * Constructors' championship pieces. "red-bull-renault-rb6-team-champion-
   * f1-2010" is the car in championship livery with NO DRIVER named, because
   * the award is the team's. Every car in this catalogue belongs to a driver,
   * so there is nowhere to put it — and inventing one would attribute a
   * constructors' title to whichever name got picked.
   */
  /**
   * THE McLAREN F1 GTR IS NOT A FORMULA 1 CAR.
   *
   * It is a GT endurance racer built from the McLaren F1 road car, and it won
   * Le Mans in 1995. It sails through every F1 filter because the road car is
   * LITERALLY NAMED "McLaren F1", so the slug says f1 and means something
   * else: "mclaren-f1-gtr-...", and "mclaren-f1-59" is the Le Mans winner's
   * race number.
   *
   * 54 products across 1995-1998, about a fifth of that whole block, and the
   * single largest contaminant found in any season. Safe to match on the
   * marque-plus-f1 prefix because McLaren's actual F1 cars are never written
   * that way -- they are "mclaren-mercedes-mp4-11" or "mclarenmercedes-mp4-12".
   */
  /**
   * The lookbehind is load-bearing. /mclaren-f1-/ alone also matched
   * "eagle-mki-8-bruce-mclaren-f1-1967" and
   * "cooper-t53-with-driver-2-bruce-mclaren-f1-angleterre-1960" -- BRUCE
   * McLAREN DRIVING SOMEONE ELSE'S CAR. It silently dropped a real 1967 Eagle
   * and would have dropped a 1960 Cooper when that season arrives.
   *
   * The marque sits at the START of the slug, after the shop's numeric id, so
   * "mclaren-f1" preceded by a letter and a hyphen is a PERSON and never the
   * car. Checked across every cache: 60 slugs are the GTR or the Le Mans
   * winner and 2 were drivers.
   */
  [/(?<![a-z]-)mclaren-f1-/, 'McLaren F1 GTR, a GT car not an F1 car'],
  /**
   * A TRUCK. "iveco-stralis-koffer-sz-scuderia-ferrari-f1-team-2000" is the
   * team's race transporter, which carries "f1-team" and so reaches here.
   */
  [/iveco|stralis/, 'team transporter truck'],
  /**
   * Pace and course cars. "ford-mustang-pace-car" led the grid; it is not a
   * competitor and has no driver in the F1 sense.
   */
  [/mustang|pace-car/, 'pace car'],
  /**
   * The MERCEDES 300 SLR is a sports car, not a Grand Prix car -- the one
   * Moss won the Mille Miglia in and the one that went into the crowd at Le
   * Mans. The product here is the Swedish GP at Kristianstad, a SPORTS CAR
   * race despite the name. Same class of mistake as the McLaren F1 GTR.
   */
  [/300-?slr/, 'Mercedes 300 SLR, a sports car not an F1 car'],
  /**
   * THE THINWALL SPECIAL, found at 1954. Tony Vandervell's privately owned
   * Ferrari 375, the test bed that became the Vanwall, and it ran ONLY in
   * non-championship races by 1954 -- Collins won the Aintree meeting in it.
   *
   * Both of the shop's listings are SKU r192 and both are this car; one says
   * "thin-wall-special" and the other is bare "ferrari-375-9-angleterre",
   * which reads like a British GP entry and is not one. The 1954 British GP
   * was at Silverstone and Ferrari ran 625s and 553s there.
   *
   * NOW A PREDICATE, not the single year 1951 it carried yesterday. The 375
   * was a real championship car in 1950 and 1951, and in 1952 it went to
   * INDIANAPOLIS as the 375 Indy -- also a championship round. One native
   * year could not cover three, and the note here said to check 1950 before
   * importing it; the predicate answers that in advance.
   *
   * 1953 onward it is the Thinwall and nothing else.
   */
  [/f[ae]rrari-?375|thin-?wall/, 'Ferrari 375; from 1953 only the non-championship Thinwall Special',
    y => y <= 1952],
  /**
   * THE BRM V16, found at 1953. Fangio won the ALBI GRAND PRIX in it, which
   * is not a championship round, and the 1.5-litre supercharged car was not
   * even eligible for one: 1952 and 1953 were run to FORMULA 2 RULES because
   * there were too few F1 cars to fill a grid.
   *
   * Excluded on the CAR, not on "albi". A bounded "albi" matches two slugs in
   * the whole cache and the other is a 1969 Matra TEST at the circuit, which
   * is a legitimate test car this catalogue keeps -- the same mistake as
   * putting Aintree in the non-championship list. Name the car or the race,
   * never the circuit.
   *
   * 1951 is the one year the V16 started championship races, the British and
   * Italian Grands Prix, so that is its native year here.
   */
  [/brm-?v16/, 'BRM V16; it started championship races in 1951 only', 1951],
  /**
   * Team lorries. "berliet-tr350-renault-f1" is Renault's and
   * "transporteur-honda-f1-1965" is Honda's -- real products, no driver, not
   * race cars.
   */
  [/berliet|transporteur/, 'team transporter truck'],
  /**
   * NON-CHAMPIONSHIP RACES. The Race of Champions at Brands Hatch was run to
   * F1 rules but was never a World Championship round, so it has no season
   * and no points -- and this catalogue is organised by season.
   *
   * It also brought in GIACOMO AGOSTINI, the fifteen-time MOTORCYCLE world
   * champion, who drove a Williams FW06 there in 1979. Importing it would add
   * a bike racer to the F1 driver list, which is the same reason the Rossi
   * ride-swap is excluded.
   */
  /**
   * NON-CHAMPIONSHIP RACES. Run to F1 rules, never World Championship rounds,
   * so they have no season and no points -- and this catalogue is organised by
   * season.
   *
   * 1962 is thick with them, and one hurts: "lotus-18-21-7-stirling-moss-
   * glover-trophy-1962" is MOSS'S LAST RACE, the Goodwood crash in April that
   * ended his career. Historically it matters more than most championship
   * entries. It still has no season, so it goes with the rest -- consistency
   * is the only defensible line here, and the alternative is deciding which
   * non-championship races are famous enough to keep.
   *
   * MATCHED ON THE RACE, NEVER THE CIRCUIT. "aintree" was in this list for
   * about a minute and is wrong: Aintree hosted the BRITISH GRAND PRIX in
   * 1955, 1957, 1959, 1961 and 1962, all championship rounds. Only the BARC
   * 200 there was not, so the pattern names the race. Same trap as the
   * over-broad GTR rule -- a string that looks specific and is not.
   */
  [/race-of-champions|gold-cup|oulton-park|riverside|trophee|auvergne|lombank|mallory-park|glover|kanonloppet|barc-200|solitude|international-trophy/, 'non-championship race'],
  /**
   * THE INDIANAPOLIS 500, which is not Formula 1 -- in 1970. "colt-indy-500-
   * 1970-al-unser" is an IndyCar, and the existing filter has "indycar" but
   * not "indy-500".
   *
   * THE EXCEPTION THAT COMMENT ASKED FOR, added at 1952. The Indy 500 WAS a
   * round of the World Championship from 1950 to 1960, so the rule carries a
   * PREDICATE rather than a single native year and stands down for those
   * eleven seasons.
   *
   * It matters for exactly one of them. Sixteen Indy slugs exist in the whole
   * cache and four are in 1952: Ascari's Ferrari 375 Indy, listed twice, his
   * rookie test, and the second car entered for Johnnie Parsons. The other
   * twelve are 1964 onward -- Clark's Lotus 38, a Mustang pace car, a
   * Vollstedt -- and stay out.
   */
  [/indy-500|indianapolis/, 'Indianapolis 500, a championship round only in 1950-1960',
    y => y >= 1950 && y <= 1960],
  [/team-champion/, "constructors' championship piece, no driver"],
  /**
   * Michel Vaillant is a COMIC BOOK character, and "vaillantef1-with-figures-
   * 0-michel-vaillant-f1-2003" is his fictional car sold as a collectible.
   * No driver, no team, no race. The existing Dallara/Macau rule above already
   * catches the F3 cars that reach here the same way.
   */
  [/vaillant/, 'fictional car from a comic'],
  /**
   * Trulli's 2010 T127, left out for a naming reason rather than a factual one.
   *
   * The 2010 entrant was "Lotus Racing" (Malaysia), which is NOT the Enstone
   * team that holds Senna's 97T, Mansell's cars, the 2012 E20 and the 2013
   * E21. But findTeam in sync-csv.js matches on `includes`, so a row named
   * "Lotus Racing" would make findTeam('Lotus') ambiguous: both rows contain
   * the word, and `.find()` returns whichever the database hands back first.
   * A future re-import could silently move the Enstone cars.
   *
   * Making exact match win is not the fix -- the comment block on teamMappings
   * records that it was tried and was worse, because it picked a bare
   * "Ferrari" row over "Scuderia Ferrari".
   *
   * So one car waits rather than risking the Lotus hub. Revisit when the
   * 2011 Team Lotus and 2012-14 Caterham rows make the lineage worth a
   * deliberate decision.
   */
  [/(?:^|-)t127(?:-|$)/, 'Lotus Racing would collide with the Enstone Lotus team row'],
];

const dropped = [];
const kept = all.filter(o => {
  /**
   * A rule carrying a native year is skipped when importing that year: the
   * product is the real race car then, not an old chassis at a later test.
   *
   * THE THIRD ELEMENT MAY ALSO BE A PREDICATE on the year, because some cars
   * are native to a RANGE of seasons and a single year cannot say so. The
   * Indy 500 was a championship round for eleven of them, and the Ferrari 375
   * was a real F1 car for three. Same shape as an EVENTS value being a
   * function of the year, for the same reason.
   */
  const native = (nativeYear) =>
    typeof nativeYear === 'function' ? nativeYear(year) : nativeYear === year;
  const hit = EXCLUDE.find(([re, , nativeYear]) => !native(nativeYear) && re.test(o.slug));
  if (hit) { dropped.push([o.urlSku, hit[1]]); return false; }
  if (!yearsIn(o.slug).includes(year)) { dropped.push([o.urlSku, `not a ${year} car`]); return false; }
  if (!o.scale) { dropped.push([o.urlSku, 'no scale on the page']); return false; }
  /**
   * TWO SCALES ONLY, because the CSV has exactly two SKU columns.
   *
   * A row's part number goes into sku_1_18 or sku_1_43 and nowhere else, so a
   * 1:12 or 1:64 product emits a row with BOTH columns empty. sync-csv creates
   * the car before the models, so an empty row produces a car with no models
   * at all -- invisible by construction, and the reason 37 such cars already
   * exist.
   *
   * build-driver-csv gained this guard when a Prost 1:64 did exactly that.
   * The same guard was never carried across to here, and the barcode fix in
   * minichamps-fetch then pulled three more in: a 1:12 RB12 and two 1:64s,
   * which the pre-import check caught as rows with no SKU.
   *
   * Dropped with a reason rather than sent to review: there is nothing a human
   * could decide. The catalogue holds two scales.
   */
  if (o.scale !== '1:18' && o.scale !== '1:43') {
    dropped.push([o.urlSku, `${o.scale} — the CSV holds 1:18 and 1:43 only`]);
    return false;
  }
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
  /**
   * NURBURGRING ALONE, found at 1957. One Tecnomodel Ferrari 801 names the
   * circuit and not the country, where the shop's other German GP slugs all
   * read "allemagne" -- including one that reads both. Without the circuit
   * here, Hawthorn's Nurburgring car split from his Nurburgring car.
   */
  [/allemagne|hockenheim|nurburgring/, 'German GP'],
  [/(?:^|-)france(?:-|$)|castellet/, 'French GP'],
  // HOLLANDE, found at 1955: Brumm names the country in French where every
  // other Dutch GP slug reads "pays-bas". Both are the same Zandvoort round.
  [/pays-bas|zandvoort|hollande/, 'Dutch GP'],
  [/portugal|portimao/, 'Portuguese GP'],
  [/toscane|mugello/, 'Tuscan GP'], [/eifel/, 'Eifel GP'], [/sakhir/, 'Sakhir GP'],
  [/styrie/, 'Styrian GP'],
  /**
   * IMOLA HAS HOSTED THREE DIFFERENTLY NAMED RACES, so this entry carries a
   * function instead of a fixed string:
   *
   *   1980        the ITALIAN GP -- the only year Imola held it, Monza's race
   *   1981-2006   the SAN MARINO GP
   *   2020-       the EMILIA ROMAGNA GP
   *
   * A flat mapping to Emilia Romagna stamped a 2020 name on a 1980 car, and
   * the shop makes it worse by calling the 1980 Imola race "saint-marin" a
   * year before that name existed. Both routes now resolve by season.
   */
  [/emilie-romagne|imola|saint-marin|san-marino/, y =>
    y <= 1980 ? 'Italian GP' : y >= 2020 ? 'Emilia Romagna GP' : null],
  /**
   * 1981-2006 RETURNS NULL ON PURPOSE, so it falls through to "Season".
   *
   * Imola's race in those years was the SAN MARINO GP and naming it so would
   * be more correct -- but five cars across 2002, 2005 and 2006 are ALREADY
   * IMPORTED as "Season", with live slugs that encode it
   * ("2002-ferrari-f2002-michael-schumacher-season"). Returning the right name
   * here would make the generator disagree with the database, and re-running
   * those seasons would create a SECOND car for each and split its models --
   * the fault that produced 17 such pairs across 2017, 2019 and 2020.
   *
   * Correcting it means renaming five cars AND their slugs, which are indexed.
   * That is a deliberate job with a redirect to think about, not a side effect
   * of importing 1980. Recorded in STATUS-SUMMARY as open.
   */
  [/turquie/, 'Turkish GP'], [/qatar/, 'Qatar GP'], [/arabie-saoudite/, 'Saudi Arabian GP'],
  /**
   * FOUR RACES THAT WERE NEVER NAMED HERE, found at 1958.
   *
   * This list grew out of the modern calendar and the gaps only show up when
   * a season needs them. An unmatched round does not fail loudly -- it falls
   * through to "Season", and because a car's identity is
   * team+driver+chassis+event, every unnamed round in a season COLLAPSES INTO
   * ONE CAR. Hawthorn's Argentine Ferrari and his three Moroccan models came
   * out as a single 1958 car on four models.
   *
   *   South African  1962-1984, the big one -- 53 products already imported
   *   Argentine      1958, 1960, 1979-81, 1996
   *   Moroccan       1958 only, the one championship running, at Ain-Diab
   *   Swiss          1951 and 1982 (held at Dijon, in France)
   *
   * Adding them makes the generator disagree with cars already imported as
   * "Season" -- the Imola hazard above. The difference is that Imola is a
   * naming question and this is a merging one, so the repair is worth the
   * redirect. Recorded in STATUS-SUMMARY.
   */
  [/afrique-du-sud|kyalami/, 'South African GP'],
  [/argentine|buenos-aires/, 'Argentine GP'],
  [/(?:^|-)maroc(?:-|$)|ain-diab/, 'Moroccan GP'],
  [/suisse|bremgarten/, 'Swiss GP'],
  /**
   * PESCARA, 1957 only. Sixteen miles of public road along the Adriatic, the
   * longest circuit ever to hold a championship Grand Prix, run once because
   * Monza's organisers fell out with the Italian federation and a replacement
   * round was needed. Moss won it in the Vanwall.
   */
  [/pescara/, 'Pescara GP'],
  /**
   * THE INDIANAPOLIS 500, a round of the World Championship from 1950 to
   * 1960 and reachable here only for those years -- EXCLUDE takes it
   * otherwise. Not called a Grand Prix because it never was one.
   */
  [/indy-500|indianapolis/, 'Indianapolis 500'],
];

/**
 * Chassis by season. Keyed by year so a code cannot leak across seasons -- the
 * mistake that put a 2020 Haas in 2017 before the year filter was tightened.
 */
const CHASSIS = {
  /**
   * 2002. Thin, and Ferrari-shaped: 12 of the shop's F1 products for this
   * season are the F2002, mostly Schumacher's.
   *
   * F2002 must be read before any bare F1 pattern and is matched as a whole
   * token, because "2002" appears in this sitemap as a MODEL NAME -- the BMW
   * 2002 touring car, raced 1968-1971. Four of those sit in the year's slugs
   * and are not 2002 cars at all. A chassis map that only knows F2002, PS02
   * and TF102 refuses them by construction, which is why they land in review
   * rather than under Ferrari.
   */
  2002: [[/(?:^|-)f2002(?:-|$)/, 'F2002'], [/(?:^|-)ps02(?:-|$)/, 'PS02'],
         [/(?:^|-)tf102(?:-|$)/, 'TF102']],
  /**
   * 2013. The last of the V8 era, and the last season this shop covers before
   * the historic block picks up.
   *
   * Red Bull's RB9 must refuse a following digit or it reads out of RB9x
   * codes that do not exist yet but might; Lotus is the E21, a year before the
   * E22. Marussia ran the MR02 and Caterham the CT03, both teams' last but
   * one season.
   */
  /**
   * 2010. Three new teams at the back, and the one naming trap in this block.
   *
   * HRT's car is written "hrt-f1-10", so F110 must be read before F10 or
   * Ferrari's chassis claims it. Ferrari's own F10 is safe either way: the
   * HRT slug has "f1-10" with a hyphen and never the token "f10".
   *
   * T127 is LOTUS RACING, the Malaysian entrant — not the Enstone team this
   * catalogue calls Lotus. They are unrelated: Lotus Racing became Team Lotus
   * in 2011 and Caterham in 2012, while Enstone ran the Renault R30 that year
   * and took the Lotus name in 2012. Filing the T127 under "Lotus" would put
   * Trulli's backmarker on the same hub as Raikkonen's E20 and Senna's 97T.
   */
  /**
   * 1959. Brabham's first title, Vanwall's withdrawal, and Aston Martin's
   * debut -- the DBR4, which lands on the same hub as the 2021 team.
   *
   * Ferrari is 183 of the decade's 355 products, so its spellings matter more
   * here than anywhere: "ferraridino-246-256" is the combined Dino
   * designation, and the optional "dino" segment carries it.
   *
   * Porsche's RSK was an F2-spec car Blanchard entered at Sebring; it started
   * a World Championship round, so it is kept on the same reasoning as the
   * 1966-67 Formula 2 entries.
   */
  /**
   * 1957. FANGIO'S FIFTH AND LAST TITLE, and the Maserati 250F is 16 of the 31
   * kept products -- the single most modelled car of the decade here.
   *
   * THE 250F V12 IS NOT A SEPARATE CHASSIS. Brumm's "250f-12-cylindres" is
   * Behra's Monza car with the V12 engine in the same tub, and the optional
   * segment folds it into the 250F. The two Brumm SKUs that carry it, R223B
   * and R223-UPD, are one tooling and its later re-release; the shop numbers
   * them 6 and 46, so without the fold Behra would hold two Italian GP cars
   * for what is one model.
   */
  /**
   * 1951. Fangio's FIRST title, in the Alfetta 159, and the season Ferrari
   * finally beat Alfa Romeo -- Gonzalez at Silverstone in July, the first
   * championship win for a Ferrari. Both of those cars are here in quantity:
   * 375s are 19 of the 28 kept rows.
   *
   * THE ALFETTA IS SPELLED FOUR WAYS and the model number moves around:
   *
   *   alfa-romeo-159 · alfa-romeo-159-alfetta
   *   alfa-romeo-alfetta-159m · alfa-romeoalfetta-159
   *
   * One optional "alfetta" segment takes all four, including the run-together
   * form with no hyphen after "romeo". The 159M is the late-season engine, not
   * another chassis, so it folds in.
   *
   * THE 375 IS ALSO THE REASON 1952 EXISTS AS A PREDICATE. Here it is simply
   * a championship car: EXCLUDE stands down for 1950-1952 and these come
   * straight in.
   */
  1951: [[/alfa-?romeo-?(?:alfetta-?)?159/, '159'],
         [/f[ae]rrari-?375/, '375']],
  /**
   * 1952. ASCARI WON SIX ROUNDS FROM SIX STARTS in the Ferrari 500 and took
   * the title having skipped the opener -- because he was at INDIANAPOLIS.
   *
   * That is why this season needed the Indy exception. The 375 Indy is a
   * different car from the European 375: 4.5 litres unsupercharged, built for
   * the Brickyard, and Ascari qualified 19th and broke a wheel on lap 40. The
   * only time a reigning World Champion contested the 500 as a championship
   * round. A second car was entered for JOHNNIE PARSONS, a past Indy winner.
   *
   * Kept apart from 1951's plain "375" by its own chassis name, because they
   * are not the same machine.
   */
  1952: [[/f[ae]rrari-?500(?:f2)?/, '500'],
         [/f[ae]rrari-?375/, '375 Indy'],
         [/connaught-?a(?:-|$)/, 'A Type']],
  /**
   * 1953. THE THINNEST SEASON IN THE FILE: four products, and one of them is
   * the BRM V16 at Albi, which EXCLUDE takes. Three Connaught A Types remain.
   *
   * 1952 and 1953 were run to FORMULA 2 RULES -- 2 litres, unsupercharged --
   * because the Alfa Romeo withdrawal left too few F1 cars to fill a grid, so
   * the eligible field is small and the shop reflects that.
   *
   * Connaught was a Send, Surrey outfit financed by Kenneth McAlpine, the only
   * British constructor to score championship points before Vanwall.
   */
  1953: [[/connaught-?a(?:-|$)/, 'A Type']],
  /**
   * 1954. The 2.5-litre formula opens, Mercedes return in July, and Fangio
   * wins the title in two cars for two teams -- Maserati for the first two
   * rounds, Mercedes for the rest.
   *
   * W196C, W196R AND W196 ARE ONE CHASSIS. The shop uses all three, plus
   * "streamliners", and they are NOT the two body styles consistently: three
   * cars appear under two names each, proven by number and round --
   *
   *   Kling 20 at Reims        w196c + w196r
   *   Fangio 18 at Reims       w196c + w196
   *   Fangio 1 at Silverstone  w196c + w196r
   *
   * Splitting on the letter would have split each of those in two. Mercedes
   * did run a streamlined and an open-wheel body on one W196; the shop simply
   * does not track which is which, so neither does this.
   *
   * SQUALO IS ALSO SPELLED WITHOUT ITS NUMBER: Brumm's "ferrari-squalo" is
   * Hawthorn's winning car 38 in Spain, which Tecnomodel and GP Replicas both
   * sell as "ferrari-553-squalo".
   */
  1954: [[/mercedes-?(?:benz-?)?(?:f1-?)?w196/, 'W196'],
         [/f[ae]rrari-?(?:553-?)?squalo/, '553 Squalo'],
         [/maserati-?250f/, '250F']],
  /**
   * 1955. The season Le Mans ended. Eighty-three spectators were killed on
   * 11 June and the French, German, Swiss and Spanish Grands Prix were all
   * cancelled; Switzerland banned circuit racing for fifty-two years. Ascari
   * had died at Monza four weeks earlier. Seven rounds became six.
   *
   * SQUALO AND SUPERSQUALO ARE ONE CAR HERE. Brumm sells Hawthorn's Dutch GP
   * entry as "ferrari-555-squalo" and Tecnomodel sells the same car -- number
   * 2, Zandvoort -- as "ferrari-555-supersqualo". The optional "super" takes
   * both, and ordering is safe either way: "555-supersqualo" cannot match a
   * pattern expecting "squalo" immediately after "555-".
   */
  1955: [[/mercedes(?:-benz)?-?w196/, 'W196'],
         [/f[ae]rrari-?555-?(?:super)?squalo/, '555 Supersqualo'],
         [/f[ae]rrari-?(?:f1-?)?(?:lancia-?)?d50/, 'D50'],
         [/f[ae]rrari-?625/, '625'],
         [/gordini-?t32/, 'T32']],
  /**
   * 1956. Fangio's fourth title in a car he did not want: the LANCIA D50,
   * handed to Ferrari complete when Lancia ran out of money, which is why the
   * shop spells it SIX ways and one of them says Lancia out loud:
   *
   *   ferrari-d50 · ferrari-f1-d50 · ferrarid50
   *   ferrari-f1-d50-long-nose · ferrarid50-long-nose · ferrari-lancia-d50
   *
   * LONG NOSE IS NOT A SEPARATE CHASSIS. It is the Monza bodywork, and all
   * three Monza SKUs are Fangio's car 26 -- one names the circuit rather than
   * the country, which EVENTS already handles. Folded, they are one car.
   *
   * The thin end of the field needs two new marques: Gordini's T32 across
   * four rounds, and the BUGATTI T251, which started once, at Reims, with
   * Trintignant. Bugatti never entered another Grand Prix.
   */
  1956: [[/f[ae]rrari-?(?:f1-?)?(?:lancia-?)?d50/, 'D50'],
         [/bugatti-?t251/, 'T251'],
         [/gordini-?t32/, 'T32'],
         [/vanwall-?vw-?2/, 'VW2'],
         [/brm-?p25/, 'P25']],
  1957: [[/maserati-?250f(?:-12-cylindres)?/, '250F'],
         [/vanwall-?(?:f1-?)?vw5/, 'VW5'],
         [/f[ae]rrari-?801/, '801'],
         [/brm-?p25/, 'P25']],
  /**
   * 1958. The Dino 246 is 30 of the 40 kept products, and it arrives in FIVE
   * spellings -- the 156's problem from 1961, one season earlier:
   *
   *   ferrari-d246 · ferrari-dino-246 · ferrari-246-f1
   *   ferraridino-246 · ferrari-f1-dino-246
   *
   * One pattern takes all five. The "dino-?|d" alternation must try the long
   * form first or "dino-246" matches the bare "d" and then fails on "ino".
   *
   * VANWALL, likewise, is "vanwall-vw5", "vanwall-f1-vw5" and -- from Edicola
   * -- plain "vanwall-57". All three are the one car: Vanwall ran a single
   * design in 1957 and 1958 and took the first constructors' title with it.
   * Edicola is naming the earlier year, not a different chassis.
   */
  1958: [[/vanwall-?(?:f1-?)?vw5/, 'VW5'], [/vanwall-?57/, 'VW5'],
         [/lotus-?16/, '16'], [/lotus-?12/, '12'],
         [/porsche-?rsk/, 'RSK'],
         [/brm-?p25/, 'P25'],
         [/maserati-?250f/, '250F'],
         [/f[ae]rrari-?(?:f1-?)?(?:dino-?|d)?246/, '246']],
  1959: [[/lotus-?16/, '16'],
         [/porsche-?rsk/, 'RSK'],
         [/cooper-?t51/, 'T51'],
         [/brm-?p25/, 'P25'],
         [/f[ae]rrari(?:dino)?-?246-?256/, '246/256'],
         [/aston-?martin-?dbr4/, 'DBR4']],
  /**
   * 1960. Brabham's second title, the last year of the 2.5-litre formula, and
   * the LAST FRONT-ENGINED GRAND PRIX WIN -- Phil Hill's Ferrari at Monza,
   * the race the British teams boycotted.
   *
   * FERRARI APPEARS IN THREE FORMS and the order matters: the 246P is the
   * rear-engined prototype Ginther tested, "ferraridino-246-256" is the
   * combined Dino designation the shop uses, and "ferrari-256-f1" is the 256.
   * 246P must be read first or the prototype folds into the 246/256.
   *
   * ASTON MARTIN'S LAST SEASON -- the DBR4 and DBR5 -- lands on the EXISTING
   * Aston Martin team row, which was created for the 2021 team. David Brown's
   * works outfit and Lawrence Stroll's are unrelated across 61 years, but the
   * names are identical so there is no lookup ambiguity to create, and this
   * catalogue already holds Chapman's Lotus and Enstone's Lotus on one hub.
   * Consistent rather than novel.
   */
  1960: [[/lotus-?18/, '18'], [/lotus-?16/, '16'],
         [/cooper-?t53/, 'T53'], [/cooper-?t51/, 'T51'],
         [/brm-?p25/, 'P25'],
         [/f[ae]rrari-?246p/, '246P'],
         [/f[ae]rrari(?:dino)?-?246-?256/, '246/256'],
         [/f[ae]rrari-?256/, '256'],
         [/aston-?martin-?dbr5/, 'DBR5'], [/aston-?martin-?dbr4/, 'DBR4']],
  /**
   * 1961. Phil Hill's title, and the Monza crash that killed von Trips and
   * fifteen spectators while he led the championship.
   *
   * FERRARI'S 156 IS WRITTEN FIVE WAYS: "ferrari-156", "ferrari156",
   * "ferrari-156-f1-sharknose", "ferrari-f1-156-sharknose",
   * "ferrari-f1-dino-156-sharknose" and "ferraridino-156". One pattern takes
   * all of them, with the optional "f1-" and "dino-" segments doing the work;
   * without it the season's dominant car would scatter across five chassis.
   *
   * Cooper fielded four cars -- T53, T55, T56, T58 -- and the shop also writes
   * "coopert53" without its hyphen. The Lotus 18/21 hybrid is read before the
   * plain 21 and 18, as in 1962.
   */
  1961: [[/lotus-?18-?21/, '18/21'], [/lotus-?21/, '21'], [/lotus-?18/, '18'],
         [/cooper-?t58/, 'T58'], [/cooper-?t56/, 'T56'],
         [/cooper-?t55/, 'T55'], [/cooper-?t53/, 'T53'],
         [/f[ae]rrari-?(?:f1-?)?(?:dino-?)?156/, '156'],
         [/porsche-?787/, '787']],
  /**
   * 1962. Graham Hill's first title in the BRM P57, and PORSCHE'S ONLY GRAND
   * PRIX WIN -- Gurney in the 804 at Rouen.
   *
   * THE LOTUS 18/21 IS ONE CHASSIS, not two numbers: a 1961 18 rebodied with
   * 21 panels. "lotus-18-21-12" must be read before the plain 21 or the
   * hybrid would split. Three Porsches and three Coopers in one season too.
   *
   * The shop also writes BRM without its hyphen -- "brmp57".
   */
  1962: [[/porsche-?804/, '804'], [/porsche-?787/, '787'], [/porsche-?718/, '718'],
         [/cooper-?t60/, 'T60'], [/cooper-?t55/, 'T55'], [/cooper-?t53/, 'T53'],
         [/lotus-?18-?21/, '18/21'],
         [/lotus-?25/, '25'], [/lotus-?24/, '24'], [/lotus-?21/, '21'],
         [/brm-?p57/, 'P57'],
         [/brab+ham-?bt3(?![0-9])/, 'BT3'],
         [/f[ae]rrari-?156/, '156'],
         [/lola-?mk4/, 'Mk4']],
  /**
   * 1963. Clark's first title, won in the Lotus 25.
   *
   * PORSCHE appears as a works team here -- the 718 at the Nurburgring -- and
   * the marque also turns up in this catalogue as a ROAD CAR, the 953 that ran
   * Dakar. Anchoring the chassis to the marque keeps them apart.
   *
   * Honda's RA270 is the PROTOTYPE Brabham tested in 1963, a year before Honda
   * raced. Kept as a 1963 test car, the same way the catalogue holds Paul
   * Ricard and Fiorano test entries.
   */
  1963: [[/porsche-?718/, '718'],
         [/lola-?mk4/, 'Mk4'],
         [/lotus-?25/, '25'], [/lotus-?24/, '24'],
         [/cooper-?t60/, 'T60'],
         [/brab+ham-?bt7(?![0-9])/, 'BT7'], [/brab+ham-?bt3(?![0-9])/, 'BT3'],
         [/brm-?p61/, 'P61'], [/brm-?p57/, 'P57'],
         [/f[ae]rrari-?156/, '156'],
         [/honda-?ra270/, 'RA270']],
  /**
   * 1964. Surtees' title, and the only man to win world championships on two
   * wheels and four.
   *
   * Ferrari ran THREE chassis: the 156, the 158 that won the title, and the
   * 1512 which the shop writes as "ferrari-512" here exactly as it does in
   * 1965. The 158 appears three ways -- "ferrari-158", "ferrari158" and
   * "ferrari-158-f1" with the car number after it.
   *
   * MIKE HAILWOOD belongs here and GIACOMO AGOSTINI does not, though both are
   * motorcycle world champions. Hailwood started championship Grands Prix;
   * Agostini only appeared at the non-championship Race of Champions. The test
   * is the race, not the man.
   */
  1964: [[/brm-?p261/, 'P261'], [/brm-?p57/, 'P57'],
         [/brab+ham-?bt11/, 'BT11'], [/brab+ham-?bt0?7(?![0-9])/, 'BT7'],
         [/lotus-?(?:brm-?)?25/, '25'],
         [/f[ae]rrari-?1?512/, '1512'], [/f[ae]rrari-?158/, '158'],
         [/f[ae]rrari-?156/, '156'],
         [/honda-?ra271/, 'RA271']],
  /**
   * 1965. Clark's second title and the last year of the 1.5-litre formula.
   *
   * FERRARI'S FLAT-12 IS THE 1512 AND THE SHOP WRITES IT BOTH WAYS --
   * Looksmart says "ferrari-1512", Brumm and Tecnomodel say "ferrari-512".
   * One pattern takes both, or Surtees' Italian GP would split across two
   * chassis. Note this is NOT the 512S sports car of 1970; here it is the F1
   * car, which is why it is anchored to the marque.
   *
   * Brabham's BT7 appears as "bt7" and "bt07" with a leading zero.
   */
  1965: [[/brm-?p261/, 'P261'], [/brm-?p57/, 'P57'],
         [/lotus-?33/, '33'], [/lotus-?25/, '25'],
         [/f[ae]rrari-?1?512/, '1512'], [/f[ae]rrari-?158/, '158'],
         [/brab+ham-?bt11/, 'BT11'], [/brab+ham-?bt0?7(?![0-9])/, 'BT7'],
         [/cooper-?t60/, 'T60'], [/honda-?ra272/, 'RA272']],
  /**
   * 1966. The first year of the 3-litre formula, which is why the grid is
   * scrappy: teams ran interim cars while the new engines were built, so
   * Brabham alone fielded the BT19, BT20, BT22, BT11 and BT7, and Ferrari ran
   * the 246 Dino V6 alongside the new 312.
   *
   * ENGINE NAMES APPEAR IN THE SLUG, and the marque comes first in all of
   * them -- "lotus-brm-43", "cooper-maserati-t81", "lotus-43-brm" -- so the
   * earliest-match team read lands on the constructor rather than the engine
   * supplier. That is the trap that once put Prost's Williams under Renault,
   * and it is why the team tally is checked rather than assumed.
   */
  1966: [[/cooper-?(?:maserati-?)?t81/, 'T81'],
         [/brm-?p83/, 'P83'], [/brm-?p261/, 'P261'],
         [/brab+ham-?bt22/, 'BT22'], [/brab+ham-?bt20/, 'BT20'],
         [/brab+ham-?bt19/, 'BT19'], [/brab+ham-?bt11/, 'BT11'],
         [/brab+ham-?bt7(?![0-9])/, 'BT7'],
         [/lotus-?(?:brm-?)?43/, '43'], [/lotus-?33/, '33'],
         [/f[ae]rrari-?312/, '312'], [/f[ae]rrari-?246/, '246'],
         [/matra-?ms5/, 'MS5'], [/honda-?ra273/, 'RA273']],
  /**
   * 1967. Hulme's title, the Lotus 49 and the Cosworth DFV arriving at
   * Zandvoort, and Jim Clark's last full season.
   *
   * FORMULA 2 CARS RAN IN F1 RACES THIS YEAR. The German GP at the
   * Nurburgring fielded an F2 class alongside the F1 field, so the Matra MS7,
   * Lola T100 and Protos 16 started World Championship Grands Prix without
   * being eligible for points. They are kept, because they appear in the
   * results of races this catalogue holds.
   *
   * Eagle's car is written both "t1g" and "mki" -- Mk1 in Roman numerals --
   * and BRUCE McLAREN DROVE ONE, which is why his full-name key matters: the
   * slug "eagle-mki-8-bruce-mclaren-f1-1967" has a marque that is also a
   * driver, and neither is the team here.
   *
   * Honda appears as "honda-ra273", "hondara273" and "honda-ra300n".
   */
  1967: [[/brm-?p261/, 'P261'], [/brm-?p115/, 'P115'], [/brm-?p83/, 'P83'],
         [/matra-?ms7/, 'MS7'],
         [/lotus-?49/, '49'], [/lotus-?43/, '43'], [/lotus-?33/, '33'],
         [/lotus-?25/, '25'],
         [/f[ae]rrari-?312/, '312'],
         [/brab+ham-?(?:repco-?)?bt24/, 'BT24'], [/brab+ham-?(?:repco-?)?bt20/, 'BT20'],
         [/brab+ham-?(?:repco-?)?bt19/, 'BT19'], [/brab+ham-?(?:repco-?)?bt11/, 'BT11'],
         [/cooper-?t86/, 'T86'], [/cooper-?t81/, 'T81'],
         [/eagle-?t1g/, 'T1G'], [/eagle-?mki(?:-|$)/, 'Mk1'],
         [/lds-?mk3/, 'Mk3'], [/lola-?t100/, 'T100'], [/protos-?16/, 'Protos 16'],
         [/honda-?ra300/, 'RA300'], [/honda-?ra273/, 'RA273']],
  /**
   * 1968. Graham Hill's second title, Jim Clark's last win, and the year
   * sponsorship arrived with the Gold Leaf Lotus.
   *
   * A FACTUAL TRAP THAT WOULD HAVE MISFILED FOUR CARS. Tecnomodel labels the
   * 1968 Ferrari "312b", but the 312B is the 1970 car -- B for Boxer, the
   * flat-12 -- and 1968 ran the V12 312. The same car appears both ways from
   * the same maker:
   *
   *   ferrari-312b-26-jacky-ickx-f1-winner-france-1968
   *   ferrari-312-with-driver-26-jacky-ickx-f1-winner-france-1968
   *
   * So in THIS season both spellings resolve to 312. The 1969 and 1970 maps
   * keep them apart, which is exactly what a per-year map is for.
   *
   * Cooper ran three cars: T86B, T86 and T81B. T86B before T86, same shape as
   * 49B before 49.
   */
  1968: [[/matra-?(?:simca-?)?ms11/, 'MS11'], [/matra-?(?:simca-?)?ms10/, 'MS10'],
         [/matra-?(?:simca-?)?ms9/, 'MS9'], [/matra-?(?:simca-?)?ms7/, 'MS7'],
         [/mclaren-?m7a/, 'M7A'],
         [/f[ae]rrari-?(?:f1-?)?312b?/, '312'],
         [/brab+ham-?bt26/, 'BT26'], [/brab+ham-?bt24/, 'BT24'], [/brab+ham-?bt11/, 'BT11'],
         [/lotus-?49b/, '49B'], [/lotus-?49(?![bc0-9])/, '49'],
         [/brm-?p138/, 'P138'], [/brm-?p133/, 'P133'], [/brm-?p126/, 'P126'],
         [/brm-?p261/, 'P261'],
         [/cooper-?t86b/, 'T86B'], [/cooper-?t86(?!b)/, 'T86'], [/cooper-?t81b/, 'T81B'],
         [/honda-?ra301/, 'RA301'], [/honda-?ra302/, 'RA302']],
  /**
   * 1969. Stewart's title year with Matra, and the season of the FOUR-WHEEL
   * DRIVE experiment -- the Lotus 63 appears five times.
   *
   * THREE ORDERING TRAPS, all the same shape: a suffix letter makes a
   * different car. 49B before 49 (and 1970's 49C is a third), BT26A before
   * BT26, and 312B before 312. Ferrari's bare 312 is the 1967-69 car; the
   * 312B that Amon tested at Fiorano in late 1969 is the 1970 one, kept here
   * because the test happened in the 1969 season -- the catalogue already
   * holds "Paul Ricard Test" and "Canada Test" entries on the same reasoning.
   *
   * "lotus-63-1t" is the T-car, the spare, as with Ickx's 312B in 1970.
   *
   * LDS was a SOUTH AFRICAN constructor -- Louis Douglas Serrurier built them
   * and they ran only at Kyalami. One product, Sam Tingle's Mk3.
   */
  1969: [[/matra-?(?:simca-?)?ms80/, 'MS80'], [/matra-?(?:simca-?)?ms11/, 'MS11'],
         [/matra-?(?:simca-?)?ms10/, 'MS10'],
         [/mclaren-?m7a/, 'M7A'],
         [/f[ae]rrari-?(?:f1-?)?312b/, '312B'], [/f[ae]rrari-?(?:f1-?)?312(?![0-9b])/, '312'],
         [/brab+ham-?bt26a/, 'BT26A'], [/brab+ham-?bt26(?![a0-9])/, 'BT26'],
         [/brab+ham-?bt30/, 'BT30'], [/brab+ham-?bt24/, 'BT24'], [/brab+ham-?bt20/, 'BT20'],
         [/lotus-?49b/, '49B'], [/lotus-?63/, '63'], [/lotus-?59/, '59'],
         [/lotus-?49(?![bc0-9])/, '49'],
         [/lds-?mk3/, 'Mk3'],
         [/brm-?p139/, 'P139'], [/brm-?p138/, 'P138'], [/brm-?p133/, 'P133'],
         [/cooper-?t86b/, 'T86B']],
  /**
   * 1970. The season before the catalogue used to begin, and the first of the
   * pre-1971 block.
   *
   * Lotus ran THREE chassis: the 72C, the earlier 72, and the 49C that Graham
   * Hill drove for Rob Walker. 72C is tested before 72 or the newer car reads
   * as the older one. Lotus numbers are bare integers, so all three are
   * anchored to the marque -- same reason as Tyrrell's 009.
   *
   * "ferrari-312b-t-car" is the SPARE: T for training, not a chassis variant,
   * so it reads as a 312B. Ferrari's 312 family needs the B anchored exactly
   * -- the bare 312 is 1967-69 and the 312T arrives in 1975.
   *
   * Two shop spellings absorbed: "brabbham" doubles a b, and Matra appears as
   * "matra-simca-ms120", "matra-ms120" and "matra-simcams120".
   */
  1970: [[/f[ae]rrari-?312b/, '312B'],
         [/matra-?(?:simca-?)?ms120/, 'MS120'],
         [/lotus-?(?:ford-?)?72c/, '72C'], [/lotus-?(?:ford-?)?72(?![0-9c])/, '72'],
         [/lotus-?(?:ford-?)?49c/, '49C'],
         [/brm-?p153/, 'P153'], [/brm-?p139/, 'P139'],
         [/mclaren-?m14a/, 'M14A'], [/mclaren-?m14d/, 'M14D'], [/mclaren-?m7d/, 'M7D'],
         [/march-?701/, '701'],
         [/brab+ham-?bt33/, 'BT33'], [/brab+ham-?bt26a/, 'BT26A'],
         [/surtees-?ts7/, 'TS7'], [/de-tomaso/, '505']],
  /**
   * 1979-1980. The deepest grids in this file: fourteen constructors a season,
   * several of them gone within two years.
   *
   * Nearly every chassis name in this era is a bare number or a letter and a
   * digit -- 009, 177, A1, D2, F6, M28 -- which is far too loose to match on
   * its own. A free "009" or "a1" would hit part numbers all over the
   * catalogue. EVERY ONE IS ANCHORED TO ITS MARQUE, which is also how the
   * hyphenation variants get absorbed: "alfa-romeo-177" and "alfa-romeo177",
   * "ferrari-312-t4" and "ferrari312t4", "renault-rs10" and "renaultrs10".
   *
   * Order matters twice. FW07B and FW07C are tested before FW07, and 312T5
   * before 312T4 would be wrong the other way, so each is anchored exactly.
   * Arrows A1B is tested before A1.
   */
  1979: [[/f[ae]rrari-?312-?t4/, '312T4'],
         [/lotus-?(?:ford-?)?(?:type-?)?80(?:-|$)/, 'Lotus 80'],
         [/lotus-?(?:ford-?)?79(?:-|$)/, 'Lotus 79'],
         [/mclaren-?(?:ford-?)?m29/, 'M29'], [/mclaren-?(?:ford-?)?m28/, 'M28'],
         [/shadow-?dn9/, 'DN9'],
         [/ensign-?n179/, 'N179'], [/ensign-?n177/, 'N177'],
         [/brabham-?(?:alfa-?romeo-?)?bt49/, 'BT49'],
         [/brabham-?(?:alfa-?romeo-?)?bt48/, 'BT48'],
         [/brabham-alfa-romeo/, 'BT48'],
         [/williams-?(?:ford-?|cosworth-?)?fw07/, 'FW07'],
         [/williams-?(?:ford-?|cosworth-?)?fw06/, 'FW06'],
         [/arrows-?(?:ford-?)?a1b/, 'A1B'], [/arrows-?(?:ford-?)?a2/, 'A2'],
         [/arrows-?(?:ford-?)?a1(?:-|$)/, 'A1'],
         [/alfa-?romeo-?179/, 'Alfa 179'], [/alfa-?romeo-?177/, 'Alfa 177'],
         [/tyrrell-?009/, '009'], [/tyrrell-?008/, '008'],
         [/ligier-?(?:ford-?)?js11/, 'JS11'],
         [/renault-?rs12/, 'RS12'], [/renault-?rs11/, 'RS11'],
         [/renault-?rs10/, 'RS10'], [/renault-?rs01/, 'RS01'],
         [/rebaque-?hr100/, 'HR100'], [/copersucar-?f6/, 'F6'],
         [/ats-?d2/, 'D2']],
  1980: [[/f[ae]rrari-?312-?t5/, '312T5'], [/f[ae]rrari-?126-?c(?:-|$|[0-9])/, '126C'],
         [/alfa-?romeo-?179/, 'Alfa 179'],
         [/williams-?(?:ford-?)?fw07c/, 'FW07C'],
         [/williams-?(?:ford-?)?fw07b/, 'FW07B'],
         [/williams-?(?:ford-?)?fw07(?:-|$)/, 'FW07'],
         [/ensign-?n180/, 'N180'],
         [/mclaren-?m30/, 'M30'], [/mclaren-?m29/, 'M29'],
         [/ats-?d4/, 'D4'], [/brabham-?bt49/, 'BT49'],
         [/renault-?re20/, 'RE20'], [/ligier-?(?:ford-?)?js11/, 'JS11'],
         [/lotus-?81/, 'Lotus 81'], [/osella-?fa1/, 'FA1'],
         [/fittipaldi-?f8/, 'F8'], [/fittipaldi-?f7/, 'F7'],
         [/arrows-?a3/, 'A3'], [/tyrrell-?010/, '010']],
  /**
   * 1995-2001. This era hyphenates inconsistently, so the chassis token has to
   * tolerate it: "ferrari-412-t2", "ferrari-412t2" and "ferrari412-t2" are one
   * car, and "williamsrenault-fw18" sits beside "williams-renault-fw18".
   *
   * F310B is tested BEFORE F310 or the 1997 car reads as the 1996 one.
   *
   * Three tokens are far too loose to match bare and are anchored to the
   * marque: Tyrrell's 023 and 024, Jordan's 196/198/199, Jaguar's R2, and
   * BAR's 002. A free-floating "023" or "r2" would match part numbers all
   * over the catalogue.
   *
   * Ferrari's 2000 car is literally called the F1-2000, which is the one
   * chassis name in this file that contains both "f1" and a year.
   */
  1995: [[/412-?t2/, '412T2'], [/(?:^|-)b195(?:-|$)/, 'B195'], [/js41/, 'JS41'],
         [/tyrrell[a-z-]*-023/, '023'], [/s951/, 'S951']],
  1996: [[/f310b/, 'F310B'], [/f310/, 'F310'], [/fw18/, 'FW18'], [/mp4-?11/, 'MP4-11'],
         [/b196/, 'B196'], [/js43/, 'JS43'], [/jordan[a-z-]*-196(?:-|$)/, '196'],
         [/tyrrell[a-z-]*-024/, '024'], [/fg01/, 'FG01']],
  1997: [[/f310b/, 'F310B'], [/fw19/, 'FW19'], [/(?:^|-)c16(?:-|$)/, 'C16'],
         [/mp4-?12/, 'MP4-12'], [/(?:^|-)a18(?:-|$)/, 'A18']],
  1998: [[/mp4-?13/, 'MP4-13'], [/jordan[a-z-]*-198(?:-|$)|198-mugen/, '198'],
         [/f300/, 'F300'], [/ap01/, 'AP01']],
  1999: [[/mp4-?14/, 'MP4-14'], [/f399/, 'F399'],
         [/jordan[a-z-]*-199(?:-|$)|199-mugen/, '199'], [/(?:^|-)sf3(?:-|$)/, 'SF3']],
  2000: [[/f1-2000/, 'F1-2000'], [/mp4-?15/, 'MP4-15'], [/bar[a-z-]*-002|002-honda/, '002']],
  2001: [[/ps01/, 'PS01'], [/mp4-?16/, 'MP4-16'], [/f2001/, 'F2001'],
         [/(?:^|-)c20(?:-|$)/, 'C20'], [/fw23/, 'FW23'], [/jaguar[a-z-]*-r2(?:-|$)/, 'R2']],
  /**
   * 2003-2009. Three naming traps, all found by reading the slugs.
   *
   * One 2003 Sauber is written "sauber-c2-petronas" -- the shop dropped a
   * digit from C22 -- so the pattern has to accept both or Frentzen's car is
   * lost. McLaren's 2008 car appears as both "mp4-23" and "mp423". And BAR's
   * 2005 chassis is literally called 007, which is far too loose a token to
   * match bare, so it is anchored to the marque.
   *
   * Ferrari's 2006 car is the 248 F1, whose bare number would collide with any
   * part number containing 248; anchored to the marque for the same reason.
   */
  2003: [[/(?:^|-)c22(?:-|$)|sauber-c2-petronas/, 'C22'], [/mp4-?18/, 'MP4-18'],
         [/jaguar-r4(?:-|$)/, 'R4']],
  2004: [[/(?:^|-)f2004(?:-|$)/, 'F2004'], [/mp4-?19/, 'MP4-19'],
         [/(?:^|-)r24(?:-|$)/, 'R24'], [/fw26/, 'FW26'], [/ej14/, 'EJ14'],
         [/tf104b?/, 'TF104B']],
  2005: [[/mp4-?20/, 'MP4-20'], [/(?:^|-)r25(?:-|$)/, 'R25'],
         [/bar-007(?:-|$)/, '007'], [/(?:^|-)f2005(?:-|$)/, 'F2005']],
  2006: [[/c24b/, 'C24B'], [/(?:^|-)r26(?:-|$)/, 'R26'], [/mp4-?21/, 'MP4-21'],
         [/ra106/, 'RA106'], [/ferrari-f?248(?:-|$)/, '248 F1']],
  2007: [[/(?:^|-)f2007(?:-|$)/, 'F2007'], [/mp4-?22/, 'MP4-22']],
  2008: [[/(?:^|-)r28(?:-|$)/, 'R28'], [/mp4-?23|mp423/, 'MP4-23'],
         [/(?:^|-)str3(?:-|$)/, 'STR3'], [/(?:^|-)f1-?08(?:-|$)|(?:^|-)f108(?:-|$)/, 'F1.08']],
  2009: [[/bgp-?001/, 'BGP001']],
  2010: [[/(?:^|-)rb6(?![0-9])/, 'RB6'], [/(?:^|-)c29(?:-|$)/, 'C29'],
         [/str5(?![0-9])/, 'STR5'], [/hrt-f1-?10|(?:^|-)f110(?:-|$)/, 'F110'],
         [/(?:^|-)f10(?:-|$)/, 'F10'], [/fw32/, 'FW32'], [/vr-?01/, 'VR-01']],
  /**
   * 2011. Mercedes wrote its car MGP W02, so the token is w02 rather than a
   * bare W. Sauber's C30 appears as "sauber-c30-ferrari" in one slug, with
   * the engine attached.
   */
  2011: [[/(?:^|-)rb7(?![0-9])/, 'RB7'], [/mp4-?26/, 'MP4-26'],
         [/(?:^|-)w02(?:-|$)/, 'W02'], [/fw33/, 'FW33'],
         [/(?:^|-)c30(?:-|$)/, 'C30'], [/str6(?![0-9])/, 'STR6'],
         [/vjm04/, 'VJM04']],
  /**
   * 2012. Schumacher's last season and Vettel's third title.
   *
   * F2012 must be read before the bare year token or "ferrari-f2012-f1-2012"
   * loses its chassis -- same shape as 2013's F138 also being written f2013.
   *
   * MP4-27 is safe from the historic-McLaren exclusion above, which matches a
   * SINGLE digit after "mp4-": that rule catches MP4/4 and MP4/6 at modern
   * events and leaves two-digit modern codes alone.
   *
   * Only ONE Lotus here, which is the thing to check rather than assume. In
   * 2011 "Team Lotus" and "Lotus Renault GP" were different entrants, but by
   * 2012 the backmarker had become Caterham and the shop labels it so. The
   * E20 is Lotus F1, which is what 2013's E21 is already filed under.
   */
  2012: [[/(?:^|-)w03(?:-|$)/, 'W03'], [/(?:^|-)f2012(?:-|$)/, 'F2012'],
         [/(?:^|-)rb8(?![0-9])/, 'RB8'], [/(?:^|-)e20(?:-|$)/, 'E20'],
         [/vjm05/, 'VJM05'], [/fw34/, 'FW34'], [/str7(?![0-9])/, 'STR7'],
         [/mp4-?27/, 'MP4-27'], [/(?:^|-)c31(?:-|$)/, 'C31'],
         [/(?:^|-)ct01(?:-|$)/, 'CT01']],
  2013: [[/(?:^|-)w04(?:-|$)/, 'W04'], [/f138|(?:^|-)f2013(?:-|$)/, 'F138'], [/rb9(?![0-9])/, 'RB9'],
         [/vjm06/, 'VJM06'], [/fw35/, 'FW35'], [/(?:^|-)e21(?:-|$)/, 'E21'],
         [/str8(?![0-9])/, 'STR8'], [/mp4-?28/, 'MP4-28'],
         [/(?:^|-)c32(?:-|$)/, 'C32'], [/mr02/, 'MR02'], [/(?:^|-)ct03(?:-|$)/, 'CT03']],
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
/**
 * ONE CHASSIS, TWO CONSTRUCTORS, DEPENDING ON THE YEAR.
 *
 * CHASSIS_TEAM is keyed by chassis alone, which is right until a car changes
 * hands mid-career. The D50 is the case that breaks it: LANCIA built it and
 * raced it in 1954 and 1955, and when Lancia ran out of money weeks after
 * Ascari was killed, the whole team -- cars, drawings, Jano -- was handed to
 * Ferrari, who won the 1956 title with it.
 *
 * So the 1955 D50 is a Lancia and the 1956 D50 is a Ferrari, and the slug
 * cannot settle it: Edicola calls Ascari's 1955 Monaco car a
 * "lancia-ferrari-d50" using the name collectors give the later Ferrari.
 *
 * Checked before CHASSIS_TEAM, so the plain map stays the common case.
 */
const CHASSIS_TEAM_YEAR = {
  1955: { D50: 'Lancia' },
};

const CHASSIS_TEAM = {
  // 1951.
  '159': 'Alfa Romeo', '375': 'Ferrari',
  // 1952.
  '500': 'Ferrari', '375 Indy': 'Ferrari',
  // 1953.
  'A Type': 'Connaught',
  // 1954.
  '553 Squalo': 'Ferrari',
  // 1955.
  '625': 'Ferrari', '555 Supersqualo': 'Ferrari', W196: 'Mercedes',
  // 1956.
  D50: 'Ferrari', T251: 'Bugatti', T32: 'Gordini', VW2: 'Vanwall',
  // 1957.
  '801': 'Ferrari',
  // 1958.
  VW5: 'Vanwall', '12': 'Lotus', '250F': 'Maserati',
  // 1959.
  RSK: 'Porsche',
  // 1960.
  '16': 'Lotus', T51: 'Cooper', P25: 'BRM', '246P': 'Ferrari',
  '246/256': 'Ferrari', '256': 'Ferrari',
  DBR4: 'Aston Martin', DBR5: 'Aston Martin',
  // 1961.
  '18': 'Lotus', T56: 'Cooper', T58: 'Cooper',
  // 1962.
  '804': 'Porsche', '787': 'Porsche', T53: 'Cooper', T55: 'Cooper',
  '18/21': 'Lotus', '21': 'Lotus',
  // 1963.
  '718': 'Porsche', Mk4: 'Lola', '24': 'Lotus', P61: 'BRM', BT3: 'Brabham',
  RA270: 'Honda',
  // 1964.
  '156': 'Ferrari', RA271: 'Honda',
  // 1965.
  P57: 'BRM', '158': 'Ferrari', '1512': 'Ferrari', T60: 'Cooper', RA272: 'Honda',
  // 1966.
  '246': 'Ferrari', BT22: 'Brabham', BT7: 'Brabham', MS5: 'Matra',
  // 1967.
  P115: 'BRM', P83: 'BRM', '25': 'Lotus', '43': 'Lotus', '33': 'Lotus',
  BT19: 'Brabham', T81: 'Cooper', T1G: 'Eagle', Mk1: 'Eagle',
  T100: 'Lola', 'Protos 16': 'Protos', RA273: 'Honda', RA300: 'Honda',
  // 1968.
  MS9: 'Matra', MS7: 'Matra', BT11: 'Brabham', P126: 'BRM', P261: 'BRM',
  T86: 'Cooper', T81B: 'Cooper', RA301: 'Honda', RA302: 'Honda',
  // 1969.
  MS80: 'Matra', MS11: 'Matra', MS10: 'Matra', M7A: 'McLaren', '312': 'Ferrari',
  BT26: 'Brabham', BT24: 'Brabham', BT20: 'Brabham', BT30: 'Brabham',
  '49B': 'Lotus', '63': 'Lotus', '59': 'Lotus', '49': 'Lotus',
  Mk3: 'LDS', P138: 'BRM', P133: 'BRM', T86B: 'Cooper',
  // 1970.
  '312B': 'Ferrari', MS120: 'Matra', '72C': 'Lotus', '72': 'Lotus', '49C': 'Lotus',
  P153: 'BRM', P139: 'BRM', M14A: 'McLaren', M14D: 'McLaren', M7D: 'McLaren',
  '701': 'March', BT33: 'Brabham', BT26A: 'Brabham', TS7: 'Surtees', '505': 'De Tomaso',
  /**
   * 1979-1980. Copersucar and Fittipaldi are the SAME outfit -- Fittipaldi
   * Automotive, entered as Copersucar-Fittipaldi through 1979 and as
   * Fittipaldi after. Kept as two rows under the names each season raced
   * under, which is what this catalogue does for HRT, Virgin and the Sauber
   * lineage, and the chassis differ too (F6 against F7 and F8).
   */
  '312T4': 'Ferrari', 'Lotus 79': 'Lotus', 'Lotus 80': 'Lotus',
  M28: 'McLaren', M29: 'McLaren', DN9: 'Shadow', N179: 'Ensign', N177: 'Ensign',
  BT48: 'Brabham', BT49: 'Brabham', FW06: 'Williams', FW07: 'Williams',
  A1: 'Arrows', A1B: 'Arrows', A2: 'Arrows',
  'Alfa 177': 'Alfa Romeo', 'Alfa 179': 'Alfa Romeo',
  '009': 'Tyrrell', '008': 'Tyrrell', JS11: 'Ligier',
  RS01: 'Renault', RS10: 'Renault', RS11: 'Renault', RS12: 'Renault',
  HR100: 'Rebaque', F6: 'Copersucar', D2: 'ATS',
  '312T5': 'Ferrari', '126C': 'Ferrari', FW07B: 'Williams', FW07C: 'Williams',
  N180: 'Ensign', M30: 'McLaren', D4: 'ATS', RE20: 'Renault',
  'Lotus 81': 'Lotus', FA1: 'Osella', F7: 'Fittipaldi', F8: 'Fittipaldi',
  A3: 'Arrows', '010': 'Tyrrell',
  // 1995-2001. Eight teams that no longer exist in any form.
  '412T2': 'Ferrari', B195: 'Benetton', JS41: 'Ligier', '023': 'Tyrrell', S951: 'Simtek',
  F310: 'Ferrari', FW18: 'Williams', 'MP4-11': 'McLaren', B196: 'Benetton',
  JS43: 'Ligier', '196': 'Jordan', '024': 'Tyrrell', FG01: 'Forti',
  F310B: 'Ferrari', FW19: 'Williams', C16: 'Sauber', 'MP4-12': 'McLaren', A18: 'Arrows',
  'MP4-13': 'McLaren', '198': 'Jordan', F300: 'Ferrari', AP01: 'Prost',
  'MP4-14': 'McLaren', F399: 'Ferrari', '199': 'Jordan', SF3: 'Stewart',
  'F1-2000': 'Ferrari', 'MP4-15': 'McLaren', '002': 'BAR',
  PS01: 'Minardi', 'MP4-16': 'McLaren', F2001: 'Ferrari', C20: 'Sauber',
  FW23: 'Williams', R2: 'Jaguar',
  // 2003-2009. RA106 is filed under Honda, not BAR: the team was Honda Racing
  // by 2006 and the "bar-ra106-honda" slugs are the shop being loose with a
  // name that had already changed. BAR keeps the 2005 chassis, the 007.
  // F1.08 is BMW Sauber, which findTeam resolves to the Sauber lineage by era
  // rather than needing a row of its own -- the same treatment Alfa Romeo and
  // Kick Sauber get, and the reason it does not collide the way Lotus did.
  C22: 'Sauber', 'MP4-18': 'McLaren', R4: 'Jaguar',
  F2004: 'Ferrari', 'MP4-19': 'McLaren', R24: 'Renault', FW26: 'Williams', EJ14: 'Jordan',
  TF104B: 'Toyota', F2005: 'Ferrari',
  'MP4-20': 'McLaren', R25: 'Renault', '007': 'BAR',
  C24B: 'Sauber', R26: 'Renault', 'MP4-21': 'McLaren', RA106: 'Honda', '248 F1': 'Ferrari',
  F2007: 'Ferrari', 'MP4-22': 'McLaren',
  R28: 'Renault', 'MP4-23': 'McLaren', STR3: 'Toro Rosso', 'F1.08': 'Sauber',
  BGP001: 'Brawn GP',
  // 2002. Minardi and Toyota are new team rows; Ferrari resolves to the
  // existing "Scuderia Ferrari" through teamMappings.
  F2002: 'Ferrari', PS02: 'Minardi', TF102: 'Toyota',
  // 2010-2011. T127 is Lotus RACING, the Malaysian team that became Caterham,
  // and is deliberately not "Lotus" — see the chassis note above. Named for
  // the season it raced in rather than its successor, which is what every
  // other era-specific name in this file does.
  RB6: 'Red Bull', C29: 'Sauber', STR5: 'Toro Rosso', F10: 'Ferrari',
  FW32: 'Williams', T127: 'Lotus Racing', F110: 'HRT', 'VR-01': 'Virgin Racing',
  RB7: 'Red Bull', 'MP4-26': 'McLaren', W02: 'Mercedes', FW33: 'Williams',
  C30: 'Sauber', STR6: 'Toro Rosso', VJM04: 'Force India',
  // 2012. CT01 is Caterham, not Lotus — the backmarker had been renamed by
  // then, and the E20 is the Enstone team the catalogue already calls Lotus
  // for 2013's E21.
  W03: 'Mercedes', F2012: 'Ferrari', RB8: 'Red Bull', E20: 'Lotus',
  VJM05: 'Force India', FW34: 'Williams', STR7: 'Toro Rosso',
  'MP4-27': 'McLaren', C31: 'Sauber', CT01: 'Caterham',
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
  W04: 'Mercedes', F138: 'Ferrari', RB9: 'Red Bull', VJM06: 'Force India',
  FW35: 'Williams', E21: 'Lotus', STR8: 'Toro Rosso', 'MP4-28': 'McLaren',
  C32: 'Sauber', MR02: 'Marussia', CT03: 'Caterham',
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
  // 2013 only: Webber's last season, Di Resta at Force India, Van der Garde
  // and Pic at Caterham, Bottas's debut at Williams.
  webber: 'Mark Webber', 'di-resta': 'Paul di Resta', 'van-der-garde': 'Giedo van der Garde',
  /**
   * BRUNO SENNA, keyed on the full name and never on the surname.
   *
   * He drove the 2012 Williams FW34. A bare `senna` key would take Ayrton's
   * 50 cars with it, which is the same collision as Graham and Damon Hill
   * forty years apart. There is deliberately no `senna` entry in this map:
   * Ayrton is imported by build-driver-csv, which keys on the cache file
   * rather than the slug and cannot confuse the two.
   */
  'bruno-senna': 'Bruno Senna',
  /**
   * MICHAEL SCHUMACHER, for the same reason and caught the same way.
   *
   * `schumacher` maps to Mick, who raced for Haas in 2021-22 and was thirteen
   * in 2012. Without this key his father's Mercedes W03 imports under his
   * son's name. Found by reading the --review driver tally and seeing "Mick
   * Schumacher 2" in a 2012 season.
   *
   * SURNAMES is sorted longest-first, so a full-name key always beats the
   * bare surname. That is what makes these two entries sufficient rather than
   * needing the surname removed. The same trap is waiting for Rosberg (Keke),
   * Verstappen (Jos), Magnussen (Jan) and Piquet if those fathers are ever
   * imported.
   */
  'michael-schumacher': 'Michael Schumacher',
  /**
   * 2003-2009. One of these carries the same father-and-son trap as
   * Schumacher: JACQUES Villeneuve tested the BMW Sauber C24B in 2006, and
   * the catalogue already holds GILLES Villeneuve's whole career. SURNAMES is
   * sorted longest-first so the full-name key wins, exactly as it does for
   * Michael against Mick -- a bare "villeneuve" here would have filed the
   * 2006 test car under a driver who died in 1982.
   */
  'jacques-villeneuve': 'Jacques Villeneuve',
  /**
   * 1995-2001. Two FULL-NAME keys here, both for the father-and-son trap the
   * note above predicts.
   *
   * JOS Verstappen drove the Ligier JS41 at a 1996 tyre test, and Max is
   * already in the catalogue. DAMON Hill is the 1996 champion, and Graham Hill
   * is still to be imported -- 16 reference rows and the way into the 1960s --
   * so a bare "hill" would quietly misfile a whole career the day he lands.
   * SURNAMES sorts longest-first, so the full-name keys win.
   *
   * Burti's slug reads "luciano-pucci-burti": Pucci is a middle name, so the
   * surname key is burti.
   */
  /**
   * 1979-1984. FOUR MORE FULL-NAME KEYS, and the note above called three of
   * them years ago: Rosberg, Piquet and Verstappen were all listed as traps
   * waiting on the fathers.
   *
   * KEKE Rosberg is the 1982 champion and Nico is already here. NELSON Piquet
   * raced against him, and Nelson Piquet Jr drove in 2008-09. MARIO Andretti
   * is the 1978 champion and Michael raced in 1993. EMERSON Fittipaldi needs
   * one for a different reason: "Fittipaldi" is also the TEAM name in 1980,
   * so "fittipaldi-f8-20-emerson-fittipaldi" holds the word twice.
   *
   * Laffite is spelled BOTH WAYS by the shop -- "jacques-laffitte" with two
   * Ts is wrong but appears in the slugs, so both map to the correct name.
   */
  /**
   * 1970. THE WORST TEAM-AND-DRIVER OVERLAP IN THE FILE: Brabham, McLaren and
   * Surtees are each a constructor AND a driver in this same season. Jack
   * Brabham's last year, Bruce McLaren's last (he died testing at Goodwood in
   * June), and John Surtees running his own TS7.
   *
   * All three get full-name keys, so "brabham-bt33-f1-monaco-1970-jack-
   * brabham" cannot read the marque as the driver. SURNAMES sorts
   * longest-first, which is what makes that work.
   *
   * GRAHAM Hill joins here, driving Rob Walker's Lotus 49C at Monaco and a 72
   * in Mexico -- the full-name key added for DAMON on 2026-10-09 is exactly
   * what keeps the two apart, and this is the season it starts mattering.
   *
   * Amon appears as both "chris-amon" and the formal "christopher-amon".
   */
  'jack-brabham': 'Jack Brabham', 'bruce-mclaren': 'Bruce McLaren',
  'john-surtees': 'John Surtees', 'graham-hill': 'Graham Hill',
  'chris-amon': 'Chris Amon', 'christopher-amon': 'Chris Amon',
  /**
   * 1959. DAN GURNEY'S FULL NAME IS DANIEL SEXTON GURNEY, and one slug
   * truncates it to "daniel-sexton" -- keeping the MIDDLE name and dropping
   * the surname. The same car, number 6 at Avus, appears three times: twice
   * as "daniel-gurney" and once as "daniel-sexton".
   *
   * The inverse of Burti, whose slug reads "luciano-pucci-burti" with the
   * middle name in the middle and the surname intact.
   */
  'daniel-sexton': 'Dan Gurney', blanchard: 'Harry Blanchard',
  herrmann: 'Hans Herrmann', shelby: 'Carroll Shelby',
  /**
   * 1958. Hawthorn's title year, and the one with the toll: Musso killed at
   * Reims, Collins at the Nurburgring, Lewis-Evans at Casablanca, all within
   * four months. Hawthorn retired that winter and died on the road in
   * January. Every one of them is in this file.
   *
   * TONY BROOKS IS SPELLED TWO WAYS. Tecnomodel's four Vanwalls read
   * "tony-brookes" on two of them and the Sparks read "tony-brooks". Both
   * keys, or his Belgian and Italian GP cars file under a driver who does not
   * exist.
   */
  /**
   * 1954. GONZALEZ IS ALSO SPELLED "GONZALES", by Tecnomodel, for the same
   * car GP Replicas spells correctly -- number 2 at Reims.
   *
   * PRINCE BIRA is Birabongse Bhanudej, a grandson of the King of Siam, who
   * raced as "B. Bira" and is in every slug as "prince-bira".
   */
  gonzales: 'Jose Froilan Gonzalez', 'prince-bira': 'Prince Bira',
  kling: 'Karl Kling',
  // 1953. Johnny Claes, a Belgian who also led the band he was named for.
  claes: 'Johnny Claes',
  /**
   * 1952. Thompson and Poore finished 5th and 4th in the British GP, the
   * best Connaught results of the era. JOHNNIE PARSONS won the 1950 Indy
   * 500 and is here for the second Ferrari 375 Indy entry.
   */
  thompson: 'Eric Thompson', poore: 'Dennis Poore',
  parsons: 'Johnnie Parsons',
  /**
   * 1951. Paul Pietsch, who drove the Alfetta at the Nurburgring and later
   * founded Das Auto Motor und Sport.
   *
   * No new key was needed for the season's two worst spellings, which is the
   * DRIVERS map earning its keep: "giuseppe-nino-farini" stacks a first name,
   * a nickname and a misspelt surname in one slug and still resolves through
   * the "farini" key added at 1955, and "froilein-gonzalez" misspells the
   * middle name but leaves the surname intact.
   */
  pietsch: 'Paul Pietsch',
  /**
   * 1955. THE SHOP MISSPELLS THREE OF THE SEVEN NAMES IT USES THIS SEASON,
   * and each wrong spelling sits beside the right one on another SKU:
   *
   *   mike-hawtorn      for Hawthorn   (Brumm)
   *   guiseppe-farini   for Farina     (GP Replicas, twice)
   *   maurice-trintigant for Trintignant (GP Replicas)
   *
   * Farina also appears correctly, and as "nino-farina" -- his nickname. All
   * four spellings are one man, the first World Champion.
   *
   * THE THREE-MAN SHARED DRIVE NEEDS AN EXPLICIT COMPOUND KEY.
   * "ferrari-625-10-farina-trintignant-maglioli" is car 10 at the Argentine
   * GP, shared by all three in brutal heat, and GP Replicas sells the SAME
   * car as plain "guiseppe-farini". driverIn takes the longest matching key,
   * so "trintignant" (11) would beat "farina" (6) and split one car in two.
   * The compound key is longer than either and files it under Farina, which
   * is how the other SKU of this car reads.
   */
  hawtorn: 'Mike Hawthorn', farina: 'Giuseppe Farina',
  farini: 'Giuseppe Farina', 'nino-farina': 'Giuseppe Farina',
  'farina-trintignant-maglioli': 'Giuseppe Farina',
  trintigant: 'Maurice Trintignant', ascari: 'Alberto Ascari',
  castellotti: 'Eugenio Castellotti', taruffi: 'Piero Taruffi',
  'jean-lucas': 'Jean Lucas',
  /**
   * 1956. SHARED DRIVES ARE A 1950S FACT and this is the first season where
   * one lands: "ferrari-d50-4-peter-collins-de-portago" names both men, who
   * really did share car 4 at Silverstone -- de Portago started, Collins took
   * over and finished second.
   *
   * THERE IS DELIBERATELY NO "de-portago" KEY. driverIn takes the LONGEST
   * matching key regardless of where it sits in the slug, so adding one would
   * make this SKU the only de Portago car and split it off from the four
   * other SKUs of the same car, all of which attribute it to Collins alone.
   * One car, filed the way the shop files it four times out of five.
   *
   * Anyone adding de Portago later must know that it silently splits this car.
   *
   * ANDRE PILETTE takes a full-name key, not "pilette": his son TEDDY raced
   * in 1974-77, the same father-and-son trap as Schumacher and Hill, and both
   * slugs spell it out anyway.
   */
  bayol: 'Elie Bayol', 'andre-pilette': 'Andre Pilette',
  manzon: 'Robert Manzon', 'da-silva-ramos': 'Hermano da Silva Ramos',
  milhoux: 'Andre Milhoux', gonzalez: 'Jose Froilan Gonzalez',
  /**
   * 1957. Fangio's fifth title, and his first car in this catalogue -- he
   * retired in July 1958, so 1958 held none of him at all.
   *
   * MACKAY-FRASER needs the hyphenated pair. He died at Reims a fortnight
   * after this, his only championship start.
   */
  fangio: 'Juan Manuel Fangio', 'mackay-fraser': 'Herbert Mackay-Fraser',
  fairman: 'Jack Fairman', leston: 'Les Leston',
  hawthorn: 'Mike Hawthorn', collins: 'Peter Collins', musso: 'Luigi Musso',
  'lewis-evans': 'Stuart Lewis-Evans', brookes: 'Tony Brooks',
  behra: 'Jean Behra', schell: 'Harry Schell', barth: 'Edgar Barth',
  /**
   * 1960. Phil Hill appears formally as "philip-hill" as well, and SURNAMES
   * sorts longest-first so that key wins over "phil-hill". Bristow is typo'd
   * "bistrow" in one slug, correct in two others.
   */
  'philip-hill': 'Phil Hill', bristow: 'Chris Bristow', bistrow: 'Chris Bristow',
  'david-piper': 'David Piper', flockhart: 'Ron Flockhart',
  stacey: 'Alan Stacey', 'de-beaufort': 'Carel Godin de Beaufort',
  halford: 'Bruce Halford', brooks: 'Tony Brooks',
  munaron: 'Gino Munaron', cabianca: 'Giulio Cabianca',
  /**
   * 1961. THREE MORE NAMESAKE SPLITS.
   *
   * WOLFGANG VON TRIPS needs the particle: the key is "von-trips", because a
   * bare "trips" is a word and the slug reads "wolfgang-von-trips".
   *
   * RICARDO RODRIGUEZ is PEDRO's younger brother, and Pedro is already here
   * with 1963-1970 cars -- so both take full-name keys. Ricardo was killed at
   * Mexico City in 1962, aged twenty.
   *
   * HENRY TAYLOR is the THIRD Taylor after John (1966) and Trevor (1962-63),
   * which is why none of them may hold a bare surname.
   *
   * Roger Penske raced here, and Penske entered F1 as a CONSTRUCTOR in
   * 1974-76 -- not in this catalogue yet, so the full-name key is insurance
   * against the Brabham/McLaren/Surtees/Ligier pattern arriving again.
   */
  'von-trips': 'Wolfgang von Trips', 'ricardo-rodriguez': 'Ricardo Rodriguez',
  'henry-taylor': 'Henry Taylor', 'roger-penske': 'Roger Penske',
  'michael-may': 'Michael May', burgess: 'Ian Burgess',
  allison: 'Cliff Allison', gendebien: 'Olivier Gendebien',
  salvadori: 'Roy Salvadori', 'pete-ryan': 'Pete Ryan',
  /**
   * 1962. Pieterse appears as "emie-pieterse"; he is Ernie. Moss gets a key
   * even though his only 1962 product is the non-championship Glover Trophy
   * and is excluded -- he will be needed for 1961 and earlier.
   */
  moss: 'Stirling Moss', 'heini-walter': 'Heini Walter',
  schroeder: 'Rob Schroeder', 'tim-mayer': 'Tim Mayer',
  mairesse: 'Willy Mairesse', 'ben-pon': 'Ben Pon', shelly: 'Tony Shelly',
  pieterse: 'Ernie Pieterse', lederle: 'Neville Lederle',
  /**
   * 1963. PHIL HILL IS THE THIRD HILL -- the 1961 champion, driving a Lotus 24
   * in France. Graham and Damon already hold full-name keys, so a bare "hill"
   * would now be ambiguous three ways. Trevor Taylor is the second Taylor,
   * which is why John got a full-name key back in 1966 rather than a surname.
   */
  'phil-hill': 'Phil Hill', 'trevor-taylor': 'Trevor Taylor',
  trintignant: 'Maurice Trintignant', 'jim-hall': 'Jim Hall',
  'hap-sharp': 'Hap Sharp', 'campbell-jones': 'John Campbell-Jones',
  cabral: 'Mario de Araujo Cabral', collomb: 'Bernard Collomb',
  // 1964.
  hailwood: 'Mike Hailwood', maggs: 'Tony Maggs',
  /**
   * 1965. Giacomo Russo raced under the name GEKI and the slug carries both,
   * so the key is his full name and the stored name is what F1 records him
   * as. Vaccarella and Bondurant were one-off entries at Monza and Watkins
   * Glen.
   */
  'giacomo-russo': 'Geki', 'masten-gregory': 'Masten Gregory',
  'frank-gardner': 'Frank Gardner', rhodes: 'John Rhodes',
  mitter: 'Gerhard Mitter', bondurant: 'Bob Bondurant',
  vaccarella: 'Nino Vaccarella',
  /**
   * 1966. GUY LIGIER drove a Cooper-Maserati at Monaco, and "Ligier" is
   * already a TEAM row in this catalogue from the 1995-2001 import. Fifth
   * instance of a man who later put his name on a constructor, after Brabham,
   * McLaren, Surtees and Prost -- so a full-name key, like all of them.
   *
   * Two shop typos: Bandini appears as "baldini" and Innes Ireland as
   * "ines-ireland". Taylor takes a full-name key because the era had several.
   */
  'guy-ligier': 'Guy Ligier', parkes: 'Mike Parkes',
  'innes-ireland': 'Innes Ireland', 'ines-ireland': 'Innes Ireland',
  bucknum: 'Ronnie Bucknum', ginther: 'Richie Ginther',
  arundell: 'Peter Arundell', 'john-taylor': 'John Taylor',
  baldini: 'Lorenzo Bandini',
  /**
   * 1967. Hulme's own title year spells him THREE WAYS -- "denny-hulme",
   * "dennis-hulme" and "denis-hulme" -- and Hobbs appears as "davis-hobbs".
   * All four are absorbed by the existing surname keys, so nothing new is
   * needed for them; noted because the next person will see the variants and
   * wonder.
   */
  irwin: 'Chris Irwin', wietzes: 'Eppie Wietzes', baghetti: 'Giancarlo Baghetti',
  'bob-anderson': 'Bob Anderson', rees: 'Alan Rees', fisher: 'Mike Fisher',
  pretorius: 'Jackie Pretorius', hahne: 'Hubert Hahne', bandini: 'Lorenzo Bandini',
  /**
   * 1968. Scarfiotti is spelled BOTH WAYS by the shop -- "lodovico" and
   * "ludovico" -- so both map. Jim Clark appears once: his win in South
   * Africa in January was his last, and he died at Hockenheim in April.
   */
  'servoz-gavin': 'Johnny Servoz-Gavin', spence: 'Mike Spence',
  charlton: 'Dave Charlton', bianchi: 'Lucien Bianchi',
  lodovico: 'Lodovico Scarfiotti', ludovico: 'Lodovico Scarfiotti',
  scarfiotti: 'Lodovico Scarfiotti', widdows: 'Robin Widdows',
  schlesser: 'Jo Schlesser', hobbs: 'David Hobbs',
  'bobby-unser': 'Bobby Unser', 'jim-clark': 'Jim Clark', redman: 'Brian Redman',
  // 1969. Eight more, including two South Africans who only ever raced at
  // Kyalami, and Attwood, who shared Monaco with Graham Hill's win.
  'john-love': 'John Love', tingle: 'Sam Tingle', moser: 'Silvio Moser',
  bonnier: 'Jo Bonnier', brack: 'Bill Brack', ahrens: 'Kurt Ahrens',
  elford: 'Vic Elford', attwood: 'Richard Attwood',
  eaton: 'George Eaton', 'de-klerk': 'Peter de Klerk',
  ickx: 'Jacky Ickx', rindt: 'Jochen Rindt', giunti: 'Ignazio Giunti',
  gurney: 'Dan Gurney', miles: 'John Miles', 'derek-bell': 'Derek Bell',
  'pedro-rodriguez': 'Pedro Rodriguez', hulme: 'Denny Hulme',
  'de-adamich': 'Andrea de Adamich', westbury: 'Peter Westbury',
  gethin: 'Peter Gethin', beltoise: 'Jean-Pierre Beltoise',
  stommelen: 'Rolf Stommelen', pescarolo: 'Henri Pescarolo',
  siffert: 'Jo Siffert', oliver: 'Jackie Oliver', courage: 'Piers Courage',
  'jackie-stewart': 'Jackie Stewart', peterson: 'Ronnie Peterson',
  /**
   * The five drivers imported through build-driver-csv, which keeps its own
   * config and so never taught this file their names. They are in the
   * database; they were simply invisible to the season generator, which is
   * why 1979 put nineteen Villeneuve products into review while his career
   * was already imported.
   *
   * GILLES, not a bare "villeneuve" -- Jacques is here too, and the pair are
   * the same trap as Michael and Mick Schumacher.
   */
  'gilles-villeneuve': 'Gilles Villeneuve', 'niki-lauda': 'Niki Lauda',
  'alain-prost': 'Alain Prost', 'nigel-mansell': 'Nigel Mansell',
  'ayrton-senna': 'Ayrton Senna',
  'keke-rosberg': 'Keke Rosberg', 'nelson-piquet': 'Nelson Piquet',
  'mario-andretti': 'Mario Andretti', 'emerson-fittipaldi': 'Emerson Fittipaldi',
  'jacques-laffitte': 'Jacques Laffite', laffite: 'Jacques Laffite',
  /**
   * THREE SHOP TYPOS, kept as aliases rather than corrected upstream, because
   * the slug is the only key available: "schekter" drops a C from Scheckter
   * and "jarrier" adds an R to Jarier. Both appear alongside the correct
   * spellings, so both must map.
   *
   * Stuck gets a full-name key: Hans-Joachim raced here, and his father Hans
   * Stuck was a pre-war Grand Prix driver -- out of scope under the 1950 floor
   * today, but the collision would be waiting if that ever changed.
   */
  schekter: 'Jody Scheckter', jarier: 'Jean-Pierre Jarier',
  jarrier: 'Jean-Pierre Jarier', 'hans-stuck': 'Hans-Joachim Stuck',
  scheckter: 'Jody Scheckter', giacomelli: 'Bruno Giacomelli',
  'alan-jones': 'Alan Jones', lammers: 'Jan Lammers', tambay: 'Patrick Tambay',
  watson: 'John Watson', regazzoni: 'Clay Regazzoni',
  'de-angelis': 'Elio de Angelis', lees: 'Geoff Lees', patrese: 'Riccardo Patrese',
  rebaque: 'Hector Rebaque', jabouille: 'Jean-Pierre Jabouille',
  daly: 'Derek Daly', surer: 'Marc Surer', brambilla: 'Vittorio Brambilla',
  mass: 'Jochen Mass', depailler: 'Patrick Depailler',
  gaillard: 'Patrick Gaillard', arnoux: 'Rene Arnoux', zunino: 'Ricardo Zunino',
  cheever: 'Eddie Cheever', keegan: 'Rupert Keegan',
  reutemann: 'Carlos Reutemann', needell: 'Tiff Needell',
  pironi: 'Didier Pironi', alboreto: 'Michele Alboreto',
  'jos-verstappen': 'Jos Verstappen', 'damon-hill': 'Damon Hill',
  hakkinen: 'Mika Hakkinen', irvine: 'Eddie Irvine', alesi: 'Jean Alesi',
  berger: 'Gerhard Berger', herbert: 'Johnny Herbert', panis: 'Olivier Panis',
  salo: 'Mika Salo', katayama: 'Ukyo Katayama', brundle: 'Martin Brundle',
  diniz: 'Pedro Diniz', larini: 'Nicola Larini', zonta: 'Ricardo Zonta',
  tarquini: 'Gabriele Tarquini', schiattarella: 'Domenico Schiattarella',
  montermini: 'Andrea Montermini', burti: 'Luciano Burti', marques: 'Tarso Marques',
  coulthard: 'David Coulthard', frentzen: 'Heinz-Harald Frentzen',
  pizzonia: 'Antonio Pizzonia', montoya: 'Juan Pablo Montoya',
  wurz: 'Alexander Wurz', sato: 'Takuma Sato',
  fisichella: 'Giancarlo Fisichella', zanardi: 'Alessandro Zanardi',
  bourdais: 'Sebastien Bourdais',
  /**
   * 2010-2011. Three teams at the back of the 2010 grid that existed for only
   * a season or two, and the midfield that preceded the names this catalogue
   * already knows.
   *
   * ASCII throughout, matching "Jean-Eric Vergne" rather than Jean-Éric —
   * the catalogue is consistent about that and a stray accent creates a
   * second driver row that looks identical in a list.
   */
  heidfeld: 'Nick Heidfeld', alguersuari: 'Jaime Alguersuari',
  'de-la-rosa': 'Pedro de la Rosa', barrichello: 'Rubens Barrichello',
  trulli: 'Jarno Trulli', yamamoto: 'Sakon Yamamoto',
  glock: 'Timo Glock', buemi: 'Sebastien Buemi',
  // 2002. The slug spells McNish "alan-mcnish"; the driver is Allan McNish,
  // and the catalogue stores real names rather than slug spellings.
  'alex-yoong': 'Alex Yoong', 'alan-mcnish': 'Allan McNish',
  'charles-pic': 'Charles Pic', kovalainen: 'Heikki Kovalainen',
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
  // CMR is Classic Model Replicars. Added 2026-10-09 with the matching
  // manufacturers row -- it was holding back a Brawn BGP001, the only one of
  // the six 2009 products this maker carries.
  cmr: 'CMR',
  // CMC is Classic Model Cars, which is NOT CMR above -- one letter apart,
  // different German makers. Added 2026-10-12 for the 1:18 Maserati 250F,
  // Fangio's title car and the only CMC product in the file.
  cmc: 'CMC',
  // One product: a 1995 Ferrari 412T2 test car.
  fujimi: 'Fujimi',
  sunstar: 'Sunstar',
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
  const fromChassis = isShowcar
    ? null
    : (CHASSIS_TEAM_YEAR[year]?.[chassis] ?? CHASSIS_TEAM[chassis]);
  const team = ERA_NAME(fromChassis || teamIn(s), year);
  /**
   * An EVENTS value may be a function of the year, because a circuit's race
   * can be renamed -- see Imola. Resolved here so every caller gets a string.
   */
  const eventRaw = (EVENTS.find(([re]) => re.test(s)) || [])[1];
  const event = (typeof eventRaw === 'function' ? eventRaw(year) : eventRaw) || 'Season';
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
  // Must use the SAME year-aware lookup the team was read with, or the D50
  // fails its own check: 1955 reads Lancia correctly and the flat map then
  // calls it a Ferrari disagreement.
  const expect = isShowcar
    ? null
    : ERA_NAME(CHASSIS_TEAM_YEAR[year]?.[chassis] ?? CHASSIS_TEAM[chassis], year);
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

/**
 * ONE SKU LISTED TWICE IS ONE MODEL. Found at 1954: GP Replicas' gp128d is
 * in the sitemap as both "...winner-world-champion" and
 * "...winner-world-champion-DIRTY-VERSION" -- a finish variant sold under the
 * same part number. Identical rows out of the loop above mean the same model
 * of the same car, and manufacturer_sku is UNIQUE, so leaving both in makes
 * the import fail on the second insert rather than quietly duplicating.
 *
 * Deduped on the WHOLE row, so two scales sharing a part number still produce
 * two rows and still trip the duplicate-SKU check, which is where a real
 * collision belongs.
 */
const seenRow = new Set();
const deduped = rows.filter(r => {
  const k = JSON.stringify(r);
  if (seenRow.has(k)) return false;
  seenRow.add(k);
  return true;
});
const collapsed = rows.length - deduped.length;
rows.length = 0;
rows.push(...deduped);

if (REVIEW) {
  console.log(`fetched ${all.length}, kept ${kept.length}, excluded ${dropped.length}`);
  const why = {}; for (const [, w] of dropped) why[w] = (why[w] || 0) + 1;
  for (const [w, n] of Object.entries(why).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${w}`);
  console.log(`\nparsed into CSV rows : ${rows.length}`);
  if (collapsed) console.log(`one SKU listed twice : ${collapsed} collapsed`);
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
