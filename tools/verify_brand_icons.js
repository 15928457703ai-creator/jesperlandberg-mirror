/* Verify the personal-avatar brand swap.
 *
 * The stock site ships one face.png rendered at 17 pixel widths (favicons,
 * Apple touch icons, Windows tiles) plus a 1200x630 share card, all served
 * from assets/ through the local mirror's media map.  This script checks that
 * every declared icon URL still resolves to a correctly sized image after the
 * artwork swap, that all 19 prerendered pages carry the same declarations,
 * and that the share card is a real WebP at 1200x630.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const O = 'http://127.0.0.1:5188';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const REPORT = path.join(ROOT, 'raw', 'verify_brand_icons.json');

// w=310 is declared by the stock markup but the CDN always returned 150px.
const EXPECT = [
  ['16', 16], ['32', 32], ['57', 57], ['60', 60], ['70', 70], ['72', 72],
  ['76', 76], ['96', 96], ['114', 114], ['120', 120], ['144', 144],
  ['150', 150], ['152', 152], ['180', 180], ['192', 192], ['310', 310],
];

const results = [];
const check = (name, ok, note) => {
  results.push({ name, ok: !!ok, note: note || '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (note ? '  [' + note + ']' : ''));
};

(async () => {
  // 19 public pages: home, full index, newsletter + the 16 case studies.
  // The standalone motion stages (erp-fx, naivideo-*, oppo-*) never declared
  // a favicon in the stock site, so they are out of scope here.
  const pages = ['site/index.html', 'site/full.html', 'site/newsletter.html']
    .concat(fs.readdirSync(path.join(ROOT, 'site', 'projects'))
      .filter(f => f.endsWith('.html')).map(f => 'site/projects/' + f));
  const declared = pages.filter(f => /1786371616-face\.png/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check('all 19 public pages declare the avatar icons',
    declared.length === pages.length, declared.length + '/' + pages.length);

  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl',
      '--ignore-gpu-blocklist', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const bad = [], ext = [], perr = [], cerr = [];
  page.on('response', r => { if (r.status() >= 400) bad.push(r.url() + ':' + r.status()); });
  // media elements abort in-flight range requests while scrolling; those are
  // not failures. Keep blob:/data: out of the external-request audit.
  page.on('requestfailed', r => {
    const why = (r.failure() && r.failure().errorText) || '';
    if (!/ERR_ABORTED/.test(why)) bad.push(r.url() + ':' + why);
  });
  page.on('request', r => {
    const u = r.url();
    if (/^(blob|data):/.test(u) || u.startsWith(O)) return;
    ext.push(u);
  });
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  await page.goto(O + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.querySelectorAll('link[rel="icon"]').length > 0, null, { timeout: 30000 }).catch(() => {});

  const links = await page.evaluate(() => [...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"], meta[name^="msapplication-"]')]
    .map(el => ({ rel: el.rel || el.name, sizes: el.getAttribute('sizes') || '', href: el.getAttribute('href') || el.content })));
  check('head declares 17 icon / tile entries', links.length === 17, String(links.length));

  const probes = await page.evaluate(async (expect) => {
    const out = [];
    for (const [w, px] of expect) {
      const url = '/223669/1786371616-face.png?auto=format&h=' + w + '&w=' + w;
      const res = await fetch(url);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob).catch(() => null);
      out.push({ w, px, status: res.status, type: res.headers.get('content-type'),
        width: bmp ? bmp.width : 0, height: bmp ? bmp.height : 0, bytes: blob.size });
    }
    const shareUrl = '/223669/1786435410-share.webp?auto=format&fit=crop&h=630&w=1200';
    const sr = await fetch(shareUrl);
    const sb = await sr.blob();
    const si = await createImageBitmap(sb).catch(() => null);
    out.push({ w: 'share', px: 1200, status: sr.status, type: sr.headers.get('content-type'),
      width: si ? si.width : 0, height: si ? si.height : 0, bytes: sb.size });
    return out;
  }, EXPECT);

  const icons = probes.filter(p => p.w !== 'share');
  check('all 16 icon widths return 200 image/png',
    icons.every(p => p.status === 200 && /image\/png/.test(p.type || '')),
    icons.filter(p => p.status !== 200).map(p => p.w + ':' + p.status).join(',') || 'ok');
  check('every icon decodes at its declared pixel size',
    icons.every(p => p.width === p.px && p.height === p.px),
    icons.filter(p => p.width !== p.px).map(p => p.w + ' got ' + p.width).join(',') || 'all exact');
  const share = probes.find(p => p.w === 'share');
  check('share card is a 1200x630 image/webp',
    share.status === 200 && share.width === 1200 && share.height === 630 && /webp/.test(share.type || ''),
    [share.status, share.type, share.width + 'x' + share.height].join(' | '));

  const icon16 = icons.find(p => p.w === '16');
  check('16px favicon stays small enough for a tab', icon16.bytes > 200 && icon16.bytes < 4096, icon16.bytes + ' B');

  fs.mkdirSync(OUT, { recursive: true });
  // The WebGL boot overlay paints three white bars; wait for it to clear or the
  // evidence shot is just a black frame.
  await page.waitForFunction(() => {
    const l = document.querySelector('div.z-99');
    if (!l) return true;
    const s = getComputedStyle(l);
    return s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0 ||
      l.getBoundingClientRect().height === 0;
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4500);
  await page.screenshot({ path: path.join(OUT, 'brand_icons_home.png') });
  await page.goto(O + '/projects/erp', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'brand_icons_detail.png') });

  check('no page or console errors', perr.length === 0 && cerr.length === 0, [perr[0], cerr[0]].filter(Boolean).join(' | '));
  check('no 4xx / failed requests', bad.length === 0, bad.slice(0, 3).join(' | '));
  check('no external requests', ext.length === 0, ext.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(REPORT, JSON.stringify({ pass: results.length - failed.length, total: results.length,
    fails: failed, results, probes }, null, 1));
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  if (failed.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
