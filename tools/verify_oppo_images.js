/* Verify the OPPO 服务小程序 image swap: 18 slides in 1..18 order, and every
 * other detail-page effect (WebGL sheet, scroll reveal, DOM-painted Chinese
 * copy, tag/link pills, prev/next ring, SPA transition) left untouched. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ORIGIN = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const SLUG = 'oppo-service';
const EXPECT = 18;
const HOME = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp',
  'csa-service', 'hengxiang-advantage', 'ai-video', 'the-lookback', 'griflan', 'illustration'];
const wait = ms => new Promise(r => setTimeout(r, ms));

const boot = async page => {
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0,
    null, { timeout: 45000 }).catch(() => {});
  await wait(3200);
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
  const perr = [], cerr = [], hyd = [], bad = [], ext = [], imgs = [];
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
    const m = u.match(/\/oppo\/(\d+)(_small|_card)?\.jpg(?:\?|$)/);
    if (m) imgs.push({ n: +m[1], variant: m[2] || 'main', status: r.status() });
  });

  // ---- 1. home strip is unchanged, OPPO cover still the new 1.jpg --------
  await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await boot(page);
  const home = await page.evaluate(() => ({
    order: [...document.querySelectorAll('[data-gl="card"]')].map(e => e.getAttribute('data-id')),
    canvas: document.querySelectorAll('canvas').length,
    siteName: document.querySelector('div.fixed.inset-0.z-40 a.label[href="/"]')?.textContent.trim(),
    firstTitle: document.querySelector('[data-gl="card"] span')?.textContent.trim(),
  }));
  console.log('HOME order matches:', JSON.stringify(home.order) === JSON.stringify(HOME),
              '| cards:', home.order.length, '| canvas:', home.canvas, '| site:', home.siteName);
  await page.screenshot({ path: path.join(OUT, 'oppo_images_home.png') });

  // ---- 2. SPA click into the OPPO detail ----------------------------------
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
  await wait(3000);
  const spa = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    const d = sh?.querySelector('[data-gl="text"]');
    const h1 = sh?.querySelector('h1');
    const cs = d ? getComputedStyle(d) : null;
    const hcs = h1 ? getComputedStyle(h1) : null;
    return {
      url: location.pathname, id: sh?.getAttribute('data-id'),
      title: h1?.textContent.trim(), copy: d?.textContent.trim(),
      fill: cs?.webkitTextFillColor, hFill: hcs?.webkitTextFillColor,
      slides: sh?.querySelectorAll('[data-gl="simple"]').length,
      ratios: [...(sh?.querySelectorAll('[data-gl="simple"]') || [])]
        .map(e => (e.getAttribute('style') || '').match(/aspect-ratio:([^;]+)/)?.[1]),
      tags: [...(sh?.querySelectorAll('[data-gl="pill"]') || [])]
        .map(x => x.textContent.trim()).filter(Boolean),
      pillHref: sh?.querySelector('a[data-gl="pill"]')?.getAttribute('href'),
      // the prev/next ring lives outside the sheet element
      related: [...document.querySelectorAll('[data-gl="related"]')]
        .map(x => x.getAttribute('data-id')),
      canvas: document.querySelectorAll('canvas').length,
      hasCss: !!document.querySelector('link[href^="/local-copy.css"]'),
    };
  });
  console.log('SPA SHEET', JSON.stringify({ ...spa, copy: (spa.copy || '').slice(0, 70) + '...' }));
  await page.screenshot({ path: path.join(OUT, 'oppo_images_detail_top.png') });

  // ---- 3. scroll the sheet open to exercise the later slides -------------
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 520);
    await wait(180);
  }
  await wait(1800);
  await page.screenshot({ path: path.join(OUT, 'oppo_images_detail_scrolled.png') });
  for (let i = 0; i < 22; i++) {
    await page.mouse.move(720, 500);
    await page.mouse.wheel(0, 700);
    await wait(140);
  }
  await wait(1600);
  await page.screenshot({ path: path.join(OUT, 'oppo_images_detail_tail.png') });

  // ---- 4. direct URL load --------------------------------------------------
  await page.goto(ORIGIN + '/projects/' + SLUG, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await boot(page);
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(720, 500); await page.mouse.wheel(0, 560); await wait(190);
  }
  await wait(1500);
  const direct = await page.evaluate(() => {
    const sh = document.querySelector('[data-gl="sheet"]');
    return { url: location.pathname, id: sh?.getAttribute('data-id'),
             slides: sh?.querySelectorAll('[data-gl="simple"]').length,
             title: document.title,
             canvas: document.querySelectorAll('canvas').length };
  });
  console.log('DIRECT', JSON.stringify(direct));
  await page.screenshot({ path: path.join(OUT, 'oppo_images_detail_direct.png') });

  // ---- 5. verdict ---------------------------------------------------------
  const uniq = [...new Set(imgs.map(x => x.n))].sort((a, b) => a - b);
  const badImg = imgs.filter(x => x.status >= 400);
  const norm = spa.ratios.map(s => (s || '').trim().replace(/;$/, '').trim());
  const ratiosOk = JSON.stringify(norm) ===
    JSON.stringify([...Array(17)].map(() => '1600 / 900').concat(['1600 / 1000']));
  const okHome = JSON.stringify(home.order) === JSON.stringify(HOME) &&
                 home.canvas === 1 && home.siteName === 'Fengmei';
  const okSheet = navigated && spa.url === '/projects/' + SLUG &&
    spa.id === SLUG && spa.title === 'OPPO 服务小程序' &&
    spa.slides === EXPECT && ratiosOk && (spa.copy || '').length > 40 &&
    spa.fill === 'rgb(0, 0, 0)' && spa.hFill === 'rgb(0, 0, 0)' &&
    ['UI / UX', 'OPPO', '2026'].every(x => spa.tags.includes(x)) &&
    spa.pillHref === '/oppo-wechat' &&
    JSON.stringify(spa.related) === JSON.stringify(['illustration', 'naivideo']) &&
    spa.canvas === 1 && spa.hasCss;
  const okDirect = direct.id === SLUG && direct.slides === EXPECT && direct.canvas === 1;
  const clean = !perr.length && !cerr.length && !hyd.length && !bad.length && !ext.length;
  console.log('\n=== OPPO IMAGE SWAP VERIFY ===');
  console.log('image slide numbers requested:', JSON.stringify(uniq));
  console.log('image requests:', imgs.length, '| bad:', JSON.stringify(badImg));
  console.log('home / sheet / direct / clean:', okHome, okSheet, okDirect, clean);
  console.log('page errors:', perr.length, 'console errors:', cerr.length,
              'hydration:', hyd.length, 'bad:', bad.length, 'external:', ext.length);
  const result = { home, spa, direct, uniq, badImg, ratiosOk, okHome, okSheet,
                   okDirect, clean, perr, cerr, hyd, bad, ext,
                   imageRequests: imgs.length };
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_oppo_images.json'),
                   JSON.stringify(result, null, 1));
  await browser.close();
  if (!(okHome && okSheet && okDirect && clean)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
