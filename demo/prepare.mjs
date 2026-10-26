// Cleans the four demo casts and puts them on one shared, compressed timeline.
//
//   node prepare.mjs [--in DIR] [--out DIR] [--edits edits.json]
//
// Input: DIR/<pane>.cast (asciicast v2 or v3) and DIR/<pane>.start (the pane's start, epoch seconds).
// Output: OUT/<pane>.cast (asciicast v2, clean headers) and OUT/timeline.json for replay.html.
//
// Rules (see edits.json): lines are only dropped, dimmed or blanked, never reordered or invented.
// Idle time is compressed on the shared clock, so the panes stay aligned: the gap between two
// significant events (in any pane) is capped, and small redraws in between (spinners, counters)
// are spread over the shorter gap. Text that streams faster than the cap keeps its real pace.

import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const here = path.dirname(new URL(import.meta.url).pathname);
const inDir = path.resolve(args.in || path.join(here, 'casts'));
const outDir = path.resolve(args.out || path.join(here, 'build'));
const edits = JSON.parse(fs.readFileSync(path.resolve(args.edits || path.join(here, 'edits.json')), 'utf8'));

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[=>78]/g;
const visible = (s) => s.replace(ANSI, '').replace(/[\r\n]/g, '');
const re = (s) => new RegExp(s, 'm');
const clock = (epoch) => new Date(epoch * 1000).toTimeString().slice(0, 8);

// Read one cast: header + events with absolute epoch times.
function readCast(pane) {
  const lines = fs.readFileSync(path.join(inDir, `${pane}.cast`), 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const header = JSON.parse(lines[0]);
  const start = parseFloat(fs.readFileSync(path.join(inDir, `${pane}.start`), 'utf8'));
  let t = 0;
  const events = lines.slice(1).map((l) => {
    const [time, code, data] = JSON.parse(l);
    t = header.version === 3 ? t + time : time; // v3 stores intervals, v2 absolute times
    return { at: start + t, code, data };
  });
  return { header, start, events };
}

// Apply one pane's edits to its event list.
function clean(pane, cast, cfg) {
  let size = { cols: header0(cast.header).cols, rows: header0(cast.header).rows };
  const firstResize = cast.events.find((e) => e.code === 'r');
  if (firstResize) { const [c, r] = String(firstResize.data).split('x').map(Number); size = { cols: c, rows: r }; }
  let ev = cast.events.filter((e) => e.code === 'o');
  const log = [];

  // Keep only the part between the first event that matches `keepFrom` and the first that matches `dropFrom`.
  if (cfg.keepFrom) {
    const i = ev.findIndex((e) => re(cfg.keepFrom).test(visible(e.data)));
    if (i > 0) { log.push(`dropped ${i} events before the first match of /${cfg.keepFrom}/`); ev = ev.slice(i); }
    // In the first kept event, drop the lines before the match too (a banner can share it).
    if (ev.length) {
      const parts = ev[0].data.split(/(?<=\n)/), j = parts.findIndex((p) => re(cfg.keepFrom).test(visible(p)));
      if (j > 0) { log.push(`dropped ${j} banner lines`); ev[0] = { ...ev[0], data: parts.slice(j).join('') }; }
    }
  }
  // Drop everything after a clock time (e.g. the operator quitting the session).
  if (cfg.dropAfter) {
    const n = ev.filter((e) => clock(e.at) >= cfg.dropAfter).length;
    if (n) { log.push(`dropped ${n} events from ${cfg.dropAfter}`); ev = ev.filter((e) => clock(e.at) < cfg.dropAfter); }
  }
  if (cfg.dropFrom) {
    const i = ev.findIndex((e) => re(cfg.dropFrom).test(visible(e.data)));
    if (i >= 0) { log.push(`dropped ${ev.length - i} events from ${clock(ev[i].at)} (/${cfg.dropFrom}/)`); ev = ev.slice(0, i); }
  }

  // Line edits, on line-based output: drop or dim whole lines, or a block of lines from `from` through `through`.
  const lineEdits = cfg.lines || [];
  if (lineEdits.length) {
    let block = null; // an open from…through block
    const apply = (line, text, hit) => {
      log.push(`${hit.action || 'drop'}: ${text.trim().slice(0, 90)}`);
      return (hit.action || 'drop') === 'dim' ? line.replace(/^(.*?)(\r?\n)?$/s, '\x1b[2m$1\x1b[22m$2') : '';
    };
    ev = ev.map((e) => {
      const parts = e.data.split(/(?<=\n)/).map((line) => {
        const text = visible(line);
        if (block) { const out = apply(line, text, block); if (re(block.through).test(text)) block = null; return out; }
        const hit = lineEdits.find((x) => re(x.from || x.match).test(text));
        if (!hit) return line;
        if (hit.from && hit.through && !re(hit.through).test(text)) block = hit;
        return apply(line, text, hit);
      });
      return { ...e, data: parts.join('') };
    }).filter((e) => e.data !== '');
  }

  // Blank a string wherever it appears (same width, so a full-screen layout doesn't shift).
  for (const s of cfg.blank || []) {
    let n = 0;
    ev = ev.map((e) => { const parts = e.data.split(s); n += parts.length - 1; return { ...e, data: parts.join(' '.repeat([...s].length)) }; });
    if (n) log.push(`blanked "${s}" ${n}×`);
  }

  // Skip the frames inside a clock window (e.g. a reconnect notice). A full-screen app sends partial
  // redraws, so the window's frames are merged into one at its end: the screen lands in the right
  // state without showing what happened in between.
  for (const [from, to] of cfg.skipWindows || []) {
    const inWin = (e) => clock(e.at) >= from && clock(e.at) <= to;
    const win = ev.filter(inWin);
    if (!win.length) continue;
    const merged = { ...win[win.length - 1], data: win.map((e) => e.data).join('') };
    ev = [...ev.filter((e) => clock(e.at) < from), merged, ...ev.filter((e) => clock(e.at) > to)];
    log.push(`skipped ${win.length} frames ${from}–${to}`);
  }
  return { size, events: ev, log };
}
const header0 = (h) => (h.version === 3 ? { cols: h.term.cols, rows: h.term.rows } : { cols: h.width, rows: h.height });

// --- read and clean every pane
const panes = edits.panes.map((p) => ({ ...p, cast: readCast(p.id) }));
for (const p of panes) Object.assign(p, clean(p.id, p.cast, p));
const t0 = Math.min(...panes.map((p) => p.cast.start));

// --- the shared clock: significant events from all panes, in time order
// A tick is a small redraw (spinner, counter, status line): it doesn't reset the idle clock.
// A long redraw that also repaints the status line is not a tick: only short ones are.
const tick = (p, e) => { const v = visible(e.data).trim(); return v.length <= (p.tickMaxChars ?? 12) || (p.ticks ? re(p.ticks).test(v) && v.length <= (p.tickMaxLen ?? 100) : false); };
const sig = panes.flatMap((p) => p.events.filter((e) => !tick(p, e)).map((e) => ({ at: e.at, pane: p.id, text: visible(e.data) }))).sort((a, b) => a.at - b.at);
const cap = edits.idleCap ?? 1.2;
const capFor = (paneId) => panes.find((p) => p.id === paneId).idleCap ?? cap; // the pane that ends the gap sets its cap
const holdAfter = (s) => (edits.holds || []).filter((h) => h.pane === s.pane && re(h.match).test(s.text)).reduce((a, h) => Math.max(a, h.seconds), 0);
const spent = {}; // replay seconds per pane, for tuning
const knots = [{ at: t0, t: 0 }]; // piecewise-linear map from real time to replay time
let prev = { at: t0, hold: 0 };
for (const s of sig) {
  const gap = s.at - prev.at;
  if (gap <= 0) continue;
  const add = Math.min(gap, capFor(s.pane)) + prev.hold;
  spent[s.pane] = (spent[s.pane] || 0) + Math.min(gap, capFor(s.pane)); spent.holds = (spent.holds || 0) + prev.hold;
  knots.push({ at: s.at, t: knots[knots.length - 1].t + add });
  prev = { at: s.at, hold: holdAfter(s) };
}
const lastAt = Math.max(...panes.map((p) => (p.events.length ? p.events[p.events.length - 1].at : t0)));
knots.push({ at: Math.max(lastAt, prev.at) + 0.001, t: knots[knots.length - 1].t + prev.hold + (edits.tail ?? 3) });
const map = (at) => {
  let i = knots.findIndex((k) => k.at >= at);
  if (i <= 0) return Math.max(0, i === 0 ? 0 : knots[knots.length - 1].t);
  const a = knots[i - 1], b = knots[i];
  return a.t + ((at - a.at) / (b.at - a.at || 1)) * (b.t - a.t);
};
const duration = knots[knots.length - 1].t;

// --- captions and focus (the pane being watched: highlighted on desktop, shown alone on mobile)
const firstMatch = (pane, pattern) => sig.find((s) => s.pane === pane && re(pattern).test(s.text));
const captions = (edits.captions || []).map((c) => { const s = firstMatch(c.pane, c.match); return s && { t: +(map(s.at) - (c.lead ?? 0)).toFixed(2), text: c.text }; })
  .filter(Boolean).sort((a, b) => a.t - b.t);
const missing = (edits.captions || []).filter((c) => !firstMatch(c.pane, c.match));
const dwell = edits.minFocus ?? 1.8;
const focus = [];
for (const s of sig) {
  const t = map(s.at), cur = focus[focus.length - 1];
  if (!cur) { focus.push({ t: 0, pane: s.pane }); continue; }
  if (s.pane !== cur.pane && t - cur.t >= dwell) focus.push({ t: +t.toFixed(2), pane: s.pane });
}

// --- write
fs.mkdirSync(outDir, { recursive: true });
for (const p of panes) {
  const head = { version: 2, width: p.size.cols, height: p.size.rows }; // no command, env or theme: they carry local paths
  const body = p.events.map((e) => JSON.stringify([+map(e.at).toFixed(4), 'o', e.data]));
  fs.writeFileSync(path.join(outDir, `${p.id}.cast`), [JSON.stringify(head), ...body].join('\n') + '\n');
}
const timeline = { duration: +duration.toFixed(2), panes: panes.map((p) => ({ id: p.id, title: p.title, note: p.note, cols: p.size.cols, rows: p.size.rows })), captions, focus };
fs.writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(timeline, null, 2) + '\n');

// --- report
console.log(`real ${((lastAt - t0) / 60).toFixed(1)} min → replay ${duration.toFixed(1)} s (idle cap ${cap} s; ${panes.filter((p) => p.idleCap).map((p) => `${p.id} ${p.idleCap} s`).join(', ')})`);
for (const p of panes) console.log(`\n${p.id} (${p.size.cols}x${p.size.rows}, ${p.events.length} events)\n  ${p.log.join('\n  ') || 'no edits'}`);
console.log('\ncaptions:', captions.map((c) => `${c.t}s ${c.text}`).join(' | '));
if (missing.length) console.log('captions with no matching event:', missing.map((c) => c.text).join(' | '));
console.log('time per pane:', Object.entries(spent).map(([k, v]) => `${k} ${v.toFixed(1)} s`).join(', '), `, tail ${edits.tail ?? 3} s`);
console.log('focus:', focus.map((f) => `${f.t}s ${f.pane}`).join(' → '));
