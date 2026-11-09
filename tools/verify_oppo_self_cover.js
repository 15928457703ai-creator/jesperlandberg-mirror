/* Verify `封面.jpg` is the FIRST slide of the OPPO自助服务 detail page,
 * while the home card uses its own animated cover (motion.jpg/motion.mp4)
 * and the numbered stills remain the detail slides.
 * Also guards hydration / console / 4xx / external requests on both the
 * direct URL load and the SPA navigation.
 */
const { chromium } = require('playwright-core');
const path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'oppo-self-service';
const HOME = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'nathan-riley', 'casa-di-solare',
  'the-lookback', 'book-of-happiness', 'dogelon-mars', 'gil-huybrecht',
  'discoveryland', 'griflan', 'illustration'];
const wait = ms => new Promise(r => setTimeout(r, ms));

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
    if (/\/oppo-self\/[\w.-]+/.test(u)) reqs.push(u.replace(O, '') + ':' + r.status());
  });

  // ---- 1. home strip: cover must still come from 1_card.jpg ---------------
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(3200);
  // The home rail now loads several looping video textures.  Wait until the
  // OPPO self-service motion cover has actually been requested instead of
  // assuming it wins the race within a fixed 3.2s window.
  for (let i = 0; i < 40; i++) {
    if (reqs.some(x => /^\/oppo-self\/motion\.mp4:(200|206)$/.test(x)) &&
        reqs.some(x => /^\/oppo-self\/motion\.jpg:200$/.test(x))) break;
    await wait(300);
  }
  const home = await page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-gl="card"]')].map(e => e.getAttribute('data-id')),
    canvas: document.querySelectorAll('canvas').length,
    site: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
  }));
  await page.screenshot({ path: path.join(OUT, 'oppo_self_cover_home.png') });
  const homeReqs = [...new Set(reqs)];
  // The home card became an animated cover later (see verify_oppo_self_motion.js
  // and project_config.py:home_cover).  Its texture is motion.jpg + motion.mp4;
  // the numbered stills are only idle preloads / detail slides.
  const homeCoverReqs = homeReqs.filter(x => /\/oppo-self\/1(_small|_card)?\.jpg/.test(x));
  const homeMotion = homeReqs.some(x => /^\/oppo-self\/motion\.mp4:(200|206)$/.test(x)) &&
                     homeReqs.some(x => /^\/oppo-self\/motion\.jpg:200$/.test(x));
  console.log('HOME order:', JSON.stringify(home.order) === JSON.stringify(HOME),
    '| cards:', home.order.length, '| canvas:', home.canvas, '| site:', home.site);
  console.log('HOME oppo-self requests:', homeReqs.filter(x => x.includes('/oppo-self/')).join(', ') || '(none)');

  // ---- 2. SPA navigation into the detail ----------------------------------
  let navigated = false;
  for (let i = 0; i < 3 && !navigated; i++) {
    try {
      const card = page.locator(`[data-gl="card"][data-id="${SLUG}"]`);
      await card.waitFor({ state: 'attached', timeout: 30000 });
      if (i === 0) await card.click({ force: true, timeout: 12000 });
      else await card.dispatchEvent('click');
      await page.waitForFunction(s => location.pathname === '/projects/' + s &&
        !!document.querySelector('[data-gl="sheet"][data-id="' + s + '"]'),
        SLUG, { timeout: 14000 });
      navigated = true;
    } catch (e) { console.log('nav attempt', i, e.message.slice(0, 90)); }
  }
  await wait(2800);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      h1: sh?.querySelector('h1')?.textContent.trim(),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      ratios: [...(sh?.querySelectorAll('[data-gl="simple"]') || [])]
        .map(e => (e.getAttribute('style') || '').match(/aspect-ratio:([^;]+)/)?.[1]?.trim()),
      related: [...document.querySelectorAll('[data-gl="related"]')].map(x => x.getAttribute('data-id')),
      canvas: document.querySelectorAll('canvas').length,
    };
  });
  console.log('SPA:', JSON.stringify(spa));
  await page.screenshot({ path: path.join(OUT, 'oppo_self_cover_spa_top.png') });

  // ---- 3. direct URL load + gradually open the sheet ----------------------
  await page.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(3200);
  await page.screenshot({ path: path.join(OUT, 'oppo_self_cover_direct_0.png') });
  for (const [i, n] of [2, 3, 3, 4].entries()) {
    for (let k = 0; k < n; k++) {
      await page.mouse.move(720, 500);
      await page.mouse.wheel(0, 480);
      await wait(170);
    }
    await wait(700);
    await page.screenshot({ path: path.join(OUT, `oppo_self_cover_direct_${i + 1}.png`) });
  }
  const direct = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      scrollY: Math.round(scrollY), canvas: document.querySelectorAll('canvas').length,
    };
  });
  console.log('DIRECT:', JSON.stringify(direct));

  const zero = [...new Set(reqs.filter(x => /\/oppo-self\/0(_small|_card)?\.jpg/.test(x)))];
  const one = [...new Set(reqs.filter(x => /\/oppo-self\/1(_small|_card)?\.jpg/.test(x)))];
  console.log('\n0.jpg family requests:', zero.sort().join(', ') || '(none)');
  console.log('1.jpg family requests:', one.sort().join(', ') || '(none)');

  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  const okHome = JSON.stringify(home.order) === JSON.stringify(HOME) && home.canvas === 1 &&
    home.site === 'Fengmei' && homeCoverReqs.length > 0 && homeMotion;
  const okSheet = navigated && spa.url === '/projects/' + SLUG && spa.id === SLUG &&
    spa.h1 === 'OPPO自助服务' && spa.slides === 17 &&
    spa.ratios.every(r => r === '1600 / 900') &&
    JSON.stringify(spa.related) === JSON.stringify(['naivideo', 'erp']) && spa.canvas === 1;
  const okDirect = direct.id === SLUG && direct.slides === 17 && direct.canvas === 1;
  const okAssets = zero.some(x => x.startsWith('/oppo-self/0.jpg:200')) &&
    one.some(x => /^\/oppo-self\/1(_small|_card)?\.jpg:200/.test(x)) &&
    !reqs.some(x => /:4\d\d|:5\d\d/.test(x));
  console.log('\n=== OPPO SELF-SERVICE FIRST SLIDE VERIFY ===');
  console.log('home / sheet / direct / assets / clean:',
    okHome, okSheet, okDirect, okAssets, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
    'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  if (bad.length) console.log('bad:', bad.slice(0, 8));
  if (cerr.length) console.log('console:', cerr.slice(0, 8));
  await browser.close();
  if (!(okHome && okSheet && okDirect && okAssets && clean)) process.exit(1);
})();
