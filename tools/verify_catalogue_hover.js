const { chromium } = require('playwright-core');
const fs = require('fs');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5189';
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  const errors = [], results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /hydration.*mismatch/i.test(m.text())) errors.push(m.text()); });
    await page.goto(origin + '/full');
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const links = page.locator('main .content-center a');
    for (let i = 0; i < await links.count(); i++) {
      const link = links.nth(i);
      await link.hover();
      await page.waitForTimeout(700);
      const result = await page.evaluate(index => {
        const folio = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
        const el = document.querySelectorAll('main .content-center a')[index];
        const plane = folio.page.find(p => p.el === el);
        const rail = folio.rail;
        return { title: el.textContent, slug: el.getAttribute('href').split('/').pop(),
          drawn: !!plane && plane.material.uniforms.u_alpha.value > .5,
          domHidden: +getComputedStyle(el).opacity === 0,
          field: plane?.material.uniforms.u_avoidP.value || 0,
          preview: !!rail.mesh?.visible, selected: rail.index,
          previewSlug: (rail.itemB || rail.itemA)?.slug, x: rail.x, y: rail.y };
      }, i);
      result.ok = result.drawn && result.domHidden && result.field > .5 && result.preview &&
        result.selected === i && result.previewSlug === result.slug;
      results.push(result);
      console.log(result.ok ? 'PASS' : 'FAIL', result.title, JSON.stringify(result));
      if (result.slug === 'oppo-service') await page.screenshot({ path: 'screenshots/catalogue_hover_chinese.png' });
    }
    await page.mouse.move(100, 100);
    await page.waitForTimeout(1100);
    const resting = await page.evaluate(() => {
      const folio = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      const links = [...document.querySelectorAll('main .content-center a')];
      return { reveal: folio.rail.r, rows: new Set(links.map(a => Math.round(a.parentElement.getBoundingClientRect().top))).size,
        labels: folio.page.filter(p => p.el.matches('.content-center a')).length };
    });
    results.push({ title: 'reset and three-row layout', ok: resting.reveal < .02 && resting.rows === 3 && resting.labels === 10, ...resting });
    await page.screenshot({ path: 'screenshots/full_three_rows.png' });
    await links.filter({ hasText: '华润ERP' }).click();
    await page.waitForURL('**/projects/erp');
    await page.waitForTimeout(1800);
    results.push({ title: 'Chinese title opens matching detail', ok: (await page.locator('[data-gl="sheet"][data-id="erp"] h1').textContent()) === '华润ERP' });
    await page.screenshot({ path: 'screenshots/catalogue_hover_to_detail.png' });
    fs.writeFileSync('raw/verify_catalogue_hover.json', JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
  if (errors.length || results.some(r => !r.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
