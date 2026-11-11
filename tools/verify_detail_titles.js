const fs = require('fs');
const { chromium } = require('playwright-core');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5194';
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  const errors = [], results = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    const inspect = async label => {
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => {
        const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
        const p = f.titleHero?.plane || f.titleFly?.plane;
        const h = document.querySelector('[data-gl="sheet"][data-lc-state="in"] h1') || document.querySelector('[data-gl="sheet"] h1');
        let ink = 0;
        if (p?.canvas) {
          const data = p.ctx2d.getImageData(0, 0, p.canvas.width, p.canvas.height).data;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 30) ink++;
        } else ink = p?.mesh.geometry.attributes.position.count || 0;
        return { title: h?.textContent, nativeTitle: p?.el.textContent, ink,
          alpha: p?.material.uniforms.u_alpha.value, spans: h?.querySelectorAll('.lc-c').length,
          position: p?.mesh.position.toArray(), canvas: !!p?.canvas };
      });
      const ok = state.title === state.nativeTitle && (state.canvas ? state.ink > 100 : state.ink > 0) && state.alpha > .5 && state.spans === 0;
      results.push({ label, ok, ...state }); console.log(ok ? 'PASS' : 'FAIL', label, state);
      return state;
    };
    await page.goto(origin + '/projects/illustration');
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
    await inspect('direct motion collection');
    await page.screenshot({ path: 'screenshots/detail_title_direct_fixed.png' });
    await page.goto(origin + '/');
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => document.querySelector('[data-gl="card"][data-id="illustration"]').click());
    await page.waitForURL('**/projects/illustration');
    await inspect('home card title flight');
    await page.screenshot({ path: 'screenshots/detail_title_home_fixed.png' });
    await page.goto(origin + '/full');
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.locator('main .content-center a[href="/projects/illustration"]').click();
    await page.waitForURL('**/projects/illustration');
    await inspect('catalogue title flight');
    await page.screenshot({ path: 'screenshots/detail_title_catalogue_fixed.png' });
    await page.keyboard.press('ArrowLeft'); await page.waitForURL('**/projects/griflan');
    await inspect('switch to Latin title');
    await page.keyboard.press('ArrowRight'); await page.waitForURL('**/projects/illustration');
    await inspect('switch back to motion title');
    for (const slug of ['oppo-service', 'oppo-self-service', 'csa-service', 'hengxiang-advantage', 'ai-video', 'erp']) {
      await page.evaluate(slug => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$router.push('/projects/' + slug), slug);
      await page.waitForURL('**/projects/' + slug);
      await inspect('Chinese title ' + slug);
    }
    fs.writeFileSync('raw/verify_detail_titles.json', JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
  if (errors.length || results.some(r => !r.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
