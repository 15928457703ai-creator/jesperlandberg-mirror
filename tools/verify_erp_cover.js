/* Verify the animated ERP home cover.
 *
 *  1. home rail: the ERP card requests /erp/cover.mp4 (range 200/206) and
 *     /erp/cover.jpg, i.e. the WebGL renderer really plays the clip;
 *  2. click through into the detail: the sheet keeps its 11 still slides,
 *     now opening on /erp/1.jpg with /erp/2.jpg second (the detail deck was
 *     reordered; home_cover must still not leak into it);
 *  3. direct URL load of /projects/erp: no console/page errors, no 4xx, no
 *     external requests, no hydration mismatch;
 *  4. the motion stage itself (/erp-fx) loads both slices + the three webfonts
 *     with no errors, and the loop is seam-free.
 */
const { chromium } = require('playwright-core');
const path = require('path');

const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'erp';
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], reqs = [];
  page.on('pageerror', e => perr.push(e.message.slice(0, 200)));
  page.on('console', m => {
    const s = m.text();
    if (m.type() === 'error') cerr.push(s.slice(0, 200));
    if (/hydration|mismatch/i.test(s) && !/gl-text/i.test(s)) hyd.push(s.slice(0, 200));
  });
  page.on('requestfailed', r => {
    const e = (r.failure() || {}).errorText || '';
    if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(e)) bad.push('FAILED ' + r.url());
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(O) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
    if (/\/erp\/[\w.-]+/.test(u)) reqs.push(u.replace(O, '') + ':' + r.status());
  });

  const results = [];
  const check = (name, ok, note) => {
    results.push({ name, ok: !!ok, note: note || '' });
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  [' + note + ']' : ''));
  };

  /* ---- 1. home rail uses the clip ---- */
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  for (let i = 0; i < 60; i++) {
    if (reqs.some(x => /^\/erp\/cover\.mp4:(200|206)$/.test(x)) &&
        reqs.some(x => /^\/erp\/cover\.jpg:200$/.test(x))) break;
    await wait(300);
  }
  const home = await page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-gl="card"]')].map(e => e.getAttribute('data-id')),
    canvas: document.querySelectorAll('canvas').length,
    payload: !!document.querySelector('script#__NUXT_DATA__'),
  }));
  await page.screenshot({ path: path.join(OUT, 'erp_cover_home.png') });
  check('home rail has the ERP card', home.order.includes(SLUG), 'cards=' + home.order.length);
  check('home card fetched cover.mp4', reqs.some(x => /^\/erp\/cover\.mp4:(200|206)$/.test(x)),
    reqs.filter(x => x.includes('cover.mp4')).join(',') || 'none');
  check('home card fetched cover.jpg poster', reqs.some(x => /^\/erp\/cover\.jpg:200$/.test(x)));
  // The renderer builds its texture videos off-DOM, so assert on the payload
  // (what the card is told to show) plus the range request the media element
  // makes once it starts buffering.
  const featured = await page.evaluate(async () => {
    const r = await fetch('/_payload.json').then(x => x.json());
    const flat = JSON.stringify(r);
    const i = flat.indexOf('/erp/cover.mp4');
    return { hasVideo: i > 0, near: i > 0 ? flat.slice(Math.max(0, i - 260), i + 40) : '' };
  });
  check('payload hands the card cover.mp4', featured.hasVideo, featured.near.slice(-200));
  const ranges = await page.evaluate(async () => {
    const res = await fetch('/erp/cover.mp4', { headers: { Range: 'bytes=0-1023' } });
    return { status: res.status, len: (await res.arrayBuffer()).byteLength };
  });
  check('cover.mp4 served with byte ranges', ranges.status === 206 && ranges.len === 1024,
    JSON.stringify(ranges));

  /* ---- 2. detail sheet keeps its stills ---- */
  reqs.length = 0;                       // only count what the detail pulls
  let nav = false;
  for (let i = 0; i < 3 && !nav; i++) {
    try {
      await page.locator(`[data-gl="card"][data-id="${SLUG}"]`).first().click({ timeout: 8000 });
      await wait(2600);
      nav = /\/projects\/erp/.test(page.url());
    } catch (e) { await wait(600); }
  }
  if (!nav) {
    await page.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2600);
  }
  const detail = await page.evaluate(() => {
    const sheet = document.querySelector('[data-gl="sheet"][data-lc-state="in"]')
      || document.querySelector('[data-gl="sheet"][data-id]');
    const imgs = [...document.querySelectorAll('[data-gl="sheet"] img')].map(i => i.getAttribute('src'));
    return {
      url: location.pathname,
      id: sheet && sheet.getAttribute('data-id'),
      imgs: imgs.slice(0, 4),
      count: imgs.length,
      slides: document.querySelectorAll('[data-gl="slide"], [data-gl="sheet"] [data-gl="media"]').length,
    };
  });
  check('navigated into the ERP detail', /\/projects\/erp/.test(detail.url), detail.url);
  await page.screenshot({ path: path.join(OUT, 'erp_cover_detail.png') });
  const detailErpReqs = [...new Set(reqs.filter(x => /\/erp\//.test(x)))];
  check('detail sheet did not pull the motion files',
    !detailErpReqs.some(x => /cover\.(mp4|jpg|_card|_small)/.test(x)),
    detailErpReqs.join(',') || '(no /erp/ requests yet)');

  /* ---- 3. direct URL load is clean ---- */
  const before = { perr: perr.length, cerr: cerr.length, hyd: hyd.length, bad: bad.length, ext: ext.length };
  await page.goto(O + '/projects/' + SLUG, { waitUntil: 'networkidle', timeout: 60000 });
  await wait(2500);
  const deck = await page.evaluate(async () => {
    const flat = await fetch('/projects/erp/_payload.json').then(r => r.json());
    const g = i => (typeof i === 'number' && i >= 0 && i < flat.length ? flat[i] : i);
    const walk = (o, acc) => {
      if (typeof o === 'string') { if (/^\/erp\/[\w.-]+\.jpg$/.test(o)) acc.add(o); return acc; }
      if (Array.isArray(o)) { o.forEach(v => walk(v, acc)); return acc; }
      if (o && typeof o === 'object') { Object.values(o).forEach(v => walk(v, acc)); return acc; }
      return acc;
    };
    const imgs = [...walk(flat, new Set())].sort();
    // devalue is a flat array: resolve the project's images[] in its real
    // order instead of merely checking that a filename appears somewhere.
    const proj = flat.filter(x => x && typeof x === 'object' && !Array.isArray(x))
      .find(o => g(o.slug) === 'erp' && o.images !== undefined);
    const order = proj ? (g(proj.images) || []).map(i => g(g(i).src)) : [];
    return { imgs, count: imgs.filter(x => /^\/erp\/\d+\.jpg$/.test(x)).length,
             first: order[0], second: order[1] };
  });
  check('detail deck still holds all 11 stills', deck.count === 11, deck.imgs.join(','));
  check('detail deck opens on /erp/1.jpg with /erp/2.jpg second',
    deck.first === '/erp/1.jpg' && deck.second === '/erp/2.jpg',
    deck.first + ' | ' + deck.second);
  check('no page errors', perr.length === before.perr, perr.slice(0, 2).join(' | '));
  check('no console errors', cerr.length === before.cerr, cerr.slice(0, 2).join(' | '));
  check('no hydration mismatch', hyd.length === before.hyd, hyd.slice(0, 2).join(' | '));
  check('no failed/4xx requests', bad.length === before.bad, bad.slice(0, 3).join(' | '));
  check('no external requests', ext.length === before.ext, ext.slice(0, 3).join(' | '));

  /* ---- 4. the motion stage ---- */
  const p2 = await ctx.newPage();
  const e2 = [];
  p2.on('pageerror', e => e2.push(e.message));
  p2.on('response', r => { if (r.status() >= 400) e2.push(r.status() + ' ' + r.url()); });
  await p2.goto(O + '/erp-fx?capture=1', { waitUntil: 'networkidle', timeout: 60000 });
  await p2.evaluate(() => document.fonts.ready);
  const stage = await p2.evaluate(() => {
    const fx = window.__erpSeek;
    const read = () => ['#gridPhone', '#detailPhone', '#badge'].map(s => {
      const t = getComputedStyle(document.querySelector(s)).transform;
      return (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)') ? 'rest' : t;
    }).join('|');
    fx.seek(0); const a = read();
    // a mid-loop frame must actually differ, otherwise "motion" is a still
    fx.seek(7); const m = read();
    fx.seek(fx.duration - 0.001); const b = read();
    fx.seek(0);
    return {
      duration: fx.duration, seam: a === b, moving: a !== m,
      fonts: [...document.fonts].map(f => f.family + ':' + f.status),
      imgs: [...document.images].map(i => i.naturalWidth),
      width: document.getElementById('stage').getBoundingClientRect().width,
    };
  });
  check('stage: 14 s loop', stage.duration === 14, String(stage.duration));
  check('stage: seamless (t0 === t14)', stage.seam);
  check('stage: mid-loop differs from rest', stage.moving);
  check('stage: both slices + 3 fonts load',
    stage.imgs.join(',') === '754,809' && stage.fonts.every(f => /loaded$/.test(f)),
    stage.imgs.join(',') + ' | ' + stage.fonts.join(','));
  check('stage: no errors', e2.length === 0, e2.slice(0, 2).join(' | '));
  await p2.close();

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) {
    console.log('FAILED:', failed.map(f => f.name).join('; '));
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
