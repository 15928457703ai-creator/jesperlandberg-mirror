/* Verify the OPPO 自助服务 home card now paints the recorded GSAP motion,
 * while the detail page keeps ALL 17 static slides and no other interaction
 * changes.  Also checks the standalone showcase page and reduced motion.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const HOME = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'nathan-riley', 'casa-di-solare',
  'the-lookback', 'book-of-happiness', 'dogelon-mars', 'gil-huybrecht',
  'discoveryland', 'griflan', 'illustration'];
const wait = ms => new Promise(r => setTimeout(r, ms));

const HOOK = () => {
  window.__videos = [];
  const orig = document.createElement;
  document.createElement = function (tag) {
    const el = orig.apply(this, arguments);
    if (String(tag).toLowerCase() === 'video') window.__videos.push(el);
    return el;
  };
};
const readClips = () => (window.__videos || []).map(v => ({
  src: (v.currentSrc || v.src || '').split('/').pop().split('?')[0],
  path: new URL(v.currentSrc || v.src || location.href).pathname,
  paused: v.paused, t: +v.currentTime.toFixed(2), ready: v.readyState,
}));

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
    if (/\/oppo-self\//.test(u) || /\/oppo-self-live\//.test(u)) reqs.push(u.replace(O, '') + ':' + r.status());
  });

  // ---- 1. home: the third card's texture must be the motion clip ---------
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(5000);
  const home = await page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-gl="card"]')].map(e => e.getAttribute('data-id')),
    canvas: document.querySelectorAll('canvas').length,
    site: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
  }));
  const clipsA = await page.evaluate(readClips);
  await page.screenshot({ path: path.join(OUT, 'os_motion_home.png') });
  await wait(1800);
  const clipsB = await page.evaluate(readClips);
  const mA = clipsA.find(v => v.path === '/oppo-self/motion.mp4');
  const mB = clipsB.find(v => v.path === '/oppo-self/motion.mp4');
  console.log('HOME order:', JSON.stringify(home.order) === JSON.stringify(HOME),
    '| canvas:', home.canvas, '| site:', home.site);
  console.log('clips:', JSON.stringify(clipsA.map(v => [v.path, v.paused, v.t, v.ready])));
  console.log('motion clip A:', JSON.stringify(mA), '-> B:', JSON.stringify(mB));
  const homeReqs = [...new Set(reqs)];
  console.log('home oppo-self requests:', homeReqs.join(', '));

  // ---- 2. detail page: still 17 static slides, no motion assets ----------
  reqs.length = 0;
  await page.goto(O + '/projects/oppo-self-service', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(3200);
  const detail = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return {
      id: sh?.getAttribute('data-id'),
      h1: sh?.querySelector('h1')?.textContent.trim(),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      canvas: document.querySelectorAll('canvas').length,
    };
  });
  await page.screenshot({ path: path.join(OUT, 'os_motion_detail.png') });
  const detailReqs = [...new Set(reqs)];
  // The stock client silently preloads every featured project's cover texture
  // on every route, so motion.mp4 being fetched here is normal and invisible.
  // What must be static is the detail sheet's own media list: read it from
  // the payload the page hydrated with.
  const payload = await page.evaluate(async () => {
    const d = await (await fetch('/projects/oppo-self-service/_payload.json')).json();
    const v = i => (typeof i === 'number' ? d[i] : i);
    const root = d.find(o => o && typeof o === 'object' && 'projects' in o);
    const obj = d[root.projects].map(v).find(o => o && v(o.slug) === 'oppo-self-service');
    const imgs = d[obj.images].map(v);
    return { slides: imgs.length, videos: imgs.map(o => v(o.video)),
             first: v(imgs[0].src), second: v(imgs[1].src) };
  });
  console.log('\nDETAIL:', JSON.stringify(detail));
  console.log('detail media:', JSON.stringify(payload));
  console.log('detail oppo-self requests:', detailReqs.join(', '));

  // ---- 3. standalone showcase page: GSAP timeline + reduced motion ------
  await page.goto(O + '/oppo-self-live', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(1200);
  const live = await page.evaluate(() => ({
    gsap: window.gsap ? window.gsap.version : null,
    timeline: !!window.__osTimeline,
    active: !!window.__osTimeline?.isActive(),
    duration: window.__osTimeline?.duration(),
    cuts: document.querySelectorAll('.cut').length,
    images: [...document.images].filter(i => i.naturalWidth > 0).length,
  }));
  await page.screenshot({ path: path.join(OUT, 'os_motion_showcase.png') });
  console.log('\nSHOWCASE:', JSON.stringify(live));

  // ---- 4. reduced motion: static, fully visible composition, no timeline --
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(O + '/oppo-self-live', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(600);
  const reduced = await page.evaluate(() => ({
    timeline: !!window.__osTimeline,
    cuts: [...document.querySelectorAll('.cut-in')].map(e => +getComputedStyle(e).opacity),
    titles: [...document.querySelectorAll('.headline,.subline')].map(e => +getComputedStyle(e).opacity),
  }));
  console.log('\nREDUCED MOTION:', JSON.stringify(reduced));

  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  const okHome = JSON.stringify(home.order) === JSON.stringify(HOME) && home.canvas === 1 &&
    home.site === 'Fengmei' &&
    homeReqs.some(x => x === '/oppo-self/motion.jpg:200') &&
    homeReqs.some(x => /^\/oppo-self\/motion\.mp4:(200|206)$/.test(x));
  const okMotion = !!(mA && mB && mA.ready >= 2 &&
    (!mB.paused || mB.t > mA.t) && mB.t > 0);
  const okDetail = detail.id === 'oppo-self-service' && detail.h1 === 'OPPO自助服务' &&
    detail.slides === 17 && detail.canvas === 1 &&
    payload.slides === 17 && payload.videos.every(v => v === null) &&
    payload.first === '/oppo-self/0.jpg' && payload.second === '/oppo-self/1.jpg' &&
    detailReqs.some(x => x.startsWith('/oppo-self/0.jpg:200')) &&
    detailReqs.some(x => x.startsWith('/oppo-self/1.jpg:200'));
  const okShowcase = live.gsap === '3.15.1' && live.timeline && live.active &&
    Math.abs(live.duration - 12) < .001 && live.cuts === 3 && live.images === 4;
  const okReduced = !reduced.timeline && reduced.cuts.every(o => o > .99) &&
    reduced.titles.every(o => o > .99);
  console.log('\n=== OPPO SELF-SERVICE HOME MOTION VERIFY ===');
  console.log('home / motion playing / detail static / showcase / reduced / clean:',
    okHome, okMotion, okDetail, okShowcase, okReduced, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
    'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  if (bad.length) console.log('bad:', bad.slice(0, 8));
  if (cerr.length) console.log('console:', cerr.slice(0, 8));
  await browser.close();
  if (!(okHome && okMotion && okDetail && okShowcase && okReduced && clean)) process.exit(1);
})();
