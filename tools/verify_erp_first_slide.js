/* Verify the ERP deck artwork ("华润白酒ERP" 2.jpg) and that the home
 * cover / 11 slides / SPA + direct loads / all effects stay intact.
 *
 * The deck was later reordered to 1, 2, 3..11 (the black 制造业数字化
 * title page 1.jpg is now slide 1, 2.jpg is slide 2). The home rail used to
 * prefetch 2.jpg and now prefetches 1.jpg; both assets must still resolve. */
const { chromium } = require('playwright-core');
const path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'erp';
const HOME = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'ai-video', 'nathan-riley', 'casa-di-solare',
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
    if (/\/erp\/\d+(_\w+)?\.jpg/.test(u)) reqs.push(u.replace(O, '') + ':' + r.status());
  });
  const boot = () => page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});

  // ---- 1. home strip: ERP cover is served from the replaced 2.jpg ---------
  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await boot(); await wait(3200);
  const home = await page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-gl="card"]')].map(e => e.getAttribute('data-id')),
    canvas: document.querySelectorAll('canvas').length,
    site: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
  }));
  await page.screenshot({ path: path.join(OUT, 'erp_first_slide_home.png') });
  const homeErp = [...new Set(reqs)].filter(x => x.includes('/erp/'));
  console.log('HOME order:', JSON.stringify(home.order) === JSON.stringify(HOME),
    '| ERP at #' + (home.order.indexOf(SLUG) + 1), '| canvas:', home.canvas, '| site:', home.site);
  console.log('HOME /erp/ requests:', homeErp.join(', ') || '(none)');

  // ---- 2. SPA navigation into the ERP detail ------------------------------
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
  await page.screenshot({ path: path.join(OUT, 'erp_first_slide_spa_top.png') });

  // ---- 3. direct URL load: first slide + second slide both visible --------
  await page.goto(O + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await boot(); await wait(3200);
  await page.screenshot({ path: path.join(OUT, 'erp_first_slide_direct.png') });
  for (let k = 0; k < 2; k++) {
    await page.mouse.move(720, 500); await page.mouse.wheel(0, 420); await wait(180);
  }
  await wait(700);
  await page.screenshot({ path: path.join(OUT, 'erp_first_slide_second.png') });
  const direct = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      canvas: document.querySelectorAll('canvas').length,
    };
  });
  console.log('DIRECT:', JSON.stringify(direct));

  const two = [...new Set(reqs)].filter(x => /\/erp\/2(_small|_card)?\.jpg/.test(x));
  const one = [...new Set(reqs)].filter(x => x.startsWith('/erp/1'));
  console.log('\n2.jpg family:', two.sort().join(', ') || '(none)');
  console.log('1.jpg family:', one.sort().join(', ') || '(none)');

  // The WebGL renderer only fetches the variants it needs (2.jpg / 1.jpg);
  // probe all three generated variants explicitly so a missing _card /
  // _small file cannot slip through.
  const variants = {};
  for (const f of ['2.jpg', '2_small.jpg', '2_card.jpg', '1.jpg']) {
    variants[f] = (await page.request.get(O + '/erp/' + f)).status();
  }
  console.log('variant status:', JSON.stringify(variants));

  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  const okHome = JSON.stringify(home.order) === JSON.stringify(HOME) && home.canvas === 1 &&
    home.site === 'Fengmei' &&
    homeErp.some(x => /^\/erp\/(1\.jpg|cover\.jpg):200$|^\/erp\/cover\.mp4:(200|206)$/.test(x));
  const okSheet = navigated && spa.url === '/projects/' + SLUG && spa.id === SLUG &&
    spa.h1 === 'ERP' && spa.slides === 11 && spa.ratios.every(r => r === '1600 / 900') &&
    JSON.stringify(spa.related) === JSON.stringify(['oppo-self-service', 'csa-service']) &&
    spa.canvas === 1;
  const okDirect = direct.id === SLUG && direct.slides === 11 && direct.canvas === 1;
  const okAssets = two.some(x => x === '/erp/2.jpg:200') &&
    one.some(x => x === '/erp/1.jpg:200') &&
    Object.values(variants).every(s => s === 200) &&
    !reqs.some(x => /:4\d\d|:5\d\d/.test(x));
  console.log('\n=== ERP FIRST SLIDE VERIFY ===');
  console.log('home / sheet / direct / assets / clean:',
    okHome, okSheet, okDirect, okAssets, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
    'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  if (bad.length) console.log('bad:', bad.slice(0, 8));
  if (cerr.length) console.log('console:', cerr.slice(0, 8));
  await browser.close();
  if (!(okHome && okSheet && okDirect && okAssets && clean)) process.exit(1);
})();
