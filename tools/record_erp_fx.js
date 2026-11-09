/* Record the ERP home-cover motion (site/erp-fx.html) into a seamless loop.
 *
 * The page exposes window.__erpSeek(t): one paused 14 s GSAP master timeline
 * that starts and ends at the rest composition, so every frame is a pure
 * function of t and frame 0 === frame 14 — the clip loops without a seam when
 * the stock WebGL renderer plays it as the home-card video texture.
 *
 * Outputs (site/erp/):
 *   cover.mp4        1600x900, 24 fps, h264
 *   cover.jpg        1600x900 poster (t = 0, the approved rest composition)
 *   cover_card.jpg   1200x675
 *   cover_small.jpg   640x360
 *
 * Usage:
 *   node tools/record_erp_fx.js --still     # just the poster frame
 *   node tools/record_erp_fx.js --preview   # sampled stills of the loop
 *   node tools/record_erp_fx.js             # full mp4 + three posters
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES = '/tmp/erp_fx_frames';
const SITE_DIR = path.join(ROOT, 'site', 'erp');
const URL = 'http://127.0.0.1:5188/erp-fx';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FPS = 24;
const PREVIEW = process.argv.includes('--preview');
const STILL = process.argv.includes('--still');

const ff = () => execFileSync('python3', ['-c',
  'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
  { encoding: 'utf8' }).trim();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars',
           '--autoplay-policy=no-user-gesture-required'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return;   // tracked via response
    errs.push('console ' + m.text());
  });
  page.on('response', r => {
    if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push(r.status() + ' ' + r.url());
  });

  await page.goto(URL + '?capture=1', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => {
    const fx = window.__erpSeek;
    return {
      duration: fx ? +fx.duration.toFixed(3) : null,
      phones: document.querySelectorAll('.phone img').length,
      images: [...document.images].filter(i => i.naturalWidth > 0).length,
      fonts: [...document.fonts].map(f => f.family + ':' + f.status),
      gsap: window.gsap ? window.gsap.version : null,
      seekable: !!(fx && typeof fx.seek === 'function'),
    };
  });
  console.log('PAGE', JSON.stringify(info, null, 1));
  if (info.images !== 2 || info.phones !== 2) throw new Error('2 phone slices must load');
  if (info.fonts.some(f => !/loaded$/.test(f))) throw new Error('webfonts not loaded');
  if (!info.gsap || !info.seekable || !info.duration) throw new Error('capture hook missing');
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));

  const DURATION = info.duration;
  const COUNT = Math.round(DURATION * FPS);
  const seek = t => page.evaluate(sec => window.__erpSeek.seek(sec), t);

  // seam check: the rest state at t=0 must equal the state just before the wrap
  const seam = await page.evaluate(() => {
    const fx = window.__erpSeek;
    // `none` and the identity matrix are the same rest state
    const read = () => ['#gridPhone', '#detailPhone', '#badge'].map(s => {
      const t = getComputedStyle(document.querySelector(s)).transform;
      return (t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)') ? 'rest' : t;
    }).join('|');
    fx.seek(0);
    const a = read();
    fx.seek(fx.duration - 0.001);
    const b = read();
    return { a, b, equal: a === b };
  });
  console.log('seam', seam.equal ? 'OK' : 'MISMATCH ' + JSON.stringify(seam));

  if (STILL) {
    await seek(0);
    await page.waitForTimeout(80);
    await page.screenshot({ path: path.join(OUT, 'erp_fx_poster.png') });
    console.log('still ->', path.join(OUT, 'erp_fx_poster.png'));
    await browser.close();
    return;
  }

  if (PREVIEW) {
    for (const t of [0, 1.8, 3.2, 4.6, 5.4, 6.6, 8.2, 9.8, 11.6, 12.8, 13.9]) {
      await seek(t);
      await page.waitForTimeout(40);
      await page.screenshot({ path: path.join(OUT, 'erpfx_t' + String(t).replace('.', '_') + '.png') });
    }
    await browser.close();
    console.log('preview stills ->', OUT);
    return;
  }

  console.log('loop duration:', DURATION, 's | frames:', COUNT, '@', FPS, 'fps');
  for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));
  for (let i = 0; i < COUNT; i++) {
    await seek(i / FPS);
    await page.screenshot({
      path: path.join(FRAMES, 'f' + String(i).padStart(4, '0') + '.jpg'),
      type: 'jpeg', quality: 94,
    });
    if (i % 48 === 0) console.log('  frame', i, '/', COUNT);
  }
  await browser.close();

  const ffmpeg = ff();
  const mp4 = path.join(SITE_DIR, 'cover.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Posters come from the rest frame so the static fallback is the artwork.
  execFileSync('python3', ['-c', `
from PIL import Image
import os
site = ${JSON.stringify(SITE_DIR)}
im = Image.open(${JSON.stringify(path.join(FRAMES, 'f0000.jpg'))}).convert('RGB')
assert im.size == (1600, 900), im.size
for suffix, w in (('', 1600), ('_card', 1200), ('_small', 640)):
    h = round(900 * w / 1600)
    out = os.path.join(site, 'cover' + suffix + '.jpg')
    im.resize((w, h), Image.LANCZOS).save(out, quality=92, optimize=True, progressive=True)
    print('poster', os.path.basename(out), w, 'x', h)
`], { stdio: 'inherit' });

  fs.writeFileSync(path.join(ROOT, 'raw', 'erp_fx_meta.json'),
    JSON.stringify({ source: 'ERP 动画/切图.png + 切图-1.png (site/erp-fx.html)',
                     gsap: info.gsap, duration: DURATION, fps: FPS,
                     frames: COUNT, size: [1600, 900], seam: seam.equal }, null, 1));
  console.log('\nmp4:', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('duration:', DURATION, 's | frames:', COUNT);
})().catch(e => { console.error(e); process.exit(1); });
