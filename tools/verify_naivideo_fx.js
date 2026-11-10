/* LEGACY VERIFIER — retired 2026-11-09.
 * This checks the retired 8-slice FX (18.852s video).  The ACTIVE cover is
 * the 11-card collage verified by tools/verify_naivideo_ultra.js.
 * Kept for archive inspection; pass --force-legacy to run it.
 */
if (!process.argv.includes('--force-legacy')) {
  console.log('LEGACY: 8-slice FX is archived. Active verification is ' +
              'tools/verify_naivideo_ultra.js.');
  process.exit(0);
}

/* Verify the user-supplied Naivideo motion FX is the ACTIVE home cover.

   1. Home: 10 cards, first three unchanged, and the Naivideo card's
      WebGL video texture is /naivideo/live.mp4 with duration ~18.85s
      (the retired cover was 12s) and an advancing currentTime.
   2. Payload: featured[1] points at live.mp4; the 8 detail slides keep their
      original media (only the first has a video) -> no data rebuild damage.
   3. Detail: SPA + direct load keep 8 slides, CJK copy and the poster og.
   4. Showcase: /naivideo-fx and /naivideo-live both serve the user's page
      (8 slices, GSAP 3.12.5, pure black), the 7-move loop animates, hover
      glow works, click-to-focus works, reduced-motion stops the loop.
   5. Zero page/console/hydration errors, 4xx and external requests.
*/
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = path.dirname(__dirname);
const ORIGIN = 'http://127.0.0.1:5188';
const OUT = path.join(ROOT, 'screenshots');
const wait = ms => new Promise(r => setTimeout(r, ms));
const LAUNCH = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required']
};
const HOOK = () => {
  window.__videos = [];
  const orig = document.createElement;
  document.createElement = function (tag) {
    const el = orig.apply(this, arguments);
    if (String(tag).toLowerCase() === 'video') window.__videos.push(el);
    return el;
  };
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(HOOK);
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], media = [];
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
    if (/\/naivideo\/live/.test(u)) media.push(r.status() + ' ' + u.replace(ORIGIN, ''));
  });

  const vids = () => page.evaluate(() => (window.__videos || []).map(v => ({
    src: (v.currentSrc || v.src || '').split('/').pop().split('?')[0],
    ready: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2),
    dur: isFinite(v.duration) ? +v.duration.toFixed(2) : null,
    w: v.videoWidth, h: v.videoHeight, loop: v.loop
  })));

  const boot = async () => {
    await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !document.querySelector('div.z-99') &&
      document.querySelectorAll('canvas').length > 0, null, { timeout: 60000 }).catch(() => {});
    await wait(3200);
  };

  // ------------------------------------------------------------------ HOME
  await boot();
  const home = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-gl="card"]')];
    const c = cards.find(x => x.getAttribute('data-id') === 'naivideo');
    return {
      cards: cards.length,
      order: cards.slice(0, 3).map(x => x.getAttribute('data-id')),
      title: c?.querySelector('[data-title]')?.textContent.trim(),
      canvas: document.querySelectorAll('canvas').length,
      siteName: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
    };
  });
  await page.waitForFunction(() => {
    const v = (window.__videos || []).find(x => (x.currentSrc || x.src || '').includes('live.mp4'));
    return v && v.readyState >= 2 && !v.paused && v.currentTime > 0.05;
  }, null, { timeout: 25000 }).catch(() => {});
  const a = (await vids()).find(v => v.src === 'live.mp4');
  await wait(1400);
  const b = (await vids()).find(v => v.src === 'live.mp4');
  const playing = !!(a && b && b.ready >= 2 && !b.paused && b.t > a.t);
  console.log('HOME', JSON.stringify(home));
  console.log('cover video', JSON.stringify(a), '->', JSON.stringify(b), '| playing:', playing);
  await page.screenshot({ path: path.join(OUT, 'nv_fx_home_card.png') });

  // --------------------------------------------------------------- PAYLOAD
  const payload = JSON.parse(fs.readFileSync(path.join(ROOT, 'site', '_payload.json'), 'utf8'));
  const root = payload.find(o => o && typeof o === 'object' && 'projects' in o);
  const v = i => (typeof i === 'number' ? payload[i] : i);
  const proj = payload[root.featured].map(v)
    .find(o => o && typeof o === 'object' && v(o.slug) === 'naivideo');
  const slideVideos = payload[proj.images].map(v).map(o => v(o.video));
  const data = {
    featuredVideo: v(proj.video), card: v(proj.card), thumb: v(proj.thumb),
    slides: slideVideos.length, slideVideos,
  };
  console.log('PAYLOAD', JSON.stringify(data));

  // ----------------------------------------------------------- SPA + direct
  await boot();
  const card = page.locator('[data-gl="card"][data-id="naivideo"]');
  let navigated = false;
  for (let i = 0; i < 3 && !navigated; i++) {
    try {
      if (i === 0) await card.click({ force: true, timeout: 12000 });
      else await card.dispatchEvent('click');
      navigated = await page.waitForFunction(() => {
        const sh = document.querySelector('[data-gl="sheet"]');
        return sh && sh.getAttribute('data-id') === 'naivideo' &&
          (sh.querySelector('[data-gl="text"]')?.textContent || '').trim().length > 0;
      }, null, { timeout: 12000 }).then(() => true).catch(() => false);
    } catch (e) { /* retry */ }
  }
  await wait(1600);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const d = sh?.querySelector('[data-gl="text"]');
    return { url: location.pathname, id: sh?.getAttribute('data-id'),
      title: sh?.querySelector('h1')?.textContent.trim(),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      copy: d?.textContent.trim().slice(0, 40),
      fill: d ? getComputedStyle(d).webkitTextFillColor : null };
  });
  console.log('SPA', navigated, JSON.stringify(spa));
  await page.screenshot({ path: path.join(OUT, 'nv_fx_detail_spa.png') });

  await page.goto(ORIGIN + '/projects/naivideo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await wait(2400);
  const direct = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return { url: location.pathname, id: sh?.getAttribute('data-id'),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      og: document.querySelector('meta[property="og:image"]')?.content };
  });
  console.log('DIRECT', JSON.stringify(direct));

  // ------------------------------------------------------- showcase pages
  const showcase = {};
  for (const route of ['/naivideo-fx', '/naivideo-live']) {
    await page.goto(ORIGIN + route, { waitUntil: 'networkidle', timeout: 60000 });
    await wait(2600);                       // intro (1.75s) must have finished
    const states = [];
    for (let i = 0; i < 6; i++) {
      states.push(await page.evaluate(() => {
        const el = document.querySelector('.tile-3d');
        return el.style.transform + '|' + el.style.filter;
      }));
      await wait(450);
    }
    const info = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.tile').length,
      loaded: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: window.gsap ? window.gsap.version : null,
      bg: getComputedStyle(document.body).backgroundColor,
      destroyHook: typeof window.__naivideoDestroy === 'function',
      hasCJKRefs: [...document.images].some(i => /切图/.test(i.getAttribute('src') || '')),
    }));
    showcase[route] = { ...info, animated: new Set(states).size > 1, states: new Set(states).size };
    console.log('SHOWCASE', route, JSON.stringify(showcase[route]));
    await page.screenshot({ path: path.join(OUT, 'nv_fx_showcase' + route.replace('/', '_') + '.png') });
  }

  // hover + click focus on the canonical page
  await page.goto(ORIGIN + '/naivideo-fx', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(2400);
  const box = await page.locator('.tile').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await wait(650);
  const hover = await page.evaluate(() => ({
    glow: +parseFloat(getComputedStyle(document.querySelector('.glow')).opacity).toFixed(2),
    faceTransform: document.querySelector('.tile-face').style.transform,
  }));
  console.log('HOVER', JSON.stringify(hover));
  await page.screenshot({ path: path.join(OUT, 'nv_fx_hover.png') });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(1100);
  const focus = await page.evaluate(() => ({
    visible: getComputedStyle(document.querySelector('#focusCard')).visibility,
    hasImg: !!document.querySelector('#focusCard img'),
  }));
  console.log('FOCUS', JSON.stringify(focus));
  await page.screenshot({ path: path.join(OUT, 'nv_fx_focus.png') });

  // reduced motion: no looping animation
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(ORIGIN + '/naivideo-fx', { waitUntil: 'networkidle', timeout: 60000 });
  await wait(2600);
  const r1 = await page.evaluate(() => document.querySelector('.tile-3d').style.transform);
  await wait(900);
  const r2 = await page.evaluate(() => document.querySelector('.tile-3d').style.transform);
  const reducedOk = r1 === r2;
  console.log('REDUCED MOTION', JSON.stringify({ r1, r2, static: reducedOk }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // --------------------------------------------------------------- verdict
  const okHome = home.cards === 10 && home.title === 'Naivideo' && home.canvas === 1 &&
    home.siteName === 'Fengmei' &&
    JSON.stringify(home.order) === JSON.stringify(['oppo-service', 'naivideo', 'oppo-self-service']) &&
    playing && !!b && Math.abs(b.dur - 18.85) < .2 && b.w === 1600 && b.h === 900;
  const okData = data.featuredVideo === '/naivideo/live.mp4' &&
    /\/naivideo\/live_card\.jpg$/.test(data.card) &&
    data.slides === 8 && data.slideVideos[0] === '/naivideo/live.mp4' &&
    data.slideVideos.slice(1).every(x => x === null);
  const okSheet = navigated && spa.url === '/projects/naivideo' && spa.title === 'Naivideo' &&
    spa.slides === 8 && spa.fill === 'rgb(0, 0, 0)' && (spa.copy || '').length > 20 &&
    direct.id === 'naivideo' && direct.slides === 8 && /live_card\.jpg$/.test(direct.og || '');
  const okShowcase = Object.values(showcase).every(s =>
    s.tiles === 8 && s.loaded === 8 && s.gsap === '3.12.5' &&
    s.bg === 'rgb(0, 0, 0)' && s.destroyHook && !s.hasCJKRefs && s.animated);
  const okInteractive = hover.glow > .2 && focus.visible === 'visible' && focus.hasImg && reducedOk;
  // entries look like "206 /naivideo/live.mp4" (status first, then path)
  const okAssets = media.some(x => /^(200|206) .*live\.mp4/.test(x)) &&
    ['live.jpg', 'live_small.jpg', 'live_card.jpg'].every(f =>
      fs.existsSync(path.join(ROOT, 'site', 'naivideo', f)));
  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;

  console.log('\n=== NAIVIDEO FX VERIFY ===');
  console.log('home / data / sheet / showcase / interactive / assets / clean:',
    okHome, okData, okSheet, okShowcase, okInteractive, okAssets, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
    'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  console.log('media requests:', [...new Set(media)].slice(0, 12));
  const result = { home, a, b, playing, data, spa, direct, showcase, hover, focus,
    reducedOk, okHome, okData, okSheet, okShowcase, okInteractive, okAssets,
    clean, perr, cerr, hyd, bad, ext, media: [...new Set(media)] };
  fs.writeFileSync(path.join(ROOT, 'raw', 'verify_naivideo_fx.json'), JSON.stringify(result, null, 1));
  await browser.close();
  if (!(okHome && okData && okSheet && okShowcase && okInteractive && okAssets && clean)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
