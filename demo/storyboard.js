// The storyboard: the state at time t is a pure function of t (beats from build/storyboard.json),
// so film.mjs can render any frame. Live playback (?autoplay=1) just drives t from the clock.
(async () => {
  const q = new URLSearchParams(location.search);
  const layout = q.get('layout') || (innerWidth < 700 ? 'mobile' : 'desktop');
  document.documentElement.classList.add(layout);
  const sb = await (await fetch(`${q.get('build') || 'build'}/storyboard.json`)).json();

  // Desktop order: agents on the left, nodes on the right; the asker's side on top.
  const order = ['requester-agent', 'requester-node', 'responder-agent', 'responder-node'];
  const grid = document.getElementById('grid');
  const caption = document.getElementById('caption');
  const panes = Object.fromEntries(order.map((id) => {
    const p = sb.panes.find((x) => x.id === id);
    const el = document.createElement('section');
    el.className = 'pane';
    el.innerHTML = `<header><h2></h2>${p.note ? '<span class="note"></span>' : ''}</header><div class="lines"></div>`;
    el.querySelector('h2').textContent = p.title;
    if (p.note) el.querySelector('.note').innerHTML = p.note.replace(/^(\S+)/, '<code>$1</code>');
    grid.append(el);
    return [id, el];
  }));

  // How a line looks: its kind, and a dim timestamp or marker in front.
  const kind = (l) => l.kind === 'prompt' ? 'prompt'
    : /^(⏺|- |  )/.test(l.text) ? '' // the agents' own words keep the text colour
    : /ERROR/.test(l.text) ? 'err'
    : /^→/.test(l.text) ? 'cmd'
    : /ask from /.test(l.text) ? 'ask'
    : /answer|accepted|used your|INSERT 0|claimed|woke/.test(l.text) ? 'ok' : '';
  const render = (l, shown, typing) => {
    const p = document.createElement('p');
    p.className = `line ${kind(l)}`;
    const text = [...l.text].slice(0, shown).join('');
    const m = text.match(/^(\d\d:\d\d:\d\d  |[❯⏺→←✓] )?(.*)$/s);
    if (m[1]) { const s = document.createElement('span'); s.className = /\d/.test(m[1]) ? 'ts' : 'mark'; s.textContent = m[1]; p.append(s); }
    p.append(document.createTextNode(m[2]));
    if (typing) { const c = document.createElement('span'); c.className = 'cursor'; p.append(c); }
    return p;
  };

  // Cards: fill in their copy once.
  const $ = (sel) => document.querySelector(sel);
  $('#intro h1').textContent = sb.intro.title; $('#intro .tagline').textContent = sb.intro.tagline; $('#intro .teaser').textContent = sb.intro.teaser;
  $('#outro .tagline').textContent = sb.outro.tagline; $('#outro h1').textContent = sb.outro.title; $('#outro code').textContent = sb.outro.command; $('#outro .url').textContent = sb.outro.url;
  const clamp = (x) => Math.max(0, Math.min(1, x)), ease = (x) => x * x * (3 - 2 * x);
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const split = (s) => (s.match(/^(\d+)\s+(.*)$/) || [null, '', s]).slice(1);
  const title = $('#title'), dim = $('#dim');
  const cards = (t) => {
    let shade = 0;
    // Intro: fade in, the teaser a beat later, fade out.
    const iEnd = sb.intro.end;
    const io = Math.min(ramp(t, 0, 0.4), 1 - ramp(t, iEnd - 0.4, iEnd));
    $('#intro').style.opacity = io; $('#intro .teaser').style.opacity = ramp(t, 1.0, 1.4); shade = Math.max(shade, 0.9 * io);
    // Step title: centred and large, then down into the caption bar.
    const b = sb.beats.filter((x) => x.title && x.title.start <= t).pop();
    if (b && t <= b.title.end) {
      const [n, text] = split(b.caption);
      if (title.dataset.t !== String(b.title.start)) { title.querySelector('b').textContent = n; title.querySelector('span').textContent = text; title.dataset.t = b.title.start; }
      const p = ease(ramp(t, b.title.move, b.title.end));
      title.style.transform = 'translate(-50%, -50%)';
      const from = title.getBoundingClientRect(), to = caption.getBoundingClientRect();
      const s = 1 + (parseFloat(getComputedStyle(caption).fontSize) / parseFloat(getComputedStyle(title).fontSize) - 1) * p;
      const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) * p, dy = (to.top + to.height / 2 - (from.top + from.height / 2)) * p;
      title.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`;
      title.style.opacity = Math.min(ramp(t, b.title.start, b.title.start + 0.25), 1 - ramp(t, b.title.move + 0.55 * (b.title.end - b.title.move), b.title.end));
      shade = Math.max(shade, 0.72 * (1 - p));
    } else title.style.opacity = 0;
    // End card: holds until the loop restarts.
    const oo = ramp(t, sb.outro.start, sb.outro.start + 0.5);
    $('#outro').style.opacity = oo; shade = Math.max(shade, oo);
    dim.style.opacity = shade;
  };

  const MAX = 3; // lines kept in a pane
  const draw = (t) => {
    const beat = sb.beats.filter((b) => b.start <= t).pop();
    for (const [id, el] of Object.entries(panes)) {
      const lines = sb.beats.filter((b) => b.pane === id).flatMap((b) => b.lines).filter((l) => l.start <= t).slice(-MAX);
      const box = el.querySelector('.lines');
      box.replaceChildren(...lines.map((l, i) => {
        const shown = l.end <= l.start ? Infinity : Math.floor((t - l.start) * sb.rate);
        const node = render(l, shown, t < l.end);
        if (i < lines.length - 1) node.classList.add('old');
        return node;
      }));
      const on = beat && beat.pane === id;
      el.classList.toggle('active', !!on);
      if (layout === 'mobile') el.style.opacity = on ? Math.min(1, (t - beat.start) / 0.25) : 0;
    }
    // The caption bar takes over as the title lands in it.
    const c = sb.beats.filter((b) => b.caption && b.title.move <= t).pop();
    if (c) {
      const [n, text] = split(c.caption);
      if (caption.dataset.t !== String(c.start)) { caption.innerHTML = '<b></b><span></span>'; caption.querySelector('b').textContent = n; caption.querySelector('span').textContent = text; caption.dataset.t = c.start; }
      caption.style.opacity = ramp(t, c.title.move + 0.5 * (c.title.end - c.title.move), c.title.end);
    } else { caption.innerHTML = '<b></b><span></span>'; caption.dataset.t = ''; caption.style.opacity = 0; }
    cards(t);
  };

  window.replay = {
    duration: sb.duration,
    async renderAt(t) { draw(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); },
  };
  if (q.get('frames')) { draw(0); document.documentElement.dataset.ready = '1'; return; }
  const run = () => {
    const start = performance.now();
    const step = () => { const t = (performance.now() - start) / 1000; draw(t); if (t < sb.duration) requestAnimationFrame(step); else if (q.get('loop')) run(); else document.documentElement.dataset.done = '1'; };
    requestAnimationFrame(step);
  };
  if (q.get('autoplay')) run(); else { draw(sb.duration); document.documentElement.dataset.ready = '1'; }
})();
