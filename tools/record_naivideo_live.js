/* LEGACY / ARCHIVED RECORDER — the retired 9-tile soft-entrance cover.
   The ACTIVE Naivideo home cover is produced by tools/record_naivideo_fx.js
   from the user's naivideo-fx.zip.  This one now reads the archived
   /naivideo-live-legacy page and writes live_legacy.mp4, so running it can
   never overwrite the live cover.  Kept for regression + rollback only.

   Record the Naivideo bento showcase into a seamless looping mp4.

   The showcase is driven by one paused GSAP master timeline (12s, repeat:-1).
   Instead of recording wall-clock time (which would jitter), the recorder
   seeks that timeline with `window.__nvSeek(t)`, so every exported frame is
   deterministic and frame 0 === frame 12.  The resulting mp4 is fed to the
   stock WebGL video-texture path, which turns the (previously static)
   Naivideo home card + detail cover into the animated collage while keeping
   every original site interaction intact.

   Usage:
     node tools/record_naivideo_live.js --preview     # a few stills only
     node tools/record_naivideo_live.js --still       # clean poster frame
     node tools/record_naivideo_live.js               # full 12s mp4 + poster
*/
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES_DIR = '/tmp/naivideo_live_frames';
const SITE_NAIVIDEO = path.join(ROOT, 'site', 'naivideo');
const URL = 'http://127.0.0.1:5188/naivideo-live-legacy?capture=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DURATION = 12;          // seconds, one full loop
const FPS = 20;
const COUNT = DURATION * FPS; // 240 frames
const PREVIEW = process.argv.includes('--preview');
const STILL = process.argv.includes('--still');
// Early samples make the new soft entrance visible frame by frame.
const PREVIEW_T = [0, 0.25, 0.6, 1.2, 2.0, 3.0, 4.5, 7.2, 10.4, 11.9];

const ff = () => execFileSync('python3', ['-c',
  'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
  { encoding: 'utf8' }).trim();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(SITE_NAIVIDEO, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });

  await page.goto(URL + (STILL ? '&still=1' : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.tile')];
    return {
      tiles: tiles.length,
      loaded: [...document.images].filter(i => i.naturalWidth > 0).length,
      gsap: typeof window.gsap !== 'undefined' ? window.gsap.version : null,
      seekable: typeof window.__nvSeek === 'function',
      duration: window.__nvDuration,
      stage: (() => { const r = document.querySelector('.stage').getBoundingClientRect();
                       return [r.width, r.height]; })(),
      positions: tiles.map(t => [t.className.split(' ')[1],
        Math.round(t.getBoundingClientRect().left),
        Math.round(t.getBoundingClientRect().top),
        Math.round(t.getBoundingClientRect().width),
        Math.round(t.getBoundingClientRect().height)]),
    };
  });
  console.log('page:', JSON.stringify(info, null, 1));
  if (info.tiles !== 9 || info.loaded !== 9) throw new Error('slices failed to load');
  if (info.stage[0] !== 1600 || info.stage[1] !== 900) throw new Error('capture stage is not 1600x900');
  if (!info.gsap) throw new Error('local GSAP failed to load');
  if (!STILL) {
    if (!info.seekable) throw new Error('capture timeline was not exposed');
    if (Math.abs(info.duration - DURATION) > .001) {
      throw new Error('master timeline is ' + info.duration + 's, expected ' + DURATION);
    }
  }
  if (errs.length) throw new Error('page errors: ' + errs.join(' | '));

  if (STILL) {
    const still = path.join(OUT, 'naivideo_live_still.png');
    await page.screenshot({ path: still });
    console.log('still poster:', still);
    await browser.close();
    return;
  }

  // The GSAP master timeline is already paused in capture mode. Seeking it
  // by absolute time makes every frame a pure function of t, independent of
  // wall-clock frame rate (and frame 0 is identical to frame 12).
  const seek = t => page.evaluate(sec => window.__nvSeek(sec), t);

  if (PREVIEW) {
    for (const t of PREVIEW_T) {
      await seek(t);
      await page.screenshot({ path: path.join(OUT, 'nv_live_t' + String(t).replace('.', '_') + '.png') });
      console.log('preview frame at', t, 's');
    }
    await browser.close();
    return;
  }

  // clean stale frames so ffmpeg never mixes two takes
  for (const f of fs.readdirSync(FRAMES_DIR)) fs.unlinkSync(path.join(FRAMES_DIR, f));

  for (let i = 0; i < COUNT; i++) {
    const t = i / FPS;
    await seek(t);
    await page.screenshot({
      path: path.join(FRAMES_DIR, 'f' + String(i).padStart(4, '0') + '.jpg'),
      type: 'jpeg', quality: 90,
    });
    if (i % 40 === 0) console.log('  frame', i, '/', COUNT);
  }
  await browser.close();

  const ffmpeg = ff();
  const mp4 = path.join(SITE_NAIVIDEO, 'live_legacy.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  // Poster = a fully revealed, mid-spotlight frame (t = 4.5s)
  const poster = path.join(OUT, 'naivideo_live_poster.jpg');
  fs.copyFileSync(path.join(FRAMES_DIR, 'f' + String(Math.round(4.5 * FPS)).padStart(4, '0') + '.jpg'), poster);
  console.log('\nmp4 :', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('poster:', poster);
  if (errs.length) console.log('page errors:', errs);
})().catch(e => { console.error(e); process.exit(1); });
