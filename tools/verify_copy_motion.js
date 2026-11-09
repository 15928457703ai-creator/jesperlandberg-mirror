// Regression pass for the local copy motion (arrival wipe + magnetic skew).
//
// Checks, per local case study:
//   * the active sheet's copy is split into glyph spans (pointer skew can run)
//   * the split did not change line breaking: no line may start with a
//     closing CJK mark (the classic "lone 。" regression)
//   * the arrival wipe actually runs on SPA entry (clip-path animates)
//   * the pointer leans glyphs and they settle back afterwards
// and once globally:
//   * stock (WebGL) case studies are untouched -- no glyph spans there
//   * SPA navigation A -> B -> home leaves exactly one visible copy
//   * no console errors / hydration warnings
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:5188';
const LOCAL = ['oppo-service', 'naivideo', 'erp', 'oppo-self-service', 'csa-service',
  'hengxiang-advantage', 'illustration'];
const STOCK = ['dogelon-mars', 'griflan'];
const CLOSE = /[、。，．,.!?！？；：;:）)］\]｝\}」』】》〉”’…—～·%‰℃]/;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const fails = [];
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fails.push(name + (detail ? ' :: ' + detail : ''));
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
    if (/Hydration|hydration|mismatch/i.test(t)) errors.push('HYDRATION ' + t.slice(0, 200));
    else if (m.type() === 'error') errors.push('CONSOLE ' + t.slice(0, 200));
  });

  for (const slug of LOCAL) {
    await page.goto(BASE + '/projects/' + slug, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(2200);

    const state = await page.evaluate((CLOSE_SRC) => {
      const CLOSE = new RegExp(CLOSE_SRC);
      const sheet = document.querySelector('[data-gl="sheet"][data-lc-state="in"]');
      if (!sheet) return { missing: true };
      const body = sheet.querySelector('div[data-gl="text"]');
      const title = sheet.querySelector('h1');
      const spans = body ? body.querySelectorAll('.lc-c').length : 0;

      // group rendered glyph spans into visual lines and look at the first
      // character of each line
      const glyphs = body ? [...body.querySelectorAll('.lc-c')] : [];
      const lines = new Map();
      for (const g of glyphs) {
        const r = g.getBoundingClientRect();
        if (!r.height) continue;
        const key = Math.round(r.top);
        if (!lines.has(key)) lines.set(key, []);
        lines.get(key).push({ t: g.textContent, left: r.left });
      }
      const badLineStarts = [];
      for (const arr of lines.values()) {
        arr.sort((a, b) => a.left - b.left);
        const first = arr[0] && arr[0].t;
        if (first && first.length === 1 && CLOSE.test(first)) badLineStarts.push(first);
      }
      return {
        spans: spans,
        lines: lines.size,
        badges: badLineStarts,
        titleSpans: title ? title.querySelectorAll('.lc-c').length : 0,
        text: body ? body.textContent : ''
      };
    }, CLOSE.source);

    check(slug + ' active sheet found', !state.missing);
    check(slug + ' copy split into glyphs', state.spans > 20, 'spans=' + state.spans);
    check(slug + ' no line starts with closing mark', state.badges.length === 0, JSON.stringify(state.badges));

    // pointer lean
    const target = await page.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
      const glyphs = [...body.querySelectorAll('.lc-c')];
      const g = glyphs[Math.min(12, glyphs.length - 1)];
      const r = g.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(1300, 840);
    await wait(300);
    await page.mouse.move(target.x, target.y);
    // software WebGL renders at a few fps here; the lean is time-based, so a
    // slow frame budget needs a longer window, not a different curve
    await wait(900);
    const leaned = await page.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
      let max = 0;
      for (const g of body.querySelectorAll('.lc-c')) {
        const m = /skewX\((-?[\d.]+)deg\)/.exec(g.style.transform || '');
        if (m) max = Math.max(max, Math.abs(parseFloat(m[1])));
      }
      return max;
    });
    check(slug + ' glyphs lean under the pointer', leaned > 5, 'maxSkew=' + leaned.toFixed(1));

    await page.mouse.move(1300, 840);
    await wait(1400);
    const settled = await page.evaluate(() => {
      const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
      let max = 0;
      for (const g of body.querySelectorAll('.lc-c')) {
        const m = /skewX\((-?[\d.]+)deg\)/.exec(g.style.transform || '');
        if (m) max = Math.max(max, Math.abs(parseFloat(m[1])));
      }
      return max;
    });
    check(slug + ' glyphs settle back', settled < 0.6, 'residualSkew=' + settled.toFixed(2));
  }

  // arrival wipe on SPA entry
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await wait(2200);
  const wipe = await page.evaluate(async () => {
    const card = document.querySelector('[data-gl="card"][data-id="erp"]');
    (card.querySelector('a') || card).click();
    return new Promise((resolve) => {
      const seen = [];
      let n = 0;
      const step = () => {
        const body = document.querySelector('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]');
        if (body) {
          const anims = body.getAnimations();
          seen.push(anims.length);
          if (anims.length) {
            const a = anims[0];
            resolve({ animated: true, clip: getComputedStyle(body).clipPath, elapsed: a.currentTime });
            return;
          }
        }
        if (++n > 60) return resolve({ animated: false, seen });
        requestAnimationFrame(step);
      };
      step();
    });
  });
  check('entry wipe runs on the copy', wipe.animated === true, JSON.stringify(wipe));

  // stock pages must stay untouched
  for (const slug of STOCK) {
    await page.goto(BASE + '/projects/' + slug, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(1800);
    const spans = await page.evaluate(() =>
      document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"] .lc-c').length);
    check('stock ' + slug + ' untouched', spans === 0, 'spans=' + spans);
  }

  // SPA round trip: exactly one copy on screen, always the right one
  await page.goto(BASE + '/projects/oppo-service', { waitUntil: 'networkidle' });
  await wait(2000);
  const readVisible = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-gl="sheet"][data-lc-state="in"] div[data-gl="text"]')]
      .filter((n) => getComputedStyle(n).visibility !== 'hidden' && +getComputedStyle(n).opacity > 0.5)
      .map((n) => n.textContent.slice(0, 12)));

  const trip = [];
  await page.keyboard.press('ArrowRight');
  await wait(1200);
  const afterNext = await page.evaluate(() => location.pathname);
  trip.push({ step: 'next', path: afterNext, visible: await readVisible() });
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await wait(1600);
  trip.push({ step: 'home', visible: await readVisible() });
  check('exactly one copy after arrow-key switch',
    trip[0].visible.length === 1 && trip[0].path !== '/projects/oppo-service',
    JSON.stringify(trip[0]));
  check('no copy left on home', trip[1].visible.length === 0, JSON.stringify(trip[1]));

  check('no console / hydration errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log('PASS ' + pass + '  FAIL ' + fails.length);
  fails.forEach((f) => console.log('  x ' + f));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
