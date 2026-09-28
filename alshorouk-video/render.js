// Renders index.html frame-by-frame with headless Chromium and pipes the frames to ffmpeg.
//
//   node render.js                     -> alshorouk-promo.mp4 (with music.wav / music.m4a if present)
//   node render.js --stills 1,5.5,12   -> PNG stills in ./stills (for quick checks)
//
// Env: FFMPEG=/path/to/ffmpeg (defaults to "ffmpeg" on PATH)
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { once } = require('events');
const { chromium } = require('playwright');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const OUT = path.join(__dirname, 'alshorouk-promo.mp4');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html') + '?render=1');
  await page.waitForFunction(() => window.READY === true);
  const { DURATION, FPS } = await page.evaluate(() => ({ DURATION: window.DURATION, FPS: window.FPS }));

  const stillsArg = process.argv.indexOf('--stills');
  if (stillsArg > -1) {
    const dir = path.join(__dirname, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
      await page.evaluate(t => window.renderAt(t), t);
      await page.screenshot({ path: path.join(dir, `t${t.toFixed(2)}.png`) });
    }
    await browser.close();
    return;
  }

  const audio = ['music.wav', 'music.m4a'].map(f => path.join(__dirname, f)).find(f => fs.existsSync(f));
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-'];
  if (audio) args.push('-i', audio);
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS));
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', OUT);
  const ff = spawn(FFMPEG, args, { stdio: ['pipe', 'inherit', 'inherit'] });

  const frames = Math.round(DURATION * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate(t => window.renderAt(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${frames}\r`);
  }
  ff.stdin.end();
  const [code] = await once(ff, 'close');
  await browser.close();
  if (code !== 0) throw new Error('ffmpeg exited with ' + code);
  console.log(`\nwrote ${OUT}`);
})().catch(e => { console.error(e); process.exit(1); });
