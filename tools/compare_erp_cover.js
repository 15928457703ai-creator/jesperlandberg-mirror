/* Compare the rebuilt ERP cover (site/erp-fx.html) against the approved
 * artwork (site/erp/2.jpg) and report the offset of every text block.
 *
 *   node tools/compare_erp_cover.js            # still + diff report
 *
 * The rebuild is only "right" when the ink bounding boxes of the title,
 * subtitle, paragraph and meta lines land within a pixel or two of the
 * artwork, so this prints those boxes side by side instead of relying on a
 * human eyeballing a screenshot.
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });

  await page.goto('http://127.0.0.1:5188/erp-fx?still=1', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => null))));
  await page.waitForTimeout(350);
  const shot = path.join(OUT, 'erp_fx_still.png');
  await page.screenshot({ path: shot });
  await browser.close();

  console.log('still ->', shot);
  if (errs.length) console.log('ERRORS', errs);

  // ---- measure both images with PIL ----
  const py = `
import numpy as np, json, sys
from PIL import Image
def bands(img, y0, y1, x0, x1, kind):
    a = np.asarray(Image.open(img).convert('RGB')).astype(int)
    s = a[y0:y1, x0:x1]
    if kind == 'dark':
        m = s.sum(axis=2) < 200
    else:
        m = s.sum(axis=2) > 560
    rows = m.sum(axis=1)
    out = []; inr = False
    for i, v in enumerate(rows):
        if v > 2 and not inr: st = i; inr = True
        elif v <= 2 and inr:
            seg = m[st:i]; ys, xs = np.where(seg)
            out.append([int(ys.min()+y0+st), int(ys.max()+y0+st), int(xs.min()+x0), int(xs.max()+x0)])
            inr = False
    if inr:
        seg = m[st:]; ys, xs = np.where(seg)
        out.append([int(ys.min()+y0+st), int(ys.max()+y0+st), int(xs.min()+x0), int(xs.max()+x0)])
    return out
res = {}
for name, img in (('ref','site/erp/2.jpg'), ('new','screenshots/erp_fx_still.png')):
    res[name] = {
      'white_top': bands(img, 40, 340, 60, 900, 'dark'),
      'blue_left': bands(img, 560, 860, 60, 620, 'light'),
    }
print(json.dumps(res))
`;
  const out = execFileSync('python3', ['-c', py], { cwd: ROOT, encoding: 'utf8' });
  const r = JSON.parse(out);
  const show = (key) => {
    console.log('\n== ' + key + ' (top,bottom,left,right)');
    const a = r.ref[key], b = r.new[key];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i] || [], y = b[i] || [];
      const d = (x.length && y.length) ? [y[0] - x[0], y[1] - x[1], y[2] - x[2], y[3] - x[3]] : '-';
      console.log('  ' + String(i).padEnd(2), 'ref', JSON.stringify(x).padEnd(26),
                  'new', JSON.stringify(y).padEnd(26), 'delta', JSON.stringify(d));
    }
  };
  show('white_top');
  show('blue_left');
})();
