const fs = require('fs');
const { chromium } = require('playwright-core');
const origin = process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5193';
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'] });
  const checks = [], errors = [], samples = [];
  const check = (name, ok, data) => { checks.push({ name, ok: !!ok, data }); console.log(ok ? 'PASS' : 'FAIL', name, data || ''); };
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin + '/projects/illustration');
    await page.waitForFunction(() => !document.querySelector('[data-gl="bar"]'), null, { timeout: 60000 });
    await page.waitForTimeout(2200);
    const read = () => page.evaluate(() => {
      const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      return f.content.filter(c => c.el.isConnected && c.el.closest('[data-gl="sheet"]')?.dataset.id === 'illustration').map(c => {
        const r = c.el._vrect || c.el.getBoundingClientRect(), b = c.el.closest('[data-gl="sheet"]').getBoundingClientRect();
        const video = f.videos.get(c.mesh.userData.videoSrc)?.el;
        return { src: c.mesh.userData.videoSrc, top: r.top, bottom: r.bottom ?? r.top + r.height,
          left: r.left, width: r.width, height: r.height, panelTop: b.top, panelBottom: b.bottom,
          visible: Math.min(r.bottom ?? r.top + r.height, b.bottom, innerHeight) - Math.max(r.top, b.top, 0),
          paused: video?.paused, time: video?.currentTime, frames: video?.getVideoPlaybackQuality().totalVideoFrames,
          pos: c.mesh.position.toArray(), quat: c.mesh.quaternion.toArray(), radius: c.mesh.material.uniforms.u_corner.value * r.height };
      });
    });
    const initial = await read(); samples.push(initial);
    check('new motion collection name and introduction', await page.locator('[data-gl="sheet"] h1').textContent() === '动效设计精选' &&
      (await page.locator('[data-gl="sheet"] div[data-gl="text"]').first().textContent()).includes('节奏设计'));
    check('five video works with 28px corners', initial.length === 5 && initial.every(v => Math.abs(v.radius - 28) < .1));
    const offscreen = initial.filter(v => v.bottom <= v.panelTop || v.top >= v.panelBottom);
    check('offscreen videos do not start early', offscreen.length > 0 && offscreen.every(v => v.paused && v.time < .1), offscreen.map(v => ({ src: v.src, time: v.time })));
    const target = initial.find(v => v.visible >= v.height * .8 && v.top + v.height * .5 < 800);
    await page.mouse.move(target.left + target.width * .85, target.top + target.height * .3);
    await page.waitForTimeout(650);
    const followed = (await read()).find(v => v.src === target.src);
    check('visible video subtly follows the pointer', Math.abs(followed.pos[0] - target.pos[0]) > .001 && Math.abs(followed.quat[1]) > .001);
    await page.mouse.move(20, 20); await page.waitForTimeout(900);
    await page.waitForFunction(src => {
      const f = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$folio;
      return f.content.filter(c => c.mesh.userData.videoSrc === src && c.el.isConnected).every(c => Math.abs(c.mesh.quaternion.y) < .001);
    }, target.src, { timeout: 4000 });
    check('pointer motion settles when leaving', Math.abs((await read()).find(v => v.src === target.src).quat[1]) < .001);
    const played = new Set(initial.filter(v => !v.paused).map(v => v.src));
    for (let step = 0; step < 12; step++) {
      await page.mouse.move(1050, 500); await page.mouse.wheel(0, 280); await page.waitForTimeout(420);
      const state = await read(); samples.push(state);
      for (const v of state) if (!v.paused && v.time > 0) played.add(v.src);
      const hidden = state.filter(v => v.bottom <= v.panelTop || v.top >= v.panelBottom);
      check('offscreen clips pause after scroll ' + step, hidden.every(v => v.paused));
    }
    check('every video plays when scrolled into view', played.size === 5, [...played]);
    await page.screenshot({ path: 'screenshots/motion_collection_scrolled.png' });
    await page.goto(origin + '/full'); await page.waitForTimeout(2000);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(600);
      const rows = await page.locator('main .content-center a').evaluateAll(els => new Set(els.map(e => Math.round(e.parentElement.getBoundingClientRect().top))).size);
      check('catalogue stays at three rows at ' + width, rows === 3, rows);
    }
    check('no runtime errors', !errors.length, errors);
    fs.writeFileSync('raw/verify_motion_collection.json', JSON.stringify({ checks, errors, samples }, null, 2));
  } finally { await browser.close(); }
  if (errors.length || checks.some(c => !c.ok)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
