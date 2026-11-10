const { chromium } = require('playwright-core');
const fs = require('fs');
const ORIGIN = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5189';
const options = { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] };
(async () => {
  const browser = await chromium.launch(options);
  const errors = [], checks = [];
  const check = (name, ok) => { checks.push({ name, ok: !!ok }); console.log(ok ? 'PASS' : 'FAIL', name); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' || /hydration.*mismatch/i.test(m.text())) errors.push(m.text()); });
    await page.goto(ORIGIN);
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]') &&
      document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio.cards.some(c => c.landed), null, { timeout: 60000 });
    await page.waitForTimeout(1800);
    const read = () => page.evaluate(() => {
      const folio = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      return { enabled: folio.galleryMotion.enabled, pointer: { ...folio.galleryMotion.pointer },
        cards: folio.cards.filter(c => c.el.isConnected).map(c => ({ slug: c.slug, pos: c.mesh.position.toArray(), quat: c.mesh.quaternion.toArray() })) };
    });
    await page.mouse.move(720, 450);
    await page.waitForTimeout(800);
    const before = await read();
    await page.mouse.move(1050, 300, { steps: 12 });
    await page.waitForTimeout(900);
    const after = await read();
    check('desktop gallery active with ten projects', before.enabled && before.cards.length === 10);
    check('pointer changes rendered card pose', after.cards.some((c, i) => Math.abs(c.pos[1] - before.cards[i].pos[1]) > .001));
    check('all card poses stay finite', after.cards.every(c => c.pos.concat(c.quat).every(Number.isFinite)));
    await page.screenshot({ path: 'screenshots/gallery_motion_home.png' });
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'screenshots/gallery_motion_scroll.png' });
    await page.evaluate(() => {
      const card = [...document.querySelectorAll('[data-gl="card"]')].find(e => {
        const r = e._vrect || e.getBoundingClientRect(); return r.left > 0 && r.left < innerWidth * .7;
      });
      if (!card) throw new Error('No visible card');
      (card.querySelector('a') || card).click();
    });
    await page.waitForFunction(() => location.pathname.startsWith('/projects/'));
    await page.waitForTimeout(1800);
    check('card opens a single detail sheet', await page.locator('[data-gl="sheet"]').count() === 1);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1800);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => location.pathname === '/');
    await page.waitForTimeout(1800);
    check('gallery resumes after detail round trip', (await read()).enabled && await page.locator('[data-gl="sheet"]').count() === 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check('reduced motion disables gallery additions', !(await read()).enabled);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1100);
    check('mobile keeps the native vertical layout', !(await read()).enabled);
    await page.screenshot({ path: 'screenshots/gallery_motion_mobile.png' });
    check('no page or hydration errors', errors.length === 0);
    fs.writeFileSync('raw/verify_gallery_motion.json', JSON.stringify({ checks, errors, before, after }, null, 2));
  } finally { await browser.close(); }
  if (checks.some(c => !c.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
