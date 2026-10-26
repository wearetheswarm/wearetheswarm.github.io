// Films a page frame by frame and encodes the video with ffmpeg:
//   --page storyboard (default)  storyboard.html, the homepage video: one-question-two-nodes[-mobile]
//   --page replay                replay.html, the four terminals in full: four-terminals[-mobile]
//
//   node beats.mjs && node film.mjs [--layout desktop|mobile|all] [--fps 30] [--out ../site/demo]
//   node prepare.mjs && node film.mjs --page replay
//   node film.mjs --stills 3,12,25   only screenshots at these times (in frames/), for a quick look
//
// Each frame is a pure function of its time (the replay seeks all four players to it), so the panels
// stay in step and a rerun gives the same video. Needs ffmpeg, and Chrome (or set CHROME to a Chromium binary).

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1] ?? '1']] : a), []));
const here = path.dirname(new URL(import.meta.url).pathname);
const outDir = path.resolve(args.out || path.join(here, '../site/demo'));
const fps = +(args.fps || 30);
const pageName = args.page || 'storyboard';
// The poster is what shows before playback (and instead of it, with reduced motion): the storyboard's
// intro card, or the replay's last frame with all four panels filled.
const { name, poster, mobileHeight, posterAt } = {
  storyboard: { name: 'one-question-two-nodes', poster: 'poster', mobileHeight: 520, posterAt: () => 2.4 },
  replay: { name: 'four-terminals', poster: 'four-terminals-poster', mobileHeight: 460, posterAt: (d) => Math.max(0, d - 0.5) },
}[pageName];
const layouts = {
  desktop: { viewport: { width: 1280, height: 720 }, scale: 1.5, suffix: '' }, // a 1920x1080 file with text 1.5x larger in it
  mobile: { viewport: { width: 390, height: mobileHeight }, scale: 2, suffix: '-mobile' },
};
const chosen = !args.layout || args.layout === 'all' ? Object.keys(layouts) : [args.layout];
const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// A small static server for the demo folder.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.cast': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const file = path.join(here, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(here) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const run = (cmd, argv, input) => new Promise((resolve, reject) => {
  const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (code) => (code ? reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)) : resolve()));
  if (input) input(p.stdin);
});

try {
  fs.mkdirSync(outDir, { recursive: true });
  for (const key of chosen) {
    const L = layouts[key];
    const page = await browser.newPage({ viewport: L.viewport, deviceScaleFactor: L.scale });
    await page.goto(`${base}/${pageName}.html?frames=1&layout=${key}${args.query ? `&${args.query}` : ''}`);
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 30000 });
    const duration = await page.evaluate(() => window.replay.duration);
    const shot = async (t, opts) => { await page.evaluate((x) => window.replay.renderAt(x), t); return page.screenshot(opts); };

    if (args.stills) {
      fs.mkdirSync(path.join(here, 'frames'), { recursive: true });
      for (const t of String(args.stills).split(',').map(Number)) await shot(t, { path: path.join(here, 'frames', `${key}-${t}s.png`) });
      console.log(`${key}: stills in demo/frames/`);
      await page.close(); continue;
    }

    // Poster: the end, with all four panels filled (shown when motion is reduced, and before playback).
    await shot(posterAt(duration), { path: path.join(outDir, `${poster}${L.suffix}.jpg`), type: 'jpeg', quality: 85 });

    const frames = Math.ceil(duration * fps);
    const out = path.join(outDir, `${name}${L.suffix}`);
    console.log(`${key}: ${frames} frames (${duration} s at ${fps} fps)`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', '-an', `${out}.webm`,
      '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-tune', 'stillimage', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', `${out}.mp4`],
    async (stdin) => {
      for (let i = 0; i < frames; i++) {
        const png = await shot(i / fps, { type: 'png' });
        if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r));
        if (i % (fps * 5) === 0) process.stdout.write(`  ${(i / fps).toFixed(0)} s\r`);
      }
      stdin.end();
    });
    for (const ext of ['webm', 'mp4']) console.log(`  ${path.relative(process.cwd(), `${out}.${ext}`)}: ${(fs.statSync(`${out}.${ext}`).size / 1e6).toFixed(2)} MB`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
