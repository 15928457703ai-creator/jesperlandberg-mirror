/* Regression pass for the left-hand copy's top-down line reveal.
 *
 * The stock WebGL text shader reveals lines in order, 75 ms apart, each with
 * a 1.1 s expo-out rise into a mask window pinned to its resting box. The
 * locally added (DOM-painted, CJK) case studies must do the same, both when
 * entering from the home strip and on a cold load of the detail URL.
 *
 * Checks per local project:
 *   - every glyph of the paragraph has a reveal animation
 *   - the animations form >= 2 distinct line delays, 75 ms apart, in
 *     top-to-bottom order (first line starts first)
 *   - the first keyframe is hidden (clip inset + downward offset), so there
 *     is no frame where the whole paragraph is readable at once
 *   - the reveal finishes: no animations left, text unchanged, no clip left
 *   - on a cold load the copy is held at opacity 0 before the intro starts
 *   - stock (WebGL) case studies still have no glyph spans
 *   - no console / hydration errors
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'raw', 'verify_copy_lines.json');
const LOCAL = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'illustration', 'ai-video'];
const STOCK = ['griflan', 'dogelon-mars'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fails.push(name + (detail ? ' :: ' + detail : ''));
}

// Samples are stamped IN the page: software WebGL can block the main thread
// for seconds, so a Node-side `wait(900)` may actually be evaluated at +8 s.
const SAMPLER = () => {
  window.__lc = {
    seen: false, delays: [], samples: [], readyAt: 0, firstAnimAt: 0,
    firstAt: 0, lastAt: 0
  };
  const t0 = performance.now();
  let lastSig = '';
  const step = () => {
    const t = Math.round(performance.now() - t0);
    // addInitScript runs at document_start: documentElement may not exist yet.
    const de = document.documentElement;
    const lc = de ? de.getAttribute('data-lc') : null;
    // Only the ACTIVE, local sheet matters: a related stock sheet elsewhere
    // in the DOM legitimately sits at opacity 1 and would be a false flash.
    const slug = (/^\/projects\/([^\/?#]+)/.exec(location.pathname) || [])[1];
    const sel = slug ? '[data-gl="sheet"][data-id="' + slug + '"]' : '[data-gl="sheet"][data-lc-state="in"]';
    const body = document.querySelector(sel + ' div[data-gl="text"]');
    const op = body ? +getComputedStyle(body).opacity : null;
    let count = 0;
    const gs = document.querySelectorAll(sel + ' div[data-gl="text"] .lc-c');
    for (const g of gs) {
      for (const a of g.getAnimations()) {
        if (a.id !== 'lc-reveal') continue;
        count++;
        const d = Math.round(a.effect.getTiming().delay);
        if (window.__lc.delays.indexOf(d) < 0) window.__lc.delays.push(d);
        if (!window.__lc.seen) {
          window.__lc.seen = true;
          window.__lc.firstAt = t;
        }
        window.__lc.lastAt = t;
      }
    }
    if (lc === 'ready' && !window.__lc.readyAt) window.__lc.readyAt = t;
    if (count && !window.__lc.firstAnimAt) window.__lc.firstAnimAt = t;
    const sig = [lc, op, count > 0].join('|');
    if (sig !== lastSig) { lastSig = sig; window.__lc.samples.push([t, lc, op, count > 0]); }
    if (t < 22000) setTimeout(step, 25);
  };
  step();
};

function lineReport(delays) {
  const d = delays.slice().sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < d.length; i++) gaps.push(d[i] - d[i - 1]);
  return { delays: d, gaps };
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--no-sandbox', '--disable-dev-shm-usage']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const t = m.text();
    if (/Hydration|hydration|mismatch/i.test(t)) errors.push('HYDRATION ' + t.slice(0, 180));
    else if (m.type() === 'error') errors.push('CONSOLE ' + t.slice(0, 180));
  });

  const report = [];

  // ---- 1. SPA entry from the home strip ---------------------------------
  for (const slug of LOCAL) {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 });
    await wait(1700);
    await page.evaluate(SAMPLER);
    await page.evaluate((s) => {
      const card = document.querySelector(`[data-gl="card"][data-id="${s}"]`);
      (card.querySelector('a') || card).click();
    }, slug);
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"] .lc-c')]
        .some((g) => g.getAnimations().length), null, { timeout: 12000 });

    const live = await page.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
      const gs = [...body.querySelectorAll('.lc-c')];
      const anims = gs.flatMap((g) => g.getAnimations());
      const first = gs[0];
      return {
        text: body.textContent,
        glyphs: gs.length,
        animated: anims.length,
        clip: first ? getComputedStyle(first).clipPath : '',
        translate: first ? getComputedStyle(first).translate : '',
        heights: first ? first.getBoundingClientRect().height : 0
      };
    });
    check(slug + ' every glyph animated', live.animated === live.glyphs,
      JSON.stringify({ glyphs: live.glyphs, animated: live.animated }));
    check(slug + ' first frame hidden by the mask',
      /inset\(/.test(live.clip) && /px/.test(live.translate),
      JSON.stringify({ clip: live.clip, translate: live.translate }));

    await wait(2600);
    const settled = await page.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
      const gs = [...body.querySelectorAll('.lc-c')];
      return {
        text: body.textContent,
        opacity: +getComputedStyle(body).opacity,
        anims: gs.reduce((a, g) => a + g.getAnimations().length, 0),
        clip: gs.length ? getComputedStyle(gs[0]).clipPath : '',
        translate: gs.length ? getComputedStyle(gs[0]).translate : '',
        lc: document.documentElement.getAttribute('data-lc')
      };
    });
    const s = await page.evaluate(() => window.__lc);
    const lr = lineReport(s.delays);
    check(slug + ' distinct line delays', lr.delays.length >= 2, JSON.stringify(lr));
    check(slug + ' 75 ms top-down stagger',
      lr.gaps.length > 0 && lr.gaps.every((g) => g >= 55 && g <= 95), JSON.stringify(lr));
    check(slug + ' settles at rest',
      settled.anims === 0 && settled.opacity === 1 && settled.clip === 'none' &&
      (settled.translate === 'none' || settled.translate === '0px') &&
      settled.text === live.text && settled.lc === 'ready',
      JSON.stringify(settled));
    report.push({ slug, scene: 'entry', lines: lr, firstAt: s.firstAt, settled });
  }

  // ---- 2. cold load of each detail URL ----------------------------------
  for (const slug of LOCAL) {
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errors.push('PAGEERROR cold ' + slug + ' ' + e.message));
    p2.on('console', (m) => {
      if (m.type() === 'error') errors.push('CONSOLE cold ' + slug + ' ' + m.text().slice(0, 160));
    });
    await p2.addInitScript(SAMPLER);
    await p2.goto(BASE + '/projects/' + slug, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // Wait in page time, not wall time (a blocked main thread must not make
    // the check look like it ran "early").
    await p2.waitForFunction(() => window.__lc && window.__lc.seen, null,
      { timeout: 45000, polling: 100 });
    await p2.waitForFunction(() =>
      [...document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"] .lc-c')]
        .every((g) => g.getAnimations().length === 0), null, { timeout: 30000, polling: 100 });
    const s = await p2.evaluate(() => window.__lc);
    const held = s.samples.filter((x) => x[0] < s.readyAt - 50 && x[2] === 0);
    const flash = s.samples.filter((x) => x[0] < s.firstAnimAt && x[2] > 0.5);
    check(slug + ' cold load holds copy off first paint',
      s.readyAt > 0 && held.length > 0,
      JSON.stringify({ readyAt: s.readyAt, samples: s.samples.slice(0, 6) }));
    check(slug + ' no full-opacity flash before the reveal',
      flash.length === 0, JSON.stringify({ firstAnimAt: s.firstAnimAt, flash }));

    const after = await p2.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"] div[data-gl="text"]');
      const gs = [...body.querySelectorAll('.lc-c')];
      return {
        op: +getComputedStyle(body).opacity,
        anims: gs.reduce((a, g) => a + g.getAnimations().length, 0),
        spans: gs.length,
        text: body.textContent.slice(0, 24),
        lc: document.documentElement.getAttribute('data-lc')
      };
    });
    const lr = lineReport(s.delays);
    check(slug + ' cold load runs the line reveal',
      s.seen && lr.delays.length >= 2 && lr.gaps.every((g) => g >= 55 && g <= 95),
      JSON.stringify({ seen: s.seen, ...lr }));
    check(slug + ' cold load ends readable',
      after.op === 1 && after.anims === 0 && after.spans > 20 && after.lc === 'ready',
      JSON.stringify(after));
    report.push({ slug, scene: 'cold', readyAt: s.readyAt, firstAnimAt: s.firstAnimAt,
      lines: lr, firstAt: s.firstAt, after });
    await p2.close();
  }

  // ---- 3. stock case studies are untouched ------------------------------
  for (const slug of STOCK) {
    await page.goto(BASE + '/projects/' + slug, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(1500);
    const spans = await page.evaluate(() =>
      document.querySelectorAll('[data-gl="sheet"] .lc-c').length);
    check('stock ' + slug + ' still WebGL-drawn', spans === 0, 'spans=' + spans);
  }

  check('no console / hydration errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  fs.writeFileSync(OUT, JSON.stringify({ pass, fails, report, errors }, null, 1));
  await browser.close();
  console.log('PASS ' + pass + '  FAIL ' + fails.length);
  fails.forEach((f) => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
