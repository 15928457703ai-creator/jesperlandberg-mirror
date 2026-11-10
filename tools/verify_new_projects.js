/* Final regression for Naivideo + ERP (and the earlier OPPO project).
   Verifies covers, WebGL interaction, SPA transitions, scroll reveal,
   all slide assets, /full + /newsletter, hydration and zero external calls. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const ALL_PAGES = ['/', '/full', '/newsletter',
  '/projects/the-lookback',
  '/projects/griflan',
  '/projects/oppo-service', '/projects/naivideo', '/projects/erp',
  '/projects/ai-video'];
const bad = [], ext = [], perr = [], cerr = [], localImgs = [];
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
  page.on('pageerror', e => perr.push(e.message.slice(0, 240)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 240)); });
  page.on('requestfailed', r => { if (!r.url().includes('.mp4')) bad.push('FAILED ' + r.url() + ' :: ' + (r.failure() || {}).errorText); });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(O) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
    if (/\/(naivideo|erp|oppo)\/\d/.test(u) && /\.(jpg|png|webp)$/.test(u)) localImgs.push(u.replace(O, ''));
  });

  // ------------------------------------------------------------ home strip
  await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(2600);
  let home = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-gl="card"]').length,
    ids: [...document.querySelectorAll('[data-gl="card"]')].map(x => x.dataset.id),
    gl: !!document.querySelector('canvas')?.getContext('webgl2') || !!document.querySelector('canvas')?.getContext('webgl'),
    canvas: document.querySelectorAll('canvas').length
  }));
  console.log('HOME:', JSON.stringify(home));
  await page.screenshot({ path: path.join(OUT, 'new_home_top.png') });

  // wheel through the whole strip so the two new cards enter the viewport
  for (let i = 0; i < 14; i++) { await page.mouse.move(720, 500); await page.mouse.wheel(0, 900); await wait(180); }
  await wait(2200);
  await page.screenshot({ path: path.join(OUT, 'new_home_end.png') });
  console.log('HOME END new-cover requests:', [...new Set(localImgs)].filter(u => /naivideo|erp/.test(u)).join(', ') || '(none)');

  // ------------------------------------------------------------ SPA -> details
  for (const [slug, slides] of [['naivideo', 8], ['erp', 11]]) {
    await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(1600);
    try {
      await page.locator(`[data-gl="card"][data-id="${slug}"]`).click({ force: true, timeout: 9000 });
    } catch (e) {
      console.log(slug, 'click fallback:', e.message.slice(0, 90));
      await page.locator(`[data-gl="card"][data-id="${slug}"]`).dispatchEvent('click');
    }
    await wait(2500);
    console.log(slug.toUpperCase(), 'SPA URL:', page.url());
    const det = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('[data-gl="sheet"] h1')?.textContent,
      sheet: document.querySelector('[data-gl="sheet"]')?.dataset.id,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length,
      tags: [...document.querySelectorAll('[data-gl="pill"] .label')].map(x => x.textContent.trim()).filter(Boolean),
      canvas: document.querySelectorAll('canvas').length,
      related: [...document.querySelectorAll('[data-gl="related"]')].map(x => ({ id: x.dataset.id, href: x.querySelector('a')?.getAttribute('href') }))
    }));
    console.log(slug.toUpperCase(), 'DETAIL:', JSON.stringify(det));
    await page.screenshot({ path: path.join(OUT, `new_${slug}_top.png`) });

    for (let i = 0; i < 12; i++) { await page.mouse.move(720, 500); await page.mouse.wheel(0, 720); await wait(240); }
    await wait(1600);
    await page.screenshot({ path: path.join(OUT, `new_${slug}_scrolled.png`) });
    const scrolled = await page.evaluate(() => ({
      sheetId: document.querySelector('[data-gl="sheet"]')?.dataset.id,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length,
      scrollY: Math.round(window.scrollY)
    }));
    console.log(slug.toUpperCase(), 'SCROLLED:', JSON.stringify(scrolled));

    await page.goBack({ waitUntil: 'domcontentloaded' }); await wait(1200);
    console.log(slug.toUpperCase(), 'BACK:', page.url());
  }

  // ------------------------------------------------------------ /full + newsletter
  await page.goto(O + '/full', { waitUntil: 'domcontentloaded' }); await wait(1700);
  const full = await page.evaluate(() => ({
    links: [...document.querySelectorAll('a[href^="/projects/"]')].map(a => a.getAttribute('href')),
    naivideo: !!document.querySelector('a[href="/projects/naivideo"]'),
    erp: !!document.querySelector('a[href="/projects/erp"]')
  }));
  console.log('FULL:', JSON.stringify(full));
  await page.screenshot({ path: path.join(OUT, 'new_full.png') });
  await page.goto(O + '/newsletter', { waitUntil: 'domcontentloaded' }); await wait(1500);
  console.log('NEWSLETTER cards:', await page.locator('[data-gl="card"]').count());

  // ------------------------------------------------------------ every slide
  for (const [dir, nums] of [['naivideo', [2, 1, 3, 4, 5, 6, 7, 8]], ['erp', [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11]]]) {
    for (const n of nums) for (const suffix of ['', '_small', '_card']) {
      const r = await page.request.get(`${O}/${dir}/${n}${suffix}.jpg`);
      if (r.status() !== 200) bad.push(`${dir}/${n}${suffix}.jpg -> ${r.status()}`);
    }
  }
  console.log('slide assets checked: 8*3 + 11*3 = 57');

  // ------------------------------------------------------------ hydration sweep
  const hyd = [];
  for (const p of ALL_PAGES) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await c.newPage(); const errs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 180)); });
    pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 180)));
    await pg.goto(O + p, { waitUntil: 'domcontentloaded' }); await wait(1700);
    if (errs.length) hyd.push({ p, errs });
    await c.close();
  }
  console.log('HYDRATION pages with errors:', hyd.length, JSON.stringify(hyd.slice(0, 4)));

  console.log('\n=== SUMMARY ===');
  console.log('local project images requested:', [...new Set(localImgs)].length,
    '\n  ', [...new Set(localImgs)].sort().join('\n   '));
  console.log('bad/4xx/failed:', bad.length, bad.slice(0, 10));
  console.log('external requests:', ext.length, [...new Set(ext)].slice(0, 8));
  console.log('page errors:', perr.length, perr.slice(0, 6));
  console.log('console errors:', cerr.length, cerr.slice(0, 6));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_new_projects.json'),
    JSON.stringify({ home, full, bad, ext, perr, cerr, hyd, imgs: [...new Set(localImgs)] }, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
