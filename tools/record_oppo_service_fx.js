/* Record the OPPO 服务小程序 tile-wall fx (oppo-service-fx.zip) into a
 * seamless looping mp4 for the home cover.
 *
 * Source: site/oppo-service-fx.html + main.js + assets/Group *.png
 * main.js ships a deterministic capture hook (window.__oppoSeek) exposed
 * only with ?capture=1: the 9-move master cycle starts and ends at the
 * exact rest state, so frame 0 == last frame -> seamless loop.  The
 * intro slam and breathing are excluded in capture mode on purpose.
 *
 * Usage:
 *   node tools/record_oppo_service_fx.js --still    # static composition shot
 *   node tools/record_oppo_service_fx.js --preview  # sampled frames + state
 *   node tools/record_oppo_service_fx.js            # full mp4 + 3 posters
 */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES = '/tmp/oppo_service_fx_frames';
const SITE_OPPO = path.join(ROOT, 'site', 'oppo');
const BASE = 'http://127.0.0.1:5188/oppo-service-fx';
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

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars',
           '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
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
  // The browser's automatic /favicon.ico probe is a harmless 404 in this
  // static offline mirror (no favicon next to the fx page).
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource/i.test(m.text())) return;   // tracked via response
    errs.push('console ' + m.text());
  });
  page.on('response', r => {
    if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push(r.status() + ' ' + r.url());
  });

  const URL = BASE + (STILL ? '?still=1' : '?capture=1');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => {
    const fx = window.__oppoSeek;
    return {
      duration: fx ? +fx.duration.toFixed(4) : null,
      tiles: document.querySelectorAll('.tile').length,
      images: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: window.gsap ? window.gsap.version : null,
      seekable: !!(fx && typeof fx.seek === 'function'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
  console.log('PAGE', JSON.stringify(info, null, 1));
  if (info.tiles !== 7 || info.images !== 7) throw new Error('7 tiles / 7 images must load');
  if (!info.gsap || !info.seekable || !info.duration) throw new Error('capture hook missing');
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));

  if (STILL) {
    await page.screenshot({ path: path.join(OUT, 'oppo_service_fx_still.png') });
    console.log('still ->', path.join(OUT, 'oppo_service_fx_still.png'));
    await browser.close();
    return;
  }

  const DURATION = info.duration;
  const COUNT = Math.round(DURATION * FPS);
  console.log('loop duration:', DURATION, 's | frames:', COUNT, '@', FPS, 'fps');

  const seek = t => page.evaluate(sec => window.__oppoSeek.seek(sec), t);

  // seam check: rest frame at t=0 must equal the frame just before wrap
  const seam = await page.evaluate(() => {
    const fx = window.__oppoSeek;
    fx.seek(0);
    const a = document.querySelector('.tile-3d');
    const t0 = getComputedStyle(a).transform;
    fx.seek(fx.duration - 0.001);
    const t1 = getComputedStyle(a).transform;
    return { t0, t1, equal: t0 === t1 };
  });
  if (!seam.equal) console.log('seam note:', JSON.stringify(seam));

  if (PREVIEW) {
    const TS = [0, 1.0, 2.2, 3.6, 5.2, 7.0, 8.8, 10.6, 12.4, 14.2, 16.0, 17.8, 19.6, 21.4, 23.2];
    for (const t of TS.filter(x => x < DURATION)) {
      await seek(t);
      const name = 'osf_t' + String(+t.toFixed(2)).replace('.', '_') + '.png';
      await page.screenshot({ path: path.join(OUT, name) });
      console.log('preview', name);
    }
    await browser.close();
    return;
  }

  for (const f of fs.readdirSync(FRAMES)) fs.unlinkSync(path.join(FRAMES, f));
  for (let i = 0; i < COUNT; i++) {
    await seek(i / FPS);
    await page.screenshot({
      path: path.join(FRAMES, 'f' + String(i).padStart(4, '0') + '.jpg'),
      type: 'jpeg', quality: 92,
    });
    if (i % 60 === 0) console.log('  frame', i, '/', COUNT);
  }
  await browser.close();

  const ffmpeg = ff();
  const mp4 = path.join(SITE_OPPO, 'live.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Three poster variants from the clean t=0 rest composition.
  execFileSync('python3', ['-c', `
from PIL import Image
import os
site = ${JSON.stringify(SITE_OPPO)}
im = Image.open(${JSON.stringify(path.join(FRAMES, 'f0000.jpg'))}).convert('RGB')
assert im.size == (1600, 900), im.size
for suffix, w in (('', 1600), ('_card', 1200), ('_small', 640)):
    h = round(900 * w / 1600)
    out = os.path.join(site, 'live' + suffix + '.jpg')
    im.resize((w, h), Image.LANCZOS).save(out, quality=92, optimize=True, progressive=True)
    print('poster', os.path.basename(out), w, 'x', h)
`], { stdio: 'inherit' });

  if (errs.length) console.log('page errors:', errs);
  fs.writeFileSync(path.join(ROOT, 'raw', 'oppo_service_fx_meta.json'),
    JSON.stringify({ source: 'OPPO 服务小程序 tile-wall fx (oppo-service-fx.zip)',
                     gsap: info.gsap, duration: DURATION, fps: FPS,
                     frames: COUNT, tiles: 7, size: [1600, 900] }, null, 1));
  console.log('\nmp4:', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('duration:', DURATION, 's | frames:', COUNT);
})().catch(e => { console.error(e); process.exit(1); });
