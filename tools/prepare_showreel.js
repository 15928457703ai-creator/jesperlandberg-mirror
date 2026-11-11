/* Prepare the homepage video and poster variants. Pass the source video path. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DEST = path.join(ROOT, 'site', 'showreel');
const META = path.join(ROOT, 'raw', 'project_images', 'showreel.json');
const clips = [{ source: process.argv[2], stem: 'showreel', replaces: 'showreel' }];
if (!clips[0].source) throw new Error('Pass the source video path');

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
    const prior = [];
    const names = new Set(clips.map(c => path.basename(c.source)));
    const replaced = new Set(clips.flatMap(c => [c.stem + '.mp4', c.replaces + '.mp4']));
    const meta = prior.filter(m => !names.has(m.source) && !replaced.has(m.video?.file));
    for (const clip of clips) {
      const result = await page.evaluate(async stem => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.src = '/showreel/' + stem + '.mp4';
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
      const entry = { n: meta.length + 1, source: path.basename(clip.source), kind: 'video', cover: true,
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
    console.log('Video slides:', meta.length);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
