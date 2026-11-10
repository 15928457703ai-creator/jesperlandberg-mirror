/* Inspect the hydrated DOM so the SSR related panels can be calibrated, and
   verify which local images the WebGL home strip actually requests (covers). */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const O = 'http://127.0.0.1:5188';
const PAGES = ['/', '/full', '/newsletter',
  '/projects/the-lookback',
  '/projects/griflan',
  '/projects/oppo-service', '/projects/naivideo', '/projects/erp'];
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required']
  });
  const out = {};
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    const errs = [], imgs = [];
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 220)); });
    pg.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 220)));
    pg.on('request', r => {
      const u = r.url();
      if (/\/(naivideo|erp|oppo)\//.test(u)) imgs.push(u.replace(O, ''));
    });
    await pg.goto(O + p, { waitUntil: 'domcontentloaded' });
    await wait(2400);
    const dom = await pg.evaluate(() => ({
      cards: [...document.querySelectorAll('[data-gl="card"]')].map(x => x.dataset.id),
      related: [...document.querySelectorAll('[data-gl="related"]')].map(x => {
        const a = x.querySelector('a');
        return { id: x.dataset.id, href: a ? a.getAttribute('href') : null,
                 label: a ? a.getAttribute('aria-label') : null };
      }),
      placeholders: document.querySelectorAll('[data-gl="simple"]').length,
      h1: document.querySelector('[data-gl="sheet"] h1')?.textContent || null,
      sheet: document.querySelector('[data-gl="sheet"]')?.dataset.id || null,
      canvas: document.querySelectorAll('canvas').length,
      fullLinks: [...document.querySelectorAll('a[href^="/projects/"]')].map(a => a.getAttribute('href')),
    }));
    out[p] = { errs, imgs: [...new Set(imgs)], dom };
    console.log('\n===', p, '=== errors:', errs.length, errs.slice(0, 2));
    if (p === '/') console.log('  cards:', dom.cards.join(', '), '\n  local images:', [...new Set(imgs)].join(', '));
    if (p === '/full') console.log('  project links:', dom.fullLinks.length, dom.fullLinks.join(', '));
    if (p.startsWith('/projects/')) console.log('  sheet:', dom.sheet, '| h1:', dom.h1,
      '| placeholders:', dom.placeholders, '| canvas:', dom.canvas,
      '\n  related:', JSON.stringify(dom.related));
    await ctx.close();
  }
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'inspect_new_projects.json'), JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
