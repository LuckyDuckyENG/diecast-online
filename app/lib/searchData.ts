import { supabase } from './supabase';
import { selectAll, selectAllIn } from './selectAll';
import { buildEbayPhotoMap, ebayPhotoForVariants } from './ebayPhoto';
import { carTitle } from './carTitle';

/**
 * Search, filtered by the DATABASE rather than by the browser.
 *
 * WHAT WAS WRONG
 *
 * /search downloaded every car and every model to the client and filtered them
 * in JavaScript. Three faults, all from that one decision:
 *
 *   IT COULD NOT SEE MOST OF THE CATALOGUE. A plain .select() is capped at
 *   1000 rows by PostgREST, silently. With 1,192 cars and 2,848 models the
 *   page received 1000 of each, so 1,848 models were unreachable. A car could
 *   still MATCH -- driver names are on the car row -- while none of its models
 *   came down, and the card then fell back to no image, "Unknown" maker and a
 *   hardcoded 1:18. Searching "senna" returned 50 cars of which 48 showed
 *   none of their models. That is what "the wrong results come in" was.
 *
 *   IT WAS INVISIBLE TO CRAWLERS. Results rendered only after hydration, so
 *   every /search URL served an empty page to Google.
 *
 *   IT COST A CATALOGUE DOWNLOAD PER SEARCH. ~2,000 rows from the browser on
 *   every keystroke-completed query, which is egress this project has already
 *   been billed for once.
 *
 * Filtering in the database fixes all three at once: the query returns tens of
 * rows rather than thousands, so the cap is never approached, the work happens
 * on the server where it can be rendered into the HTML, and the client
 * downloads only what it displays.
 */

export interface SearchCar {
  id: string;
  slug: string | null;
  name: string;
  year: number | null;
  driver: string | null;
  team: string | null;
  liveryName: string | null;
  manufacturer: string;
  manufacturers: string[];
  scales: string[];
  imageUrl: string | null;
  /** imageUrl is an eBay listing photo, not a product shot. Captioned. */
  imageFromEbay?: boolean;
  teamPrimaryColor: string | null;
  teamTextColor: string | null;
  hasStore: boolean;
}

/** PostgREST treats % and _ as wildcards inside ilike; a user's text is not a pattern. */
const escapeLike = (s: string) => s.replace(/[%_\\]/g, ch => `\\${ch}`);

/** Hard ceiling on a result set, so a one-letter query cannot pull the catalogue. */
const MAX_CARS = 200;

/**
 * A four-digit season anywhere in the query, and whatever else was typed.
 *
 * "2020" is a season. "hamilton 2020" is a driver IN a season, which is the
 * pair people actually type. Pulling the year out lets the rest of the query
 * stay a text match and the year become a filter, so the two combine as AND
 * rather than returning everything that matches either.
 *
 * Bounded to 1950-2030 so a part number fragment cannot be read as a year.
 */
const splitYear = (q: string) => {
  const m = q.match(/(?:^|\s)((?:19|20)\d{2})(?=\s|$)/);
  const year = m ? Number(m[1]) : null;
  if (!year || year < 1950 || year > 2030) return { year: null, text: q };
  return { year, text: (q.slice(0, m!.index) + ' ' + q.slice(m!.index! + m![0].length)).trim() };
};

/**
 * CIRCUITS, BECAUSE RACES ARE STORED BY COUNTRY.
 *
 * Searching a circuit is close to the first thing a collector tries, and it
 * was HALF working, which is worse than failing outright. A few event names
 * carry the circuit in brackets, so an `ilike` found those and missed the rest:
 *
 *   "monza"        31 hits (Italian GP (Monza))   ·  missed 107 "Italian GP"
 *   "silverstone"   0 hits                        ·  missed 145 "British GP"
 *   "imola"        25 hits                        ·  missed San Marino GP
 *
 * So a search returned a confident, wrong-sized answer. Mapping the circuit to
 * the event names actually present in the data fixes both halves at once.
 *
 * ONE CIRCUIT CAN MEAN SEVERAL ROUNDS, and that is the point rather than a
 * problem: Imola has hosted the San Marino, Italian and Emilia Romagna Grands
 * Prix, and the Nurburgring has held the German and Eifel. A circuit search
 * should return everything raced there.
 *
 * Every value here was taken from the 73 distinct event_name values in the
 * database on 2026-10-12, not from a calendar — a name nobody uses would match
 * nothing and quietly look like a working alias.
 */
const CIRCUIT_EVENTS: Record<string, string[]> = {
  silverstone: ['British GP'],
  aintree: ['British GP'],
  'brands hatch': ['British GP'],
  monza: ['Italian GP', 'Italian GP (Monza)', '(Michael Schumacher Tribute) - Italian GP'],
  imola: ['Emilia Romagna GP', 'Emilia Romagna GP (Imola)', 'San Marino GP', 'Imola Test'],
  spa: ['Belgian GP'],
  francorchamps: ['Belgian GP'],
  zolder: ['Belgian GP'],
  'monte carlo': ['Monaco GP'],
  montecarlo: ['Monaco GP'],
  interlagos: ['Brazilian GP'],
  suzuka: ['Japanese GP'],
  fuji: ['Japanese GP'],
  zandvoort: ['Dutch GP'],
  nurburgring: ['German GP', 'Eifel GP', 'Eifel GP (Nurburgring)'],
  hockenheim: ['German GP'],
  catalunya: ['Spanish GP', 'Pre-season Testing (Barcelona)', 'Spanish Test', 'Spanish GP Tire Test', 'Test Session (Barcelona)'],
  barcelona: ['Spanish GP', 'Pre-season Testing (Barcelona)', 'Spanish Test', 'Spanish GP Tire Test', 'Test Session (Barcelona)'],
  jerez: ['European GP', 'Spanish GP'],
  austin: ['United States GP', 'United States GP (Austin)', 'United States GP Sprint (Austin)'],
  cota: ['United States GP', 'United States GP (Austin)', 'United States GP Sprint (Austin)'],
  'watkins glen': ['United States GP', 'United States GP East'],
  'long beach': ['United States GP West'],
  hungaroring: ['Hungarian GP'],
  spielberg: ['Austrian GP', 'Styrian GP'],
  'red bull ring': ['Austrian GP', 'Styrian GP'],
  osterreichring: ['Austrian GP'],
  jeddah: ['Saudi Arabian GP'],
  'yas marina': ['Abu Dhabi GP', 'Abu Dhabi Test', 'Abu Dhabi GP (FP1)'],
  'marina bay': ['Singapore GP'],
  baku: ['Azerbaijan GP'],
  sochi: ['Russian GP', 'Russian GP (Sochi)'],
  mugello: ['Tuscan GP (Mugello)'],
  estoril: ['Portuguese GP'],
  portimao: ['Portuguese GP'],
  kyalami: ['South African GP'],
  reims: ['French GP'],
  'magny-cours': ['French GP'],
  'paul ricard': ['French GP', 'Paul Ricard Test'],
  castellet: ['French GP', 'Paul Ricard Test'],
  rouen: ['French GP'],
  montreal: ['Canadian GP', 'Canada Test'],
  'gilles villeneuve': ['Canadian GP'],
  'mexico city': ['Mexican GP', 'Mexico City GP'],
  rodriguez: ['Mexican GP', 'Mexico City GP'],
  sepang: ['Malaysian GP'],
  istanbul: ['Turkish GP'],
  sakhir: ['Bahrain GP', 'Sakhir GP'],
  'albert park': ['Australian GP'],
  melbourne: ['Australian GP'],
  adelaide: ['Australian GP'],
  shanghai: ['Chinese GP', 'Chinese GP Sprint'],
  anderstorp: ['Swedish GP'],
  'buenos aires': ['Argentine GP'],
  bremgarten: ['Swiss GP'],
  'ain-diab': ['Moroccan GP'],
  casablanca: ['Moroccan GP'],
  pescara: ['Pescara GP'],
  indianapolis: ['Indianapolis 500'],
  brickyard: ['Indianapolis 500'],
  fiorano: ['Pre-season Testing (Fiorano)'],
  aida: ['Pacific GP'],
  okayama: ['Pacific GP'],
};

/**
 * A SCALE anywhere in the query, pulled out the same way the year is.
 *
 * Found in the logs on 2026-10-12: someone searched "spark f1 1/43" and got
 * ZERO results. Three separate reasons, and this is one of them. Scale was not
 * searchable in any spelling, even though it is one of the two facts every
 * collector knows about a model before they know anything else.
 *
 * A SLASH IS HOW PEOPLE WRITE IT. The database stores "1:43"; the visitor typed
 * "1/43". Both, plus a space or a dash, normalise to the stored form.
 *
 * Only scales the catalogue actually holds are accepted, so "1/24" stays as
 * ordinary search text rather than silently becoming a filter that matches
 * nothing.
 */
const SCALES = ['1:43', '1:18', '1:12'];
const splitScale = (q: string) => {
  const m = q.match(/(?:^|\s)1\s*[:/\-.]\s*(43|18|12)(?=\s|$)/);
  if (!m) return { scale: null as string | null, text: q };
  const scale = `1:${m[1]}`;
  if (!SCALES.includes(scale)) return { scale: null, text: q };
  return {
    scale,
    text: (q.slice(0, m.index) + ' ' + q.slice(m.index! + m[0].length)).trim(),
  };
};

/**
 * Words that describe the CATEGORY rather than any particular car.
 *
 * "spark f1 1/43" is maker + category + scale. Without this, the leftover text
 * after pulling the scale out is "spark f1", which matches no manufacturer, no
 * chassis and no driver, so a perfectly reasonable query still returns nothing.
 *
 * Stripped as whole words only, and never if nothing would be left. Checked
 * against the data first: five chassis names contain F1 as a standalone word
 * ("F1 W14", "248 F1", "F1-75", "F1.08", "F1-2000"), and every one of them is
 * still found by its remaining token, because "w14" and "248" match by
 * substring. "f1-75" is a single token and is never split.
 */
const NOISE = /(?:^|\s)(f1|formula\s*1|formula\s*one|diecast|die-cast|model|models|scale|car|cars)(?=\s|$)/gi;
const stripNoise = (q: string) => {
  const stripped = q.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  return stripped.length ? stripped : q;
};

/**
 * At most this many words are honoured. Each one costs two round trips.
 *
 * Four covers every real query seen in the logs ("looksmart leclerc ferrari
 * 2024" is four once the year is pulled out). Beyond that, extra words are
 * ignored rather than slowing the search down, because a query that specific
 * is already answered by the first four.
 */
const MAX_TERMS = 4;

/**
 * Every car id one word of the query could possibly mean.
 *
 * COMPLETE, NOT CAPPED, and that is the whole reason this is paged. The ids
 * are about to be INTERSECTED with another word's ids, and a truncated set
 * silently removes real answers from the result: "ferrari leclerc" asks about
 * 355 Ferrari cars, so stopping at 200 of them would drop a third of the
 * Leclerc Ferraris for no reason the reader could ever see. Capping is safe
 * for a union and lethal for an intersection.
 *
 * Only ids are read, so a term matching the whole catalogue is three pages of
 * uuids rather than three pages of cars.
 */
async function termCarIds(term: string, seasonId: string | null): Promise<Set<string>> {
  const like = `%${escapeLike(term.toLowerCase())}%`;
  const scoped = (qb: any) => (seasonId ? qb.eq('season_id', seasonId) : qb);
  const circuitEvents = CIRCUIT_EVENTS[term];

  const [chassis, events, circuit, drivers, teams, skus, makers] = await Promise.all([
    selectAll<any>(supabase, 'cars', 'id', qb => scoped(qb.ilike('chassis_name', like))),
    selectAll<any>(supabase, 'cars', 'id', qb => scoped(qb.ilike('event_name', like))),
    selectAllIn<any>(supabase, 'cars', 'id', 'event_name', circuitEvents || [], scoped),
    supabase.from('drivers').select('id').ilike('name', like),
    supabase.from('teams').select('id').ilike('name', like),
    selectAll<any>(supabase, 'models', 'car_id', qb => qb.ilike('manufacturer_sku', like)),
    supabase.from('manufacturers').select('id').ilike('name', like),
  ]);

  const driverIds = (drivers.data || []).map((d: any) => d.id);
  const teamIds = (teams.data || []).map((t: any) => t.id);
  const makerIds = (makers.data || []).map((m: any) => m.id);

  const [byDriver, byTeam, byMaker] = await Promise.all([
    selectAllIn<any>(supabase, 'cars', 'id', 'driver_id', driverIds, scoped),
    selectAllIn<any>(supabase, 'cars', 'id', 'team_id', teamIds, scoped),
    selectAllIn<any>(supabase, 'models', 'car_id', 'manufacturer_id', makerIds),
  ]);

  const ids = new Set<string>();
  for (const r of [...chassis, ...events, ...circuit, ...byDriver, ...byTeam]) {
    if (r.id) ids.add(r.id);
  }
  // models rows carry car_id, not id.
  for (const r of [...skus, ...byMaker]) if (r.car_id) ids.add(r.car_id);
  return ids;
}

export async function searchCars(rawQuery: string): Promise<SearchCar[]> {
  const raw = rawQuery.trim();
  if (raw.length < 2) return [];

  const { year, text } = splitYear(raw);
  const { scale, text: afterScale } = splitScale(text);
  const q = stripNoise(afterScale);

  /**
   * A season restricts the result rather than widening it.
   *
   * Resolved first because every car query below is scoped to it, which is
   * what makes "hamilton 2020" mean Hamilton AND 2020.
   */
  let seasonId: string | null = null;
  if (year) {
    const { data } = await supabase.from('seasons').select('id').eq('year', year).maybeSingle();
    // A year we hold no season for matches nothing, rather than silently
    // falling back to an unfiltered search for the rest of the words.
    if (!data) return [];
    seasonId = data.id;
  }

  const CAR_FIELDS_BASE =
    'id, slug, chassis_name, event_name, season:seasons(year), ' +
    'team:teams(name, primary_color, text_color), driver:drivers(name, number)';

  /**
   * A year on its own lists the season.
   *
   * It deliberately does NOT also match part numbers. 13 models carry "2017"
   * inside their SKU and every one of them is from another season --
   * 410201777 is a 2020 car -- so including them would answer "show me 2017"
   * with cars from 2020 and 2022.
   */
  if (year && !q) {
    const { data } = await supabase
      .from('cars').select(CAR_FIELDS_BASE).eq('season_id', seasonId).limit(MAX_CARS);
    return decorate(data || []);
  }

  /**
   * EVERY WORD HAS TO MATCH SOMETHING. WORDS NEED NOT MATCH THE SAME THING.
   *
   * This is the fix for a failure confirmed in `search_queries`: "looksmart
   * leclerc" returned ZERO. The query was one `ilike '%looksmart leclerc%'`
   * against each field in turn, and no field on earth contains both words --
   * Looksmart is a manufacturer, Leclerc is a driver. The two facts live in
   * different tables, so the one query that could never match was the one
   * combining them, which is exactly what a person types when the single-word
   * search has given them too much.
   *
   * So each word is resolved independently to the set of cars it could mean
   * (OR across chassis, event, circuit, driver, team, SKU and maker), and the
   * sets are INTERSECTED. "looksmart leclerc" becomes cars that are Leclerc's
   * AND have a Looksmart model, which is the only reading of it that is any
   * use.
   *
   * A CIRCUIT IS CHECKED AS A WHOLE PHRASE FIRST, because fourteen of the
   * aliases are two words. Splitting "watkins glen" would ask for cars
   * matching "watkins" AND "glen", and neither word appears anywhere in the
   * data: a working alias would start returning nothing.
   *
   * Terms are resolved in parallel, so N words cost the same wall time as one.
   */
  const whole = q.toLowerCase().trim();
  const terms = CIRCUIT_EVENTS[whole]
    ? [whole]
    : whole.split(/\s+/).filter(t => t.length >= 2).slice(0, MAX_TERMS);

  // Every word was a single character, so there is nothing to AND. Fall back
  // to the raw text rather than returning nothing for "c 4".
  const effective = terms.length ? terms : [whole];

  const idSets = await Promise.all(effective.map(t => termCarIds(t, seasonId)));

  // Smallest first: intersecting 12 ids against 2,000 is 12 lookups, the other
  // way round is 2,000.
  idSets.sort((a, b) => a.size - b.size);
  let ids = [...idSets[0]];
  for (const set of idSets.slice(1)) ids = ids.filter(id => set.has(id));
  if (!ids.length) return [];

  const CAR_FIELDS = CAR_FIELDS_BASE;

  /**
   * Sliced to MAX_CARS because that is the result size, not because of any
   * URL limit. selectAllIn chunks the ids, so the length cannot break it.
   *
   * It used to be capped for both reasons at once, which hid the second one:
   * every `.in()` here was kept under a safe size by hand, and the first one
   * that was NOT -- in decorate(), on model ids rather than car ids -- became
   * a live 500 on "spark" and "minichamps" that nobody connected to this.
   */
  let matched: any[] = await selectAllIn<any>(
    supabase, 'cars', CAR_FIELDS, 'id', ids.slice(0, MAX_CARS)
  );

  /**
   * SCALE NARROWS, it does not widen. Same rule as the season: "spark 1/43"
   * means Spark AND 1:43, not Spark OR everything made at 1:43.
   *
   * Applied BEFORE the MAX_CARS slice, so asking for a scale cannot leave you
   * with a handful of results purely because the cap landed on the other one.
   * Paged, because 1:43 alone is 2,858 models and a plain select would stop at
   * 1,000 and silently drop cars from the answer.
   */
  if (scale && matched.length) {
    const rows = await selectAll<any>(
      supabase, 'models', 'car_id', qb => qb.eq('scale', scale)
    );
    const atScale = new Set(rows.map(m => m.car_id));
    matched = matched.filter(c => atScale.has(c.id));
  }

  const cars = matched.slice(0, MAX_CARS);
  if (!cars.length) return [];
  return decorate(cars);
}

/** Attach models, makers, scales and whether anyone sells it. */
async function decorate(cars: any[]): Promise<SearchCar[]> {
  if (!cars.length) return [];

  /**
   * Models for THESE cars only. The old code took whatever 1000 models came
   * back and hoped the right ones were among them; this asks for the ones it
   * is about to render.
   */
  const carIds = cars.map(c => c.id);
  const models = await selectAllIn<any>(
    supabase, 'models', 'id, car_id, image_url, scale, manufacturers(name)',
    'car_id', carIds
  );

  const byCar = new Map<string, any[]>();
  for (const m of models) {
    if (!byCar.has(m.car_id)) byCar.set(m.car_id, []);
    byCar.get(m.car_id)!.push(m);
  }

  // Which of these models anyone actually sells. Scoped to the result set for
  // the same reason as above.
  const modelIds = models.map(m => m.id);
  const [priceRows, ebayRows] = await Promise.all([
    selectAllIn<any>(supabase, 'price_history', 'model_id', 'model_id', modelIds),
    // ebay_image is the last-resort photo for cars with none.
    selectAllIn<any>(supabase, 'ebay_links', 'model_id, ebay_image', 'model_id', modelIds),
  ]);
  // Built from rows already fetched above, so this adds no query.
  const ebayPhotos = buildEbayPhotoMap(ebayRows, priceRows);
  const sold = new Set<string>([
    ...priceRows.map((p: any) => p.model_id),
    ...ebayRows.map((e: any) => e.model_id),
  ]);

  const out: SearchCar[] = cars.map((car: any) => {
    const variants = byCar.get(car.id) || [];
    const makers = [...new Set(variants.map(v => v.manufacturers?.name).filter(Boolean))] as string[];
    const scales = [...new Set(variants.map(v => v.scale).filter(Boolean))] as string[];
    return {
      id: car.id,
      slug: car.slug ?? null,
      // Was a SECOND hand-written copy of the title format, which is how
      // search results kept rendering "British GP - 158 - ..." after the page
      // title was fixed. One function now, in lib/carTitle.ts.
      name: carTitle(car),
      // No `|| 2024`. A missing season is missing, not 2024 -- the old default
      // stamped the current year onto any car whose season failed to load.
      year: car.season?.year ?? null,
      driver: car.driver?.name ?? null,
      team: car.team?.name ?? null,
      liveryName: car.chassis_name ?? null,
      manufacturer:
        makers.length === 0 ? 'Unknown'
        : makers.length <= 2 ? makers.join(' · ')
        : `${makers.slice(0, 2).join(' · ')} +${makers.length - 2}`,
      manufacturers: makers,
      scales,
      // A product shot wins; the eBay snapshot only fills a car with none and
      // no shop that could ever supply one. See lib/ebayPhoto.ts.
      imageUrl: variants.find(v => v.image_url)?.image_url
        || ebayPhotoForVariants(variants, ebayPhotos) || null,
      imageFromEbay: !variants.some(v => v.image_url)
        && !!ebayPhotoForVariants(variants, ebayPhotos),
      teamPrimaryColor: car.team?.primary_color ?? null,
      teamTextColor: car.team?.text_color ?? null,
      hasStore: variants.some(v => sold.has(v.id)),
    };
  });

  /**
   * Buyable first, then newest. Search deliberately does NOT drop the rest:
   * someone typing a driver's name meant it, and an empty page looks broken.
   */
  return out.sort(
    (a, b) => Number(b.hasStore) - Number(a.hasStore) || (b.year ?? 0) - (a.year ?? 0)
  );
}
