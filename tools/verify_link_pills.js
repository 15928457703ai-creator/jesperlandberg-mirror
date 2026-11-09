/* Visual + behavioural check for the round external-link pills.
 * Confirms the WebGL-drawn black circle/arrow appears on the three projects
 * that have a link, that the two external URLs and the local WeChat hint page
 * are wired correctly, and that the CSS tooltip shows the mini-program hint.
 */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const PROJECTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'raw', 'local_projects.json'), 'utf8'));
const LINKED = PROJECTS.filter(p => p.link);
const wait = ms => new Promise(r => setTimeout(r, ms));
const LAUNCH = {
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
    '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage',
    '--autoplay-policy=no-user-gesture-required']
};

(async () => {
  const browser = await chromium.launch(LAUNCH);
  const report = [];
  for (const proj of PROJECTS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
    page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 160)));
    // Direct URL loads start on the original site's dark intro frame; the
    // white sheet only reveals after scrolling. Enter via the SPA card click
    // so the pills are captured in their normal expanded state.
    await page.goto(O + '/', { waitUntil: 'domcontentloaded' }); await wait(1700);
    try {
      await page.locator(`[data-gl="card"][data-id="${proj.slug}"]`).click({ force: true, timeout: 9000 });
    } catch (e) { errs.push('click: ' + e.message.slice(0, 90)); }
    await wait(3000);

    const info = await page.evaluate(() => {
      const a = document.querySelector('a[data-gl="pill"][target="_blank"]');
      if (!a) return { pill: null };
      const r = a.getBoundingClientRect();
      const span = a.querySelector('span.visible');
      const cs = span ? getComputedStyle(span) : null;
      return {
        pill: { href: a.getAttribute('href'), label: a.getAttribute('aria-label'),
          target: a.target, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          bg: cs ? cs.backgroundColor : null },
        sameRow: [...document.querySelectorAll('[data-gl="pill"]')].length
      };
    });
    const expected = proj.link ? { href: proj.link, label: 'Visit ' + proj.title } : null;
    const ok = errs.length === 0 && (expected ? (info.pill && info.pill.href === expected.href && info.pill.label === expected.label) : info.pill === null);
    report.push({ slug: proj.slug, ...info, errs, ok });
    console.log(proj.slug.padEnd(20), JSON.stringify(info.pill || 'no pill'),
      '| pills in row:', info.sameRow, '|', ok ? 'OK' : 'FAIL');
    if (proj.link) await page.screenshot({ path: path.join(OUT, 'link_' + proj.slug + '.png'),
      clip: { x: 0, y: 0, width: 620, height: 400 } });

    // WeChat mini program: hover the circle to reveal the instruction.
    if (proj.hint) {
      const r = info.pill.rect;
      await page.mouse.move(r[0] + r[2] / 2, r[1] + r[3] / 2, { steps: 12 });
      await wait(800);
      const tip = await page.evaluate(() => {
        const a = document.querySelector('a[data-gl="pill"][href="/oppo-wechat"]');
        if (!a) return null;
        const s = a.querySelector('span.visible');
        const c = getComputedStyle(s, '::after');
        const hit = document.elementFromPoint(...(() => { const b = a.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })());
        return { content: c.content, opacity: c.opacity, visibility: c.visibility,
          hit: hit ? hit.tagName + '.' + (hit.className || '').toString().slice(0, 40) : null };
      });
      console.log('  TOOLTIP:', JSON.stringify(tip));
      await page.screenshot({ path: path.join(OUT, 'link_wechat_hint.png'),
        clip: { x: 0, y: 0, width: 620, height: 460 } });
      report[report.length - 1].tooltip = tip;

      // clicking opens the local hint page in a new tab (never an outside site)
      const popupPromise = page.waitForEvent('popup', { timeout: 8000 }).catch(() => null);
      await page.mouse.click(r[0] + r[2] / 2, r[1] + r[3] / 2);
      const popup = await popupPromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded');
        console.log('  HINT PAGE:', popup.url(), '|', (await popup.locator('h1').textContent()).trim());
        report[report.length - 1].hintPage = popup.url();
        await popup.close();
      } else {
        console.log('  HINT PAGE: no popup');
      }
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(ROOT, 'raw', 'verify_link_pills.json'), JSON.stringify(report, null, 1));
  console.log('\nlink pills verified:', report.filter(r => r.ok).length, '/', report.length);
  await browser.close();
  if (report.some(r => !r.ok)) process.exitCode = 1;
})().catch(e => { console.error('FATAL', e); process.exit(1); });
