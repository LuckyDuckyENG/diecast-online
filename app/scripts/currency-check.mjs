/**
 * Is a shop's price really in the currency we think it is?
 *
 *   node scripts/currency-check.mjs
 *   node scripts/currency-check.mjs --shop "Stone Model"
 *
 * Read-only. Writes nothing.
 *
 * WHY, IN THE WORDS OF THE CODE THAT NEEDED IT
 *
 * app/api/admin/sweep-retailer/route.ts decides a shop's currency by majority
 * vote over the rows already stored, and its own comment ends:
 *
 *   "neither meta.json nor a vote count is evidence. The only reliable test
 *    is the one run by hand here: compare the shop's numbers against what
 *    other shops charge for the SAME model. Worth automating as a currency
 *    sanity check; a vote threshold is not it."
 *
 * This is that check. It exists because the failure is silent and expensive:
 * DrivenBy declares HKD, and reading its feed as HKD would have divided 69
 * prices by five. An understated price WINS "cheapest", so the site would
 * have confidently sent people to the wrong shop, and nothing would have
 * looked broken.
 *
 * HOW IT TESTS
 *
 * For every model a shop shares with at least one other shop, compare its raw
 * `price` against the median `price_aud` the others charge. If the shop's
 * numbers really are AUD the ratio sits near 1. If they are actually USD, the
 * ratio sits near 1/1.44, because the same object priced in a stronger
 * currency carries a smaller number.
 *
 * The median, not the mean: one mispriced outlier at a single shop should not
 * be able to move the verdict for a whole retailer.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const shopArg = (() => {
  const i = process.argv.indexOf('--shop');
  return i > -1 ? process.argv[i + 1] : null;
})();

const page = async (table, cols, tweak) => {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols);
    if (tweak) q = tweak(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const [retailers, prices, fx] = await Promise.all([
  page('retailers', 'id, name, currency'),
  page('price_history', 'retailer_id, model_id, price, currency, price_aud'),
  page('fx_rates', 'base, quote, rate, as_of'),
]);

/** Newest rate per pair, so a stale row cannot win. */
const rate = new Map();
for (const r of fx.sort((a, b) => String(a.as_of).localeCompare(String(b.as_of)))) {
  rate.set(`${r.base}->${r.quote}`, Number(r.rate));
}
/**
 * X -> AUD, inverting an AUD -> X row when that is all we hold.
 *
 * fetch-fx.mjs stores USD/EUR/GBP as X->AUD but NZD, CAD, SGD and JPY only
 * as AUD->X. Without the inversion those four are simply absent as
 * candidates, and the check then "explains" an NZD shop as the nearest
 * currency it does know. That is how the first run of this script accused
 * SPR Models, which is plainly NZD, of being USD.
 */
const toAud = (code) => {
  if (code === 'AUD') return 1;
  const direct = rate.get(`${code}->AUD`);
  if (direct) return direct;
  const inverse = rate.get(`AUD->${code}`);
  return inverse ? 1 / inverse : null;
};

const nameOf = new Map(retailers.map(r => [r.id, r.name]));
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Every model's set of prices, so each shop can be compared to its peers. */
const byModel = new Map();
for (const p of prices) {
  if (!(p.price > 0) || !(p.price_aud > 0)) continue;
  if (!byModel.has(p.model_id)) byModel.set(p.model_id, []);
  byModel.get(p.model_id).push(p);
}

const perShop = new Map();
for (const [, rows] of byModel) {
  if (rows.length < 2) continue;
  for (const row of rows) {
    // The reference is every OTHER shop, so a shop can never vouch for itself.
    const others = rows.filter(r => r.retailer_id !== row.retailer_id);
    if (!others.length) continue;
    const ref = median(others.map(r => Number(r.price_aud)));
    if (!(ref > 0)) continue;
    if (!perShop.has(row.retailer_id)) perShop.set(row.retailer_id, []);
    perShop.get(row.retailer_id).push(Number(row.price) / ref);
  }
}

const CODES = ['AUD', 'USD', 'EUR', 'GBP', 'CAD', 'NZD', 'SGD', 'HKD', 'JPY'];

console.log(`\n  ${'shop'.padEnd(26)} ${'stored'.padStart(6)} ${'n'.padStart(4)} ${'ratio'.padStart(7)}  ${'expect'.padStart(7)}  verdict`);

const rows = [...perShop.entries()]
  .map(([id, ratios]) => ({ id, name: nameOf.get(id) || id, ratios }))
  .filter(r => (shopArg ? r.name.toLowerCase().includes(shopArg.toLowerCase()) : true))
  .filter(r => r.ratios.length >= 3)
  .sort((a, b) => a.name.localeCompare(b.name));

for (const r of rows) {
  const stored = retailers.find(x => x.id === r.id)?.currency || '?';
  const ratio = median(r.ratios);

  /**
   * Which currency would make this shop's numbers normal?
   *
   * A shop quoting in X shows a number worth `ratio` of the AUD price, so the
   * implied rate X->AUD is 1/ratio. The closest known rate wins.
   */
  let best = null;
  for (const code of CODES) {
    const r2a = toAud(code);
    if (!r2a) continue;
    const expected = 1 / r2a;
    const err = Math.abs(Math.log(ratio / expected));
    if (!best || err < best.err) best = { code, err };
  }

  /**
   * THE VERDICT IS DELIBERATELY BLUNT, because this method cannot be sharp.
   *
   * A currency and a discount are the same observation. Miniatures
   * Minichamps prices in EUR and sits about 15% under the field; that is
   * arithmetically identical to pricing in GBP at the field's rate, and the
   * first version of this script duly accused a Belgian shop of using
   * sterling. Neighbouring currencies are 15-25% apart and real shops differ
   * by more than that, so "GBP or EUR?" is not answerable this way. It never
   * was: the route's own comment says the only reliable test is reading the
   * prices by hand.
   *
   * What IS answerable is whether the stored currency is grossly wrong, and
   * that is the failure that matters. DrivenBy read as HKD would have been
   * 5x out. A shop being secretly half or double its recorded currency
   * cannot hide behind "they are a bit cheap".
   *
   * So: within 35% of the stored currency is fine, beyond 2x is an alarm,
   * and the gap between them is reported as unresolved rather than guessed.
   */
  const storedRate = toAud(stored);
  const expectedForStored = storedRate ? 1 / storedRate : null;
  const off = expectedForStored ? ratio / expectedForStored : null;

  let verdict;
  if (!off) verdict = `no rate held for ${stored}`;
  else if (off > 1 / 1.35 && off < 1.35) verdict = 'consistent';
  else if (off >= 2 || off <= 0.5) verdict = `CHECK BY HAND: ${off.toFixed(2)}x off ${stored}`;
  else verdict = `wide (${off.toFixed(2)}x off ${stored})`;

  console.log(
    `  ${r.name.slice(0, 26).padEnd(26)} ${stored.padStart(6)} ${String(r.ratios.length).padStart(4)}` +
    ` ${ratio.toFixed(3).padStart(7)}  ${(expectedForStored ? expectedForStored.toFixed(3) : '-').padStart(7)}  ${verdict}`
  );
}

console.log(`
  ratio     this shop's raw number divided by the median AUD price other
            shops charge for the SAME model.
  expect    what that ratio should be if the stored currency is right.
  n         models shared with at least one other shop. Under 3 is not shown.

  WHAT THIS CANNOT DO. A currency and a discount are the same observation.
  Miniatures Minichamps prices in EUR and sits ~15% under the field, which is
  arithmetically identical to pricing in GBP -- the first version of this
  script duly accused a Belgian shop of using sterling. Neighbouring
  currencies are 15-25% apart and real shops differ by more than that, so
  "GBP or EUR?" is not answerable from prices alone and never was.

  WHAT IT IS FOR. Ruling out a GROSS error, which is the one that costs money:
  DrivenBy read as its declared HKD would have been 5x out, and an understated
  price wins "cheapest". Nothing on this list is 5x out.

  It is also a baseline. These ratios are stable per shop, so a shop quietly
  switching currency later shows up as a large move rather than as prices that
  merely look like a good deal.
`);
