/* Every detail page must show its left-hand description.
   A fresh browser per case study avoids SwiftShader context exhaustion when
   many WebGL pages are opened back-to-back in one process. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const O = 'http://127.0.0.1:5188';
const OUT = path.join(__dirname, '..', 'screenshots');
const LOCAL_PROJECTS = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'raw', 'local_projects.json'), 'utf8'));
const SLUGS = ['the-lookback', 'griflan',
  ...LOCAL_PROJECTS.map(p => p.slug)];
const LOCAL_SLUGS = LOCAL_PROJECTS.map(p => p.slug);
const wait = ms => new Promise(r => setTimeout(r, ms));
const LAUNCH = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required']
};

(async () => {
  const report = [];
  for (const s of SLUGS) {
    const browser = await chromium.launch(LAUNCH);
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
    await page.goto(O + '/', { waitUntil: 'domcontentloaded' });
    const card = page.locator(`[data-gl="card"][data-id="${s}"]`);
    const ready = slug => {
      const sh = document.querySelector('[data-gl="sheet"]');
      const d = sh?.querySelector('[data-gl="text"]');
      return location.pathname === '/projects/' + slug &&
        !!d && d.textContent.trim().length > 0;
    };
    // SwiftShader startup can take much longer than a fixed sleep under load.
    // Try a real click first, then a dispatched DOM click (same fallback the
    // full regression uses) when the WebGL hit-test drops the pointer event.
    let navigated = false;
    for (let attempt = 0; attempt < 3 && !navigated; attempt++) {
      try {
        await card.waitFor({ state: 'attached', timeout: 30000 });
        if (attempt === 0) await card.click({ force: true, timeout: 12000 });
        else await card.dispatchEvent('click');
        await page.waitForFunction(ready, s, { timeout: 14000 });
        navigated = true;
      } catch (e) {
        if (attempt === 2) errs.push('nav: ' + e.message.slice(0, 90));
      }
    }
    // The white sheet slides in after the SPA transition. Give the reveal
    // animation the same 3 s the pill screenshot uses before taking the
    // evidence shot, otherwise the clip is just the dark intro frame even
    // though the copy itself is already correct.
    await wait(3000);
    const info = await page.evaluate(() => {
      const sh = document.querySelector('[data-gl="sheet"]');
      const h1 = sh?.querySelector('h1');
      const d = sh?.querySelector('[data-gl="text"]');
      const cs = d ? getComputedStyle(d) : null;
      return {
        url: location.pathname,
        title: h1?.textContent.trim(),
        copy: d?.textContent.trim(),
        fill: cs?.webkitTextFillColor,
        opacity: cs?.opacity,
        hasCss: !!document.querySelector('link[href^="/local-copy.css"]')
      };
    });
    const local = LOCAL_SLUGS.includes(s);
    const domVisible = info.fill === 'rgb(0, 0, 0)' && info.opacity === '1';
    const ok = !!info.copy && errs.length === 0 && (!local || (domVisible && info.hasCss));
    report.push({ slug: s, copyLength: (info.copy || '').length, fill: info.fill,
      opacity: info.opacity, hasCss: info.hasCss, errs, ok });
    console.log(s.padEnd(20), '| copy:', (info.copy || '(none)').slice(0, 44).padEnd(46),
      '| fill:', String(info.fill).padEnd(18), '| opacity:', info.opacity,
      '|', ok ? 'OK' : 'FAIL');
    await page.screenshot({ path: path.join(OUT, 'copy_' + s + '.png'),
      clip: { x: 0, y: 0, width: 620, height: 400 } });
    await browser.close();
  }
  const failed = report.filter(r => !r.ok);
  console.log('\nleft-hand copy present:', report.length - failed.length, '/', report.length,
    '| failures:', failed.length, '| console errors:', report.reduce((a, r) => a + r.errs.length, 0));
  fs.writeFileSync(path.join(__dirname, '..', 'raw', 'verify_detail_copy.json'), JSON.stringify(report, null, 1));
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
