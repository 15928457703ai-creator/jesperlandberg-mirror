const { chromium } = require('playwright-core');
const fs = require('fs');
const ORIGIN = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5189';
const slugs = ['oppo-service', 'naivideo', 'oppo-self-service', 'erp', 'csa-service',
  'hengxiang-advantage', 'ai-video', 'the-lookback', 'griflan', 'illustration'];
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  const results = [], errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(ORIGIN + '/projects/' + slugs[0]);
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]') &&
      !!document.querySelector('#__nuxt').__vue_app__?.config.globalProperties.$nuxt?.$folio.content.length, null, { timeout: 60000 });
    for (const slug of slugs) {
      if (!page.url().endsWith('/' + slug)) await page.evaluate(s =>
        document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$router.push('/projects/' + s), slug);
      await page.waitForTimeout(1400);
      const media = await page.evaluate(s => {
        const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
        return f.content.filter(c => c.el.isConnected && c.el.closest('[data-id]')?.dataset.id === s).map(c => {
          const r = c.el._vrect || c.el.getBoundingClientRect();
          return { radius: c.mesh.material.uniforms.u_corner.value * r.height,
            css: getComputedStyle(c.el).borderTopLeftRadius, video: !!c.mesh.userData.videoSrc };
        });
      }, slug);
      const ok = media.length > 0 && media.every(m => Math.abs(m.radius - 28) < .1 && m.css === '28px');
      console.log(ok ? 'PASS' : 'FAIL', slug, media.length, 'media with 28px corners');
      results.push({ slug, ok, media });
    }
    await page.screenshot({ path: 'screenshots/illustration_rounded_media.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1000);
    const mobile = await page.locator('[data-gl="sheet"] [data-gl="simple"]').evaluateAll(els =>
      els.every(el => getComputedStyle(el).borderTopLeftRadius === '28px'));
    results.push({ slug: 'mobile', ok: mobile });
    fs.writeFileSync('raw/verify_media_corners.json', JSON.stringify({ results, errors }, null, 2));
  } finally { await browser.close(); }
  if (errors.length || results.some(r => !r.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
