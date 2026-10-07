/**
 * Run the retailer sweep across every sweepable shop, to completion.
 *
 *   node scripts/sweep-gaps.mjs              # dry run, writes nothing
 *   node scripts/sweep-gaps.mjs --apply      # live
 *   node scripts/sweep-gaps.mjs --all        # every model, not only the gaps
 *   node scripts/sweep-gaps.mjs --port 3000  # defaults to 3000
 *
 * WHY THIS EXISTS RATHER THAN THE ADMIN BUTTON.
 *
 * A sitemap shop reads one product page per candidate and stops on a clock,
 * returning `nextOffset` to resume from. Through the UI that means pressing
 * Apply repeatedly without touching the dropdown, reloading, or switching
 * between Dry run and Apply -- the cursors are separate per mode, so any of
 * those silently restarts at zero. STATUS-SUMMARY records that LIVECARMODEL
 * never once finished that way: after a week of attempts, 807 of its links
 * had not been re-read in over a fortnight.
 *
 * A loop cannot make those mistakes. It follows nextOffset until the shop
 * says it is done, and prints what each one actually covered so a truncated
 * pass is visible rather than looking like a clean "nothing new".
 *
 * gapsOnly by default, which is the right tool straight after an import: it
 * narrows the candidate list to models with no link at this shop, so one pass
 * does the job. It refreshes no prices -- use --all for that.
 */

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i > -1 ? process.argv[i + 1] : '3000';
})();
const BASE = `http://localhost:${PORT}/api/admin/sweep-retailer`;
const APPLY = process.argv.includes('--apply');
const GAPS_ONLY = !process.argv.includes('--all');

/** Guard against a runaway resume loop if a shop ever stops advancing. */
const MAX_PASSES = 40;

const post = async body => {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    // An HTML error page here means the dev server is compiling or the route
    // 500'd -- say so rather than reporting "no feed".
    throw new Error(`${r.status} non-JSON response: ${text.slice(0, 120)}`);
  }
};

let list;
try {
  list = await (await fetch(BASE)).json();
} catch (e) {
  console.error(`Cannot reach ${BASE}\nStart the server first:  npx next start -p ${PORT}`);
  process.exit(1);
}

const targets = (list.retailers || []).filter(r => r.sweepable);
console.log(
  `${APPLY ? 'APPLYING to' : 'DRY RUN over'} ${targets.length} sweepable shops` +
  `${GAPS_ONLY ? ', gaps only' : ', every model'}\n`
);
console.log('shop                         passes  scanned   new  refresh  review  images  notes');

const totals = { new: 0, refresh: 0, review: 0, images: 0, written: 0 };
const problems = [];

for (const t of targets) {
  let offset = 0, passes = 0, scanned = 0;
  const sum = { new: 0, refresh: 0, review: 0, images: 0 };
  const notes = new Set();

  try {
    for (;;) {
      const d = await post({
        retailerId: t.id,
        dryRun: !APPLY,
        gapsOnly: GAPS_ONLY,
        offset,
      });
      passes++;

      if (d.error) { notes.add(`ERROR ${String(d.details || d.error).slice(0, 44)}`); break; }
      if (!d.feed) { notes.add(String(d.message || 'no feed').slice(0, 44)); break; }

      scanned += d.feed.scanned ?? d.feed.products ?? 0;
      sum.new += d.totals?.new || 0;
      sum.refresh += d.totals?.refresh || 0;
      sum.review += d.totals?.review || 0;
      sum.images += d.imagesFilled || 0;
      if (d.written) totals.written += d.written;
      if (d.feed.truncated) notes.add('TRUNCATED');
      if (d.currencyDisputed) notes.add(`currency decl=${d.declaredCurrency} est=${d.establishedCurrency}`);

      const next = d.feed.nextOffset;
      if (next == null || next === offset) break;      // done, or not advancing
      offset = next;
      if (passes >= MAX_PASSES) { notes.add(`STOPPED at ${MAX_PASSES} passes`); break; }
    }
  } catch (e) {
    /**
     * A LOST RESPONSE IS NOT A FAILED WRITE.
     *
     * Miniatures Minichamps reported "FAILED fetch failed" with 0 passes on
     * the 2026-10-08 apply, and had in fact written all 14 of its links --
     * the server finished the work and the response never came back. The
     * totals gave it away: links rose by 112 against 98 reported, and 112-98
     * is exactly its 14. A dry re-check then showed 0 new.
     *
     * So this must never read as "nothing happened" during an apply, or the
     * obvious reaction is to re-run the shop. Worded to say what is actually
     * known: the client lost the answer, the server may have completed.
     */
    notes.add(APPLY
      ? `RESPONSE LOST (${e.message.slice(0, 30)}) — may have written; re-check before re-running`
      : `FAILED ${e.message.slice(0, 44)}`);
  }

  for (const k of ['new', 'refresh', 'review', 'images']) totals[k] += sum[k];
  if ([...notes].some(n => /ERROR|FAILED|TRUNCATED|STOPPED/.test(n))) problems.push([t.name, [...notes].join('; ')]);

  console.log(
    `${t.name.slice(0, 28).padEnd(28)} ${String(passes).padStart(6)} ${String(scanned).padStart(8)}` +
    ` ${String(sum.new).padStart(5)} ${String(sum.refresh).padStart(8)} ${String(sum.review).padStart(7)}` +
    ` ${String(sum.images).padStart(7)}  ${[...notes].join(' ')}`
  );
}

console.log(
  `\ntotal: ${totals.new} new links · ${totals.refresh} refreshed · ${totals.review} for review` +
  ` · ${totals.images} images` + (APPLY ? ` · ${totals.written} rows written` : ' · NOTHING WRITTEN (dry run)')
);
if (problems.length) {
  console.log('\nshops that did not finish cleanly:');
  for (const [name, why] of problems) console.log(`  ${name}: ${why}`);
} else {
  console.log('every shop finished cleanly');
}
if (!APPLY) console.log('\nrerun with --apply to write');
