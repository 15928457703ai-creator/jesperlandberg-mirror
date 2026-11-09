/* Record the OPPO 自助服务 cover motion into a seamless looping mp4.

   One paused GSAP master timeline (12s) is seeked with window.__osSeek(t), so
   every frame is deterministic and frame 0 === frame 12.  The clip is fed to
   the stock WebGL video-texture path, which turns ONLY the home card cover
   into an animated composition; the detail sheet keeps its 17 still slides.

   Usage:
     node tools/record_oppo_self_live.js --preview   # a few stills
     node tools/record_oppo_self_live.js --still     # clean poster frame
     node tools/record_oppo_self_live.js             # full 12s mp4 + poster
*/
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const OUT = path.join(ROOT, 'screenshots');
const FRAMES_DIR = '/tmp/oppo_self_live_frames';
const SITE_DIR = path.join(ROOT, 'site', 'oppo-self');
const URL = 'http://127.0.0.1:5188/oppo-self-live?capture=1';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const DURATION = 12;
const FPS = 20;
const COUNT = DURATION * FPS;
const PREVIEW = process.argv.includes('--preview');
const STILL = process.argv.includes('--still');
const PREVIEW_T = [0, 0.4, 1.0, 2.0, 3.4, 4.6, 6.8, 9.6, 11.9];

const ff = () => execFileSync('python3', ['-c',
  'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
  { encoding: 'utf8' }).trim();

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage',
           '--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1,
  });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  page.on('response', r => { if (r.status() >= 400) errs.push(r.status() + ' ' + r.url()); });

  await page.goto(URL + (STILL ? '&still=1' : ''), { waitUntil: 'networkidle' });
  await page.evaluate(() => Promise.all(
    [...document.images].map(i => i.complete ? null : i.decode().catch(() => null))));

  const info = await page.evaluate(() => ({
    images: [...document.images].length,
    loaded: [...document.images].filter(i => i.naturalWidth > 0).length,
    gsap: typeof window.gsap !== 'undefined' ? window.gsap.version : null,
    seekable: typeof window.__osSeek === 'function',
    duration: window.__osDuration,
    stage: (() => { const r = document.querySelector('.stage').getBoundingClientRect();
                     return [r.width, r.height]; })(),
    cuts: [...document.querySelectorAll('.cut')].map(c => {
      const r = c.getBoundingClientRect();
      return [c.className, Math.round(r.left), Math.round(r.top),
              Math.round(r.width), Math.round(r.height)];
    }),
  }));
  console.log('page:', JSON.stringify(info, null, 1));
  if (info.images !== 4 || info.loaded !== 4) throw new Error('slices failed to load');
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
    const still = path.join(OUT, 'oppo_self_live_still.png');
    await page.screenshot({ path: still });
    console.log('still poster:', still);
    await browser.close();
    return;
  }

  const seek = t => page.evaluate(sec => window.__osSeek(sec), t);

  if (PREVIEW) {
    for (const t of PREVIEW_T) {
      await seek(t);
      await page.screenshot({ path: path.join(OUT, 'os_live_t' + String(t).replace('.', '_') + '.png') });
      console.log('preview frame at', t, 's');
    }
    await browser.close();
    return;
  }

  for (const f of fs.readdirSync(FRAMES_DIR)) fs.unlinkSync(path.join(FRAMES_DIR, f));
  for (let i = 0; i < COUNT; i++) {
    await seek(i / FPS);
    await page.screenshot({
      path: path.join(FRAMES_DIR, 'f' + String(i).padStart(4, '0') + '.jpg'),
      type: 'jpeg', quality: 90,
    });
    if (i % 40 === 0) console.log('  frame', i, '/', COUNT);
  }
  await browser.close();

  const ffmpeg = ff();
  const mp4 = path.join(SITE_DIR, 'motion.mp4');
  execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'f%04d.jpg'),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-movflags', '+faststart', mp4], { stdio: 'inherit' });

  const poster = path.join(OUT, 'oppo_self_live_poster.jpg');
  fs.copyFileSync(path.join(FRAMES_DIR, 'f' + String(Math.round(4.5 * FPS)).padStart(4, '0') + '.jpg'), poster);
  console.log('\nmp4   :', mp4, (fs.statSync(mp4).size / 1048576).toFixed(2), 'MB');
  console.log('poster:', poster);
  if (errs.length) console.log('page errors:', errs);
})().catch(e => { console.error(e); process.exit(1); });
