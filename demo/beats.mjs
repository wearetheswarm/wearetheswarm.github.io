// Checks the storyboard's lines against the casts, then writes its timeline.
//
//   node beats.mjs [--in casts] [--beats beats.json] [--out build] [--no-intro]
//   --no-intro: for the homepage, where the hero above already says what the intro card says
//
// Every line of beats.json must be real: split on "…", each piece must appear, in order, in its
// pane's cast (in one line for the line-based panes, in one screen for a full-screen app such as
// Claude Code, whose screens are rendered with `asciinema convert`). Trimming with "…" is allowed;
// rewording is not, and the script stops on the first line it cannot find.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const here = path.dirname(new URL(import.meta.url).pathname);
const inDir = path.resolve(args.in || path.join(here, 'casts'));
const outDir = path.resolve(args.out || path.join(here, 'build'));
const story = JSON.parse(fs.readFileSync(path.resolve(args.beats || path.join(here, 'beats.json')), 'utf8'));
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[=>78]/g;
const flat = (s) => s.replace(/\s+/g, ' ');

const events = (pane) => {
  const lines = fs.readFileSync(path.join(inDir, `${pane}.cast`), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const head = JSON.parse(lines[0]); let t = 0;
  return { head: lines[0], list: lines.slice(1).map((l) => { const [d, code, data] = JSON.parse(l); t = head.version === 3 ? t + d : d; return { t, code, data, raw: l }; }) };
};

// Texts to search, per pane: its output lines, or (full-screen panes) its screens every 2 s.
const cache = {};
function texts(pane) {
  if (cache[pane]) return cache[pane];
  const { head, list } = events(pane);
  if (!(story.screens || []).includes(pane)) {
    cache[pane] = list.filter((e) => e.code === 'o').flatMap((e) => e.data.replace(ANSI, '').replace(/\r/g, '').split('\n').map((x) => ({ t: e.t, text: flat(x) })));
    return cache[pane];
  }
  const tmp = fs.mkdtempSync(path.join(outDir, 'screens-'));
  const seen = new Map(); // screen text → first time seen
  for (let T = 0, end = list[list.length - 1].t; T <= end + 2; T += 2) {
    fs.writeFileSync(path.join(tmp, 's.cast'), [head, ...list.filter((e) => e.t <= T).map((e) => e.raw)].join('\n') + '\n');
    execFileSync('asciinema', ['convert', '-f', 'txt', '--overwrite', path.join(tmp, 's.cast'), path.join(tmp, 's.txt')], { stdio: 'ignore' });
    const screen = flat(fs.readFileSync(path.join(tmp, 's.txt'), 'utf8'));
    if (!seen.has(screen)) seen.set(screen, T);
  }
  fs.rmSync(tmp, { recursive: true });
  return (cache[pane] = [...seen].map(([text, at]) => ({ t: at, text })));
}

// When the line first appears in the cast (seconds from the pane's start), or undefined.
const real = (pane, text) => {
  const pieces = text.split('…').map((s) => flat(s).trim()).filter(Boolean);
  const hit = texts(pane).find(({ text: t }) => { let at = 0; return pieces.every((p) => { const i = t.indexOf(p, at); if (i < 0) return false; at = i + p.length; return true; }); });
  return hit && hit.t;
};
const starts = Object.fromEntries((story.panes || []).map((p) => [p.id, parseFloat(fs.readFileSync(path.join(inDir, `${p.id}.start`), 'utf8'))]));

fs.mkdirSync(outDir, { recursive: true });
const rate = story.rate ?? 30, hold = story.hold ?? 2, gap = story.gap ?? 0.5;
// Cards (own copy, not from the casts): an intro, a title card before each captioned beat (it holds,
// then moves down into the caption bar), and an end card that holds until the loop restarts.
const intro = 'no-intro' in args ? { ...story.intro, seconds: 0 } : story.intro || { seconds: 0 }, card = story.titleCard || { hold: 2.3, move: 0.7 }, outro = story.outro || { seconds: 0 };
let t = intro.seconds + (story.lead ?? 1);
const beats = [];
let bad = 0, lastAt = -Infinity, lastText = '';
for (const [n, b] of story.beats.entries()) {
  let title, net;
  if (b.caption) { title = { start: +t.toFixed(3), move: +(t + card.hold).toFixed(3), end: +(t + card.hold + card.move).toFixed(3) }; t = title.end + 0.3; }
  // A beat that crosses the network waits for its pulse to travel across the band.
  if (b.net) { net = { dir: b.net, start: +t.toFixed(3), end: +(t + (story.net ?? 0.9)).toFixed(3) }; t = net.end; }
  const lines = [];
  for (const l of b.lines) {
    const line = typeof l === 'string' ? { text: l } : l;
    const found = real(b.pane, line.text);
    if (found === undefined) { console.error(`beat ${n + 1} (${b.pane}): not found in the cast: ${line.text}`); bad++; }
    else {
      // Never reorder: each line must come after the previous one in real time (2 s screen steps).
      const at = starts[b.pane] + found;
      if (at < lastAt - 2.5) { console.error(`beat ${n + 1}: "${line.text.slice(0, 50)}" happened before "${lastText.slice(0, 50)}"`); bad++; }
      lastAt = Math.max(lastAt, at); lastText = line.text;
    }
    const typed = line.instant ? 0 : [...line.text].length / rate;
    lines.push({ ...line, start: +t.toFixed(3), end: +(t + typed).toFixed(3) });
    t += typed + gap;
  }
  beats.push({ pane: b.pane, caption: b.caption, title, net, memory: b.memory, spread: b.spread, start: lines[0].start, lines });
  t += hold - gap;
}
if (bad) { console.error(`${bad} line(s) not found: fix beats.json`); process.exit(1); }
const end = t + (story.tail ?? 1);
const out = { duration: +(end + outro.seconds).toFixed(2), rate, panes: story.panes, beats,
  intro: { ...intro, end: intro.seconds }, outro: { ...outro, start: +end.toFixed(3) },
  // The poster: mid-story, once the answer is stored and copied, both machines and the network lit.
  poster: (() => { const b = beats.find((x) => x.spread); return b ? +(b.start + 2).toFixed(2) : intro.seconds / 2; })() };
fs.writeFileSync(path.join(outDir, 'storyboard.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${beats.length} beats, ${beats.reduce((a, b) => a + b.lines.length, 0)} lines, all found in the casts · ${out.duration} s`);
for (const [i, b] of beats.entries()) console.log(`  ${String(i + 1).padStart(2)}  ${b.start.toFixed(1).padStart(5)} s  ${b.pane.padEnd(16)} ${b.lines.map((l) => l.text.slice(0, 60)).join(' | ')}`);
