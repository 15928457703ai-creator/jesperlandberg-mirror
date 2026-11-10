/* Verify the requested 10-card home permutation, the default first screen,
 * the detail-page prev/next ring and hydration after the SSR reorder. */
const { chromium } = require('playwright-core');
const path = require('path');
const OUT = path.join(__dirname, '..', 'screenshots');
const ORIGIN = 'http://127.0.0.1:5188';
const ORDER = [
  'oppo-service', 'naivideo', 'oppo-self-service', 'erp', 'csa-service',
  'hengxiang-advantage', 'ai-video', 'the-lookback',
  'griflan', 'illustration'
];
const TITLES = {
  'oppo-service': 'OPPO 服务小程序', 'naivideo': 'Naivideo',
  'oppo-self-service': 'OPPO自助服务', 'erp': 'ERP',
  'csa-service': 'CSA客服服务', 'hengxiang-advantage': '横向优势',
  'illustration': '插画', 'ai-video': 'AI短视频'
};
const wait = ms => new Promise(r => setTimeout(r, ms));

// The stock WebGL renderer creates DETACHED <video> elements for clip
// textures, so querySelectorAll('video') finds nothing. Hook createElement.
const HOOK = () => {
  window.__videos = [];
  const orig = document.createElement;
  document.createElement = function (tag) {
    const el = orig.apply(this, arguments);
    if (String(tag).toLowerCase() === 'video') window.__videos.push(el);
    return el;
  };
};

const readCards = () => {
  const cards = [...document.querySelectorAll('[data-gl="card"]')].map((e, i) => {
    const r = e.getBoundingClientRect();
    return {
      i, id: e.getAttribute('data-id'),
      title: (e.innerText || '').trim().split('\n')[0].slice(0, 40),
      left: Math.round(r.left), right: Math.round(r.right),
      cx: Math.round(r.left + r.width / 2), w: Math.round(r.width)
    };
  });
  return { cards, vw: innerWidth, vh: innerHeight };
};

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
           '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
           '--autoplay-policy=no-user-gesture-required']
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(HOOK);
  const perr = [], cerr = [], hyd = [], bad = [], ext = [];
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
    if (!u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
  });

  // ---- 1. home: DOM order + default first screen -------------------------
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('div.z-99') &&
    document.querySelectorAll('canvas').length > 0, { timeout: 60000 }).catch(() => {});
  await wait(4800);
  const home = await page.evaluate(readCards);
  const ids = home.cards.map(c => c.id);
  const orderOK = JSON.stringify(ids) === JSON.stringify(ORDER);
  const visible = home.cards.filter(c => c.right > 0 && c.left < home.vw);
  const center = visible.reduce((a, b) =>
    Math.abs(b.cx - home.vw / 2) < Math.abs(a.cx - home.vw / 2) ? b : a, visible[0]);
  const firstThree = visible.slice(0, 3).map(c => c.id);
  await page.screenshot({ path: path.join(OUT, 'home_order_first_screen.png') });
  console.log('\n=== HOME ===');
  console.log('card count:', ids.length, '| DOM order === requested:', orderOK);
  console.log('order:', ids.join(' -> '));
  console.log('first screen visible:', firstThree.join(' | '), '| centered:', center.id);
  console.log('titles:', home.cards.slice(0, 6).map(c => c.id + '=' + c.title).join(', '));

  // Naivideo's motion cover is now the centered card; confirm it really plays.
  await wait(2600);
  const clips = await page.evaluate(() => (window.__videos || []).map(v => ({
    src: (v.currentSrc || v.src || '').split('/').pop().split('?')[0],
    paused: v.paused, t: +v.currentTime.toFixed(2), ready: v.readyState
  })));
  console.log('video textures on first screen:', JSON.stringify(clips));
  const live = clips.find(v => /live\.mp4/.test(v.src));
  console.log('Naivideo motion cover playing:', !!(live && !live.paused && live.t > 0));

  // ---- 2. scroll to the far end, illustration must be last --------------
  // The rail is an INFINITE LOOP: rolling past card #10 wraps back to #1.
  // Stop the moment the last card enters the viewport, then shoot it.
  let tailShot = false;
  for (let i = 0; i < 95; i++) {
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 2600);
    await wait(90);
    const r = await page.evaluate(() => {
      const c = document.querySelector('[data-gl="card"][data-id="illustration"]');
      if (!c) return null;
      const b = c.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth };
    });
    if (r && r.right > 0 && r.left < r.vw) {
      tailShot = true;
      // Shoot immediately: the wheel inertia keeps rolling and the rail
      // wraps back to card #1 within ~1s.
      await wait(180);
      await page.screenshot({ path: path.join(OUT, 'home_order_tail.png') });
      break;
    }
  }
  await wait(900);
  const tail = await page.evaluate(readCards);
  const tailVisible = tail.cards.filter(c => c.right > 0 && c.left < tail.vw).map(c => c.id);
  console.log('\n=== TAIL ===');
  console.log('illustration entered viewport:', tailShot, '| visible:', tailVisible.join(' | '));
  console.log('DOM last still illustration:', ids[ids.length - 1] === 'illustration');

  // ---- 3. related ring on 3 representative detail pages -----------------
  const ringCases = ORDER.map((slug, i) => ({
    slug,
    want: [ORDER[(i - 1 + ORDER.length) % ORDER.length], ORDER[(i + 1) % ORDER.length]]
  }));
  const ring = [];
  for (const c of ringCases) {
    await page.goto(ORIGIN + '/projects/' + c.slug, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(1900);
    const r = await page.evaluate(() => ({
      sheet: document.querySelector('[data-gl="sheet"]')?.getAttribute('data-id'),
      rel: [...document.querySelectorAll('[data-gl="related"]')].map(e => ({
        id: e.getAttribute('data-id'),
        href: e.querySelector('a')?.getAttribute('href'),
        label: e.querySelector('a')?.getAttribute('aria-label')
      })),
      canvas: document.querySelectorAll('canvas').length
    }));
    const ok = r.sheet === c.slug &&
      r.rel.length === 2 &&
      r.rel[0].id === c.want[0] && r.rel[1].id === c.want[1] &&
      r.rel[0].href === '/projects/' + c.want[0] && r.rel[1].href === '/projects/' + c.want[1];
    ring.push({ slug: c.slug, ok, rel: r.rel.map(x => x.id), sheet: r.sheet });
    console.log('ring', c.slug.padEnd(20), ok ? 'OK  ' : 'FAIL',
      r.rel.map(x => x.id + ' (' + x.label + ')').join(' | '));
  }
  await page.screenshot({ path: path.join(OUT, 'home_order_detail_ring.png') });

  // ---- 4. SPA click from home card -> detail, then back -----------------
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('div.z-99') &&
    document.querySelectorAll('canvas').length > 0, { timeout: 60000 }).catch(() => {});
  await wait(4600);
  await page.locator('[data-gl="card"][data-id="oppo-service"]').evaluate(el => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }).catch(() => {});
  await wait(2200);
  const spa = await page.evaluate(() => ({
    path: location.pathname,
    sheet: document.querySelector('[data-gl="sheet"]')?.getAttribute('data-id'),
    h1: document.querySelector('[data-gl="sheet"] h1')?.textContent.trim()
  }));
  console.log('\n=== SPA ===');
  console.log('after clicking first card:', JSON.stringify(spa));

  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  console.log('\n=== ERRORS ===');
  console.log('pageerror', perr.length, '| console error', cerr.length,
              '| hydration', hyd.length, '| 4xx/failed', bad.length, '| external', ext.length);
  if (perr.length) console.log(' perr:', perr.slice(0, 5));
  if (cerr.length) console.log(' cerr:', cerr.slice(0, 5));
  if (hyd.length) console.log(' hyd :', hyd.slice(0, 5));
  if (bad.length) console.log(' bad :', bad.slice(0, 5));
  if (ext.length) console.log(' ext :', ext.slice(0, 5));

  const okAll = orderOK && ids.length === ORDER.length && center.id === 'naivideo' &&
    firstThree.join(',') === 'oppo-service,naivideo,oppo-self-service' &&
    ring.every(x => x.ok) && clean;
  console.log('\nHOME ORDER VERIFY:', okAll ? 'PASS' : 'FAIL');
  await browser.close();
  if (!okAll) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
