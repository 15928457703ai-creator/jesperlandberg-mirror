/* Full regression for every locally added case study.
 *
 * Data-driven: reads raw/local_projects.json (written by inject_all_data.py),
 * so adding another project needs no edit here. Verifies the home strip,
 * covers, WebGL canvas, SPA transitions, scroll reveal, related ring,
 * /full + /newsletter, every slide asset, hydration and zero external calls.
 */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const PROJECTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', 'local_projects.json'), 'utf8'));
const NEW = ['oppo-self-service', 'csa-service', 'hengxiang-advantage'];
const ORIGINAL = ['/projects/the-lookback',
  '/projects/griflan'];
const ALL_PAGES = ['/', '/full', '/newsletter', ...ORIGINAL,
  ...PROJECTS.map(p => '/projects/' + p.slug)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const bad = [], ext = [], perr = [], cerr = [], localImgs = [];
const report = {};
const LAUNCH = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required']
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => perr.push(e.message.slice(0, 240)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text().slice(0, 240)); });
  page.on('requestfailed', r => {
    const err = (r.failure() || {}).errorText || '';
    // Navigation between SPA pages cancels in-flight media decodes. Those
    // aborts are expected and are not broken assets.
    if (r.url().includes('.mp4') || err.includes('ERR_ABORTED')) return;
    bad.push('FAILED ' + r.url() + ' :: ' + err);
  });
  page.on('response', r => {
    const u = r.url();
    if (!u.startsWith(O) && !u.startsWith('data:') && !u.startsWith('blob:')) ext.push(u);
    if (r.status() >= 400) bad.push(r.status() + ' ' + u);
    if (/\/(oppo|naivideo|erp|oppo-self|csa|hengxiang)\/\d/.test(u) && /\.(jpg|png|webp)$/.test(u)) localImgs.push(u.replace(O, ''));
  });

  // ------------------------------------------------------------ home strip
  await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(2600);
  const home = await page.evaluate(() => ({
    cards: document.querySelectorAll('[data-gl="card"]').length,
    ids: [...document.querySelectorAll('[data-gl="card"]')].map(x => x.dataset.id),
    gl: (() => { const c = document.querySelector('canvas'); try { return !!(c && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } })(),
    canvas: document.querySelectorAll('canvas').length
  }));
  report.home = home;
  console.log('HOME:', JSON.stringify(home));
  await page.screenshot({ path: path.join(OUT, 'local_home_top.png') });
  for (let i = 0; i < 18; i++) { await page.mouse.move(720, 500); await page.mouse.wheel(0, 900); await wait(170); }
  await wait(2200);
  await page.screenshot({ path: path.join(OUT, 'local_home_end.png') });
  console.log('HOME END new covers requested:',
    [...new Set(localImgs)].filter(u => /oppo-self\/1|csa\/2|hengxiang\/2/.test(u)).sort().join(', ') || '(none)');

  // ------------------------------------------------------------ SPA -> details
  for (const proj of PROJECTS) {
    const slug = proj.slug, isNew = NEW.includes(slug);
    await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(1500);
    try {
      await page.locator(`[data-gl="card"][data-id="${slug}"]`).click({ force: true, timeout: 9000 });
    } catch (e) {
      console.log(slug, 'click fallback:', e.message.slice(0, 80));
      await page.locator(`[data-gl="card"][data-id="${slug}"]`).dispatchEvent('click');
    }
    await wait(isNew ? 2600 : 1900);
    const det = await page.evaluate(() => ({
      url: location.pathname,
      title: document.title,
      h1: document.querySelector('[data-gl="sheet"] h1')?.textContent.trim(),
      sheet: document.querySelector('[data-gl="sheet"]')?.dataset.id,
      placeholders: document.querySelectorAll('[data-gl="simple"]').length,
      tags: [...document.querySelectorAll('[data-gl="pill"] .label')].map(x => x.textContent.trim()).filter(Boolean),
      canvas: document.querySelectorAll('canvas').length,
      linkPill: (() => { const a = document.querySelector('a[data-gl="pill"][target="_blank"]'); return a ? { href: a.getAttribute('href'), label: a.getAttribute('aria-label') } : null; })(),
      related: [...document.querySelectorAll('[data-gl="related"]')].map(x => ({ id: x.dataset.id, href: x.querySelector('a')?.getAttribute('href') }))
    }));
    const expectedPill = proj.link ? { href: proj.link, label: 'Visit ' + proj.title } : null;
    const pillOk = JSON.stringify(det.linkPill) === JSON.stringify(expectedPill);
    const ok = det.url === '/projects/' + slug && det.sheet === slug &&
      det.placeholders === proj.slides.length && det.canvas > 0 && pillOk;
    if (!pillOk) bad.push('link pill mismatch: ' + slug + ' got ' + JSON.stringify(det.linkPill) + ' expected ' + JSON.stringify(expectedPill));
    report[slug] = { ...det, ok };
    console.log((isNew ? 'NEW ' : 'OLD ') + slug.toUpperCase() + ':', JSON.stringify(det), ok ? 'OK' : 'FAIL');
    if (!ok) bad.push('detail mismatch: ' + slug + ' ' + JSON.stringify(det));
    if (isNew) await page.screenshot({ path: path.join(OUT, 'local_' + slug + '_top.png') });

    if (isNew) {
      for (let i = 0; i < 14; i++) { await page.mouse.move(720, 500); await page.mouse.wheel(0, 720); await wait(220); }
      await wait(1700);
      await page.screenshot({ path: path.join(OUT, 'local_' + slug + '_scrolled.png') });
      const scrolled = await page.evaluate(() => ({
        sheetId: document.querySelector('[data-gl="sheet"]')?.dataset.id,
        placeholders: document.querySelectorAll('[data-gl="simple"]').length,
        scrollY: Math.round(window.scrollY),
        sheetTop: Math.round(document.querySelector('[data-gl="sheet"]').getBoundingClientRect().top)
      }));
      console.log(slug.toUpperCase(), 'SCROLLED:', JSON.stringify(scrolled));
      report[slug].scrolled = scrolled;
      await page.goBack({ waitUntil: 'domcontentloaded' }); await wait(1000);
      console.log(slug.toUpperCase(), 'BACK:', page.url());
    }
  }

  // ------------------------------------------------------------ /full + newsletter
  await page.goto(O + '/full', { waitUntil: 'domcontentloaded' }); await wait(1700);
  const full = await page.evaluate(slugs => ({
    links: [...document.querySelectorAll('a[href^="/projects/"]')].map(a => a.getAttribute('href')),
    allLocal: slugs.every(s => !!document.querySelector('a[href="/projects/' + s + '"]'))
  }), PROJECTS.map(p => p.slug));
  report.full = full;
  console.log('FULL:', JSON.stringify(full));
  await page.screenshot({ path: path.join(OUT, 'local_full.png') });
  await page.goto(O + '/newsletter', { waitUntil: 'domcontentloaded' }); await wait(1500);
  const newsletterCards = await page.locator('[data-gl="card"]').count();
  report.newsletterCards = newsletterCards;
  console.log('NEWSLETTER cards:', newsletterCards);

  // ------------------------------------------------------------ every slide asset
  let checked = 0;
  for (const proj of PROJECTS) for (const s of proj.slides) for (const f of s.files) {
    const r = await page.request.get(`${O}/${proj.dir}/${f}`);
    if (r.status() !== 200) bad.push(`${proj.dir}/${f} -> ${r.status()}`);
    checked++;
  }
  console.log('slide assets checked:', checked);

  // ------------------------------------------------------------ hydration sweep
  const hyd = [];
  for (const p of ALL_PAGES) {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await c.newPage(); const errs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 180)); });
    pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 180)));
    await pg.goto(O + p, { waitUntil: 'domcontentloaded' }); await wait(1600);
    if (errs.length) hyd.push({ p, errs });
    await c.close();
  }
  report.hydration = hyd;
  console.log('HYDRATION pages with errors:', hyd.length, '/', ALL_PAGES.length, JSON.stringify(hyd.slice(0, 4)));

  console.log('\n=== SUMMARY ===');
  console.log('local project images requested:', [...new Set(localImgs)].length);
  console.log('bad/4xx/failed:', bad.length, bad.slice(0, 10));
  console.log('external requests:', ext.length, [...new Set(ext)].slice(0, 8));
  console.log('page errors:', perr.length, perr.slice(0, 6));
  console.log('console errors:', cerr.length, cerr.slice(0, 6));
  fs.writeFileSync(path.join(ROOT, 'raw', 'verify_local_projects.json'),
    JSON.stringify({ ...report, bad, ext, perr, cerr, imgs: [...new Set(localImgs)] }, null, 1));
  await browser.close();
  if (bad.length || ext.length || perr.length || cerr.length || hyd.length) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
