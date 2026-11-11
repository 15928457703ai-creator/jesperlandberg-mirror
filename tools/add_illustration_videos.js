/* Import motion studies without changing the existing cover.
 * Optional arguments: source-path output-stem (imports only that clip). */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'site', 'illustration');
const META = path.join(ROOT, 'raw', 'project_images', 'illustration.json');
const clips = process.argv[2] ? [{ source: process.argv[2], stem: process.argv[3] || 'motion-study', replaces: process.argv[3] || 'motion-study' }] : [
  { stem: 'gift-motion-v2', replaces: 'gift-motion', source: '/Users/soul/Documents/动效导出/礼物 4_2.mp4' },
  { stem: 'launch-motion-v3', replaces: 'launch-motion', source: '/Users/soul/Documents/动效导出/启动页 版本1_3.mp4' },
  { stem: 'precomposition-3', replaces: 'precomposition-3', source: '/Users/soul/Documents/动效导出/预合成 3.mp4' },
];

(async () => {
  for (const clip of clips) fs.copyFileSync(clip.source, path.join(DEST, clip.stem + '.mp4'));
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const page = await browser.newPage();
    // An empty, same-origin document avoids loading the WebGL portfolio.
    await page.goto((process.env.PREVIEW_ORIGIN || 'http://127.0.0.1:5189') + '/__noop.js');
    const prior = JSON.parse(fs.readFileSync(META));
    const names = new Set(clips.map(c => path.basename(c.source)));
    const replaced = new Set(clips.flatMap(c => [c.stem + '.mp4', c.replaces + '.mp4']));
    const meta = prior.filter(m => !names.has(m.source) && !replaced.has(m.video?.file));
    for (const clip of clips) {
      const result = await page.evaluate(async stem => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.src = '/illustration/' + stem + '.mp4';
        await new Promise((resolve, reject) => {
          video.onloadeddata = resolve;
          video.onerror = () => reject(new Error('Cannot decode ' + stem));
          setTimeout(() => reject(new Error('Video load timed out: ' + stem)), 20000);
        });
        video.currentTime = Math.min(1, video.duration / 3);
        await new Promise(resolve => { video.onseeked = resolve; });
        const out = { width: video.videoWidth, height: video.videoHeight, duration: video.duration, variants: {} };
        for (const [key, limit] of [['main', 1600], ['_card', 1200], ['_small', 640]]) {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(limit, video.videoWidth);
          canvas.height = Math.round(video.videoHeight * canvas.width / video.videoWidth);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          out.variants[key] = { width: canvas.width, height: canvas.height, data: canvas.toDataURL('image/jpeg', .9).split(',')[1] };
        }
        return out;
      }, clip.stem);
      const entry = { n: meta.length + 1, source: path.basename(clip.source), kind: 'video', cover: false,
        origWidth: result.width, origHeight: result.height };
      for (const [key, v] of Object.entries(result.variants)) {
        const file = clip.stem + (key === 'main' ? '' : key) + '.jpg';
        fs.writeFileSync(path.join(DEST, file), Buffer.from(v.data, 'base64'));
        entry[key] = { file, width: v.width, height: v.height };
      }
      entry.video = { file: clip.stem + '.mp4', width: result.width, height: result.height, duration: result.duration };
      meta.push(entry);
      console.log(entry.source, result.width + 'x' + result.height, result.duration + 's');
    }
    fs.writeFileSync(META, JSON.stringify(meta, null, 1) + '\n');
    console.log('Illustration slides:', meta.length);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
