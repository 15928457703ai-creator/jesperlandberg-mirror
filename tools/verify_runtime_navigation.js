const fs = require('fs');
const { chromium } = require('playwright-core');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5190';
const launch = { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] };
(async () => {
  const browser = await chromium.launch(launch);
  const errors = [], checks = [], scripts = [];
  const check = (name, ok, data) => { checks.push({ name, ok: !!ok, data }); console.log(ok ? 'PASS' : 'FAIL', name, data || ''); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (/\.js(?:\?|$)/.test(r.url())) scripts.push({ url: r.url(), cache: r.headers()['cache-control'], status: r.status() }); });
    const ready = async () => {
      await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
      await page.waitForTimeout(1400);
    };
    const hud = () => page.evaluate(() => {
      const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      return { alpha: f.hudA.v, labels: f.hud.filter(h => h.el.isConnected).map(h => ({ text: h.el.textContent.trim(), alpha: h.material.uniforms.u_alpha.value })) };
    });
    await page.goto(origin + '/projects/illustration'); await ready();
    check('direct detail has working close control', await page.locator('a[aria-label="Close project"] span.visible').isVisible());
    await page.keyboard.press('ArrowRight');
    await page.waitForURL('**/projects/oppo-service'); await page.waitForTimeout(1600);
    check('project switch completes', await page.locator('[data-gl="sheet"][data-id="oppo-service"]').count() === 1);
    await page.locator('[data-gl="sheet"][data-id="oppo-service"] a[aria-label="Close project"] span.visible').click();
    await page.waitForURL(origin + '/'); await page.waitForTimeout(1800);
    const afterClose = await hud();
    check('closing detail restores corner controls', afterClose.alpha > .9 && afterClose.labels.length >= 4 && afterClose.labels.every(l => l.alpha > .1), afterClose);
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.waitForTimeout(1300);
    check('top-right Profile opens', await page.getByRole('button', { name: 'Close', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.waitForTimeout(1300);
    await page.getByRole('button', { name: 'Newsletter', exact: true }).click(); await page.waitForTimeout(1300);
    check('bottom-right Newsletter opens', await page.getByRole('textbox', { name: /email/i }).count() > 0 || await page.locator('form input[type="email"]').isVisible());
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.waitForTimeout(1300);
    await page.getByRole('link', { name: 'Full', exact: true }).click(); await page.waitForURL('**/full'); await page.waitForTimeout(1600);
    await page.locator('main .content-center a[href="/projects/illustration"]').hover(); await page.waitForTimeout(800);
    check('bottom-left Full and hover preview work', await page.evaluate(() => {
      const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      return f.rail.mesh.visible && f.rail.r > .8 && (f.rail.itemB || f.rail.itemA).slug === 'illustration';
    }));
    await page.screenshot({ path: 'screenshots/runtime_navigation_hover.png' });
    await page.locator('div.fixed.inset-0.z-40 a.label[href="/"]').click();
    await page.waitForURL(origin + '/'); await page.waitForTimeout(1800);
    check('top-left name returns home with all corners', (await hud()).alpha > .9);
    await page.screenshot({ path: 'screenshots/runtime_navigation_home.png' });
    check('runtime modules use a versioned URL', scripts.filter(s => s.url.includes('/_nuxt/') && !s.url.includes('/builds/')).every(s => /\/_nuxt\/preview-[a-f0-9]{12}\//.test(s.url)));
    check('all scripts bypass stale cache', scripts.every(s => s.cache === 'no-store' && s.status === 200));
    check('local extension has a revision', scripts.some(s => /local-motion\.js\?v=[a-f0-9]{12}/.test(s.url)));
    check('no runtime errors', errors.length === 0, errors);
    fs.writeFileSync('raw/verify_runtime_navigation.json', JSON.stringify({ checks, errors, scripts }, null, 2));
  } finally { await browser.close(); }
  if (errors.length || checks.some(c => !c.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
