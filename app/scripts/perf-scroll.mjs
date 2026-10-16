/**
 * Measure what blocks the main thread on a page, in a real Chrome.
 *
 *   node scripts/perf-scroll.mjs https://diecasts.app/browse
 *   node scripts/perf-scroll.mjs http://localhost:3000/browse --cpu 6
 *   node scripts/perf-scroll.mjs https://diecasts.app/browse --vs http://localhost:3000/browse
 *
 * WHY THIS EXISTS
 *
 * /browse froze for two people and was "fixed" twice without being measured.
 * Both fixes rewrote React. When this was finally run against the deployed
 * page, one scroll to the bottom came back as:
 *
 *     script (React)      185 ms
 *     style recalc        671 ms
 *     layout            5,354 ms
 *     paint/composite  14,647 ms
 *     -----------------------------
 *     total blocked    20,857 ms   over 152 long tasks
 *
 * React was 1% of the problem. Both fixes had been aimed at the 1%. The
 * split is the whole value of this script: "the page is slow" is not
 * actionable and "paint is 70% of it" is.
 *
 * A second belief it killed on the same run: images were assumed to be the
 * cost. `--no-images` blocked all 2,204 of them and 79% of the cost
 * remained. Guessing had been wrong three times by then.
 *
 * WHAT IT DOES
 *
 * Loads the page, waits for it to go quiet, then performs the gestures a
 * person actually makes and reports how long the thread was unavailable for
 * each. Chrome keeps running totals for script, style and layout; sampling
 * them either side of a gesture gives the split without reading a trace.
 *
 * Anything left after those three is paint, raster and compositing, which is
 * reported as one figure because that is as far as getMetrics resolves it.
 *
 * READING THE OUTPUT
 *
 *   blocked      thread unavailable during the gesture. Over ~300ms is felt.
 *   worst task   the longest single block. Over ~1s reads as "frozen".
 *   p50 frame    16ms is smooth. 100ms+ for most frames is the complaint.
 *
 * Default is 4x CPU slowdown, which stands in for a mid-range machine. An
 * unthrottled run on a dev box hides nearly everything: the same /browse
 * scroll that blocked 20.8s at 4x reported a comfortable 74ms at 1x, which
 * would have sent this investigation back to guessing.
 *
 * THREE RUNS, MEDIAN REPORTED, AND THAT IS NOT OPTIONAL
 *
 * The first version of this script ran once. Its very first report said
 * ticking a filter cost 1,711ms of script, which was passed on as a finding.
 * Two further runs said 173ms and 177ms. The number was noise -- one GC
 * pause, or one unlucky sample -- and it had already been believed.
 *
 * A measurement tool that is trusted over reasoning has to be harder to fool
 * than reasoning was. So it runs three times and reports the median, and the
 * spread is printed whenever the fastest and slowest disagree by more than
 * half, because that is the signal to stop believing the number at all.
 *
 * REQUIRES a local Chrome. It drives the installed browser rather than
 * downloading one, which is why the dependency is puppeteer-core and not
 * puppeteer.
 */

import { existsSync } from 'fs';
import puppeteer from 'puppeteer-core';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};

const URL_A = argv.find((a) => a.startsWith('http'));
const URL_B = flag('vs', null);
const CPU = Number(flag('cpu', 4));
const RUNS = Math.max(1, Number(flag('runs', 3)));
const NO_IMAGES = argv.includes('--no-images');

if (!URL_A) {
  console.error(`
Usage: node scripts/perf-scroll.mjs <url> [options]

  --vs <url>     run a second url and print both, for before/after
  --cpu <n>      CPU slowdown, default 4. Use 1 to see an unthrottled run.
  --runs <n>     repeats, median reported. Default 3. Do not use 1.
  --no-images    block all images, to tell decode cost from layout cost
`);
  process.exit(1);
}

/** Wherever Chrome actually is. Edge works too and is the usual fallback. */
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error('No Chrome found. Set CHROME_PATH to the executable.');
  process.exit(1);
}

async function measure(url) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  let blockedImages = 0;
  if (NO_IMAGES) {
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      if (r.resourceType() === 'image') { blockedImages++; return r.abort(); }
      r.continue();
    });
  }

  /** Long tasks are what "frozen" means: the thread not yielding. */
  await page.evaluateOnNewDocument(() => {
    window.__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__long.push(Math.round(e.duration));
    }).observe({ entryTypes: ['longtask'] });
  });

  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  const loadMs = Date.now() - t0;

  // Hydration lands after load. Measuring before it settles blames the
  // gesture for work the page was going to do anyway.
  await new Promise((r) => setTimeout(r, 6000));

  const metrics = async () => {
    const { metrics: m } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(m.map((x) => [x.name, x.value]));
  };

  const shape = await page.evaluate(() => ({
    nodes: document.querySelectorAll('*').length,
    links: document.querySelectorAll('a').length,
    images: document.querySelectorAll('img').length,
    height: document.body.scrollHeight,
  }));
  const m0 = await metrics();
  const results = [];

  async function gesture(label, fn) {
    const a = await metrics();
    await page.evaluate(() => { window.__long.length = 0; });
    const frames = await fn();
    // Let anything the gesture kicked off actually finish before sampling.
    await new Promise((r) => setTimeout(r, 2000));
    const b = await metrics();
    const tasks = await page.evaluate(() => window.__long.slice());

    const d = (k) => Math.round(((b[k] || 0) - (a[k] || 0)) * 1000);
    const total = d('TaskDuration');
    const script = d('ScriptDuration');
    const style = d('RecalcStyleDuration');
    const layout = d('LayoutDuration');
    const paint = total - script - style - layout;
    const worst = Math.max(0, ...tasks);

    let p50 = '-';
    if (frames?.length) {
      const s = [...frames].sort((x, y) => x - y);
      p50 = String(Math.round(s[Math.floor(s.length / 2)]));
    }

    results.push({ label, total, script, style, layout, paint, worst, p50 });
  }

  /**
   * The filter tick goes FIRST, and is undone before anything else runs.
   *
   * It was last, and so it was measured against a page that the scroll
   * gestures had already grown by several append batches. Same click,
   * different amount of work, depending on gestures that had nothing to do
   * with it. Ticking on a freshly loaded page and unticking afterwards puts
   * the page back exactly where it started for the scroll measurements.
   */
  const checkbox = await page.$('aside input[type="checkbox"]');
  if (checkbox) {
    await gesture('tick a filter', async () => { await checkbox.click(); return null; });
    await checkbox.click();
    await new Promise((r) => setTimeout(r, 1500));
  }

  /** Wheel-ish: 100px a frame, the rate a hand actually produces. */
  await gesture('scroll 10 screens', () =>
    page.evaluate(async () => {
      const gaps = [];
      let last = performance.now();
      for (let i = 0; i < 90; i++) {
        window.scrollBy(0, 100);
        await new Promise((r) => requestAnimationFrame(() => {
          const now = performance.now();
          gaps.push(now - last);
          last = now;
          r();
        }));
      }
      return gaps;
    })
  );

  /**
   * The scrollbar drag, which is the gesture a PC has and a phone does not.
   * This is the one that produced the original report: it demands continuous
   * repainting of enormous jumps rather than a screen at a time.
   */
  await gesture('drag to bottom', () =>
    page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => requestAnimationFrame(r));
      return null;
    })
  );

  await gesture('back to top', () =>
    page.evaluate(async () => {
      window.scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(r));
      return null;
    })
  );

  await browser.close();
  return { shape, loadMs, layoutObjects: Math.round(m0.LayoutObjects), results };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

async function report(url) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    process.stderr.write(`  measuring ${url}  run ${i + 1}/${RUNS}\r`);
    runs.push(await measure(url));
  }
  process.stderr.write(' '.repeat(70) + '\r');

  const { shape, layoutObjects } = runs[0];
  console.log(`\n${'='.repeat(78)}`);
  console.log(`${url}   @ ${CPU}x CPU, median of ${RUNS}${NO_IMAGES ? ', images blocked' : ''}`);
  console.log('='.repeat(78));
  console.log(`  load ${median(runs.map((r) => r.loadMs))} ms   ${shape.nodes.toLocaleString()} elements   ` +
              `${shape.links.toLocaleString()} links   ${shape.images.toLocaleString()} images   ` +
              `${shape.height.toLocaleString()} px tall   ${layoutObjects.toLocaleString()} layout objects`);
  console.log('');
  console.log(`  ${'gesture'.padEnd(20)} ${'blocked'.padStart(8)} ${'script'.padStart(7)}` +
              ` ${'style'.padStart(6)} ${'layout'.padStart(7)} ${'paint+'.padStart(7)}` +
              ` ${'worst'.padStart(6)} ${'p50fr'.padStart(6)}`);

  for (let g = 0; g < runs[0].results.length; g++) {
    const all = runs.map((r) => r.results[g]);
    const pick = (k) => median(all.map((x) => Number(x[k]) || 0));
    const worst = pick('worst');
    const totals = all.map((x) => x.total);
    const p50 = all[0].p50 === '-' ? '-' : String(pick('p50'));

    /**
     * Spread is printed when the runs disagree badly, because a median of
     * three wild numbers is still a wild number. This is the guard against
     * the 1,711ms sample that started all of this being quietly averaged
     * into something that looks like a measurement.
     */
    const lo = Math.min(...totals), hi = Math.max(...totals);
    const unstable = RUNS > 1 && hi > lo * 1.5 && hi - lo > 150;

    const mark = worst > 1000 ? '  FROZEN' : worst > 300 ? '  janky' : '';
    console.log(`  ${all[0].label.padEnd(20)} ${String(pick('total')).padStart(8)} ${String(pick('script')).padStart(7)}` +
                ` ${String(pick('style')).padStart(6)} ${String(pick('layout')).padStart(7)} ${String(pick('paint')).padStart(7)}` +
                ` ${String(worst).padStart(6)} ${p50.padStart(6)}${mark}` +
                (unstable ? `   UNSTABLE ${lo}-${hi}, do not quote` : ''));
  }
}

await report(URL_A);
if (URL_B) await report(URL_B);

console.log(`
  blocked     thread unavailable, ms. Over ~300 is felt.
  paint+      whatever is left after script/style/layout: paint, raster,
              composite. getMetrics does not resolve it further.
  worst       longest single task. Over ~1000 reads as "the page is frozen".
  p50fr       median frame interval during the gesture. 16 ms is smooth.

  A local 'next start' left running across a rebuild serves stale HTML
  against deleted JS chunks, so nothing hydrates and the page looks broken
  in a way that mimics a real bug. Kill the port before trusting a local run.
`);
