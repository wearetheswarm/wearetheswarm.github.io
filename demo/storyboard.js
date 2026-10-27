// The storyboard: the state at time t is a pure function of t (beats from build/storyboard.json),
// so film.mjs can render any frame. Live playback (?autoplay=1) just drives t from the clock.
// Stage: two machines, left to right (your machine, a swarm machine), with the network between them.
// Terminal lines come from the casts; the machines, the network pulse and the memory glyphs are a
// schematic of what happens, driven by the beats' `net`, `memory` and `spread`.
(async () => {
  const q = new URLSearchParams(location.search);
  const layout = q.get('layout') || (innerWidth < 700 ? 'mobile' : 'desktop');
  document.documentElement.classList.add(layout);
  const sb = await (await fetch(`${q.get('build') || 'build'}/storyboard.json`)).json();
  const $ = (sel, el = document) => el.querySelector(sel);
  const clamp = (x) => Math.max(0, Math.min(1, x)), ease = (x) => x * x * (3 - 2 * x);
  const ramp = (t, a, b) => clamp((t - a) / (b - a));
  const split = (s) => (s.match(/^(\d+)\s+(.*)$/) || [null, '', s]).slice(1);

  // --- the stage
  const DB = '<svg class="db" viewBox="0 0 24 28" aria-hidden="true"><path class="body" d="M3 5v18c0 2 4 3.5 9 3.5s9-1.5 9-3.5V5c0 2-4 3.5-9 3.5S3 7 3 5z"/><ellipse cx="12" cy="5" rx="9" ry="3.5"/><path d="M3 11.5c0 2 4 3.5 9 3.5s9-1.5 9-3.5M3 17.5c0 2 4 3.5 9 3.5s9-1.5 9-3.5"/></svg>';
  const world = $('#world');
  const machine = (name, ids) => {
    const m = document.createElement('section');
    m.className = 'machine';
    m.innerHTML = '<h3></h3><div class="cols"></div>';
    $('h3', m).textContent = name;
    for (const id of ids) {
      const p = sb.panes.find((x) => x.id === id);
      const el = document.createElement('div');
      el.className = 'pane';
      el.dataset.pane = id;
      el.innerHTML = `<header><span class="where"></span><h2></h2>${p.note ? '<span class="note"></span>' : ''}</header><div class="lines"></div>${p.memory ? `<footer class="memory">${DB}<span class="label">memory</span><span class="state"></span></footer>` : ''}`;
      $('.where', el).textContent = p.machine;
      $('h2', el).textContent = p.title;
      if (p.note) $('.note', el).textContent = p.note;
      $('.cols', m).append(el);
    }
    return m;
  };
  const band = document.createElement('div');
  band.className = 'band';
  band.innerHTML = `<span class="band-label">the network</span><div class="wire"><i class="pulse"></i></div><div class="copies">${DB.repeat(4)}</div><span class="copies-label">other nodes keep a copy</span>`;
  world.append(machine('Your machine', ['requester-agent', 'requester-node']), band, machine('A swarm machine', ['responder-node', 'responder-agent']));
  const panes = Object.fromEntries([...document.querySelectorAll('.pane')].map((el) => [el.dataset.pane, el]));
  const caption = $('#caption'), title = $('#title'), dim = $('#dim'), mobileWire = $('#mwire'), chip = $('#mchip');
  if (chip) chip.innerHTML = `${DB}<span class="label">Your node's memory</span><span class="state"></span>`;
  const mcopies = $('.mcopies'), mlabel = $('.mcopies-label');
  if (mcopies) mcopies.innerHTML = DB.repeat(4);

  // --- one terminal line
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

  // --- the schematic: network pulse, memory states, copies on other nodes
  const STATES = { searched: 'searched: nothing yet', stored: 'answer stored', found: 'found' };
  const schematic = (t) => {
    const crossing = sb.beats.find((b) => b.net && t >= b.net.start && t <= b.net.end + 0.4);
    const pulse = $('.pulse', band);
    if (crossing) {
      const p = ease(ramp(t, crossing.net.start, crossing.net.end)), x = crossing.net.dir === 'out' ? p : 1 - p;
      const fade = 1 - ramp(t, crossing.net.end, crossing.net.end + 0.4);
      pulse.style.left = `${x * 100}%`; pulse.style.opacity = fade;
      band.classList.add('busy');
      if (mobileWire) { mobileWire.style.opacity = fade; $('i', mobileWire).style.left = `${x * 100}%`; }
    } else { pulse.style.opacity = 0; band.classList.remove('busy'); if (mobileWire) mobileWire.style.opacity = 0; }
    for (const [id, el] of Object.entries(panes)) {
      const mem = $('.memory', el); if (!mem) continue;
      const ev = sb.beats.filter((b) => b.memory && b.memory[id] && b.start <= t).pop();
      const state = ev ? ev.memory[id] : '';
      mem.dataset.state = state;
      $('.state', mem).textContent = state ? STATES[state] : '';
      mem.classList.toggle('lit', !!ev && t - ev.start < 1.8);
      // Mobile shows one column: a chip at the top keeps your node's memory in view.
      if (chip && id === 'requester-node') { chip.dataset.state = state; $('.state', chip).textContent = state ? STATES[state] : ''; chip.style.opacity = state ? 1 : 0; chip.classList.toggle('lit', !!ev && t - ev.start < 1.8); }
    }
    const spread = sb.beats.find((b) => b.spread && b.start <= t);
    for (const box of [$('.copies', band), mcopies]) [...box.querySelectorAll('.db')].forEach((g, i) => g.classList.toggle('full', !!spread && t >= spread.start + 0.6 + i * 0.3));
    const said = spread ? ramp(t, spread.start + 0.6, spread.start + 1.0) : 0;
    $('.copies-label', band).style.opacity = said;
    // Mobile has no band: the copies come in beside the network bar, once the answer is stored.
    mcopies.style.opacity = spread ? ramp(t, spread.start, spread.start + 0.4) : 0; mlabel.style.opacity = said;
  };

  // --- cards (our own copy): intro, step titles, end card
  $('#intro h1').textContent = sb.intro.title; $('#intro .tagline').textContent = sb.intro.tagline; $('#intro .teaser').textContent = sb.intro.teaser;
  $('#outro .tagline').textContent = sb.outro.tagline; $('#outro h1').textContent = sb.outro.title; $('#outro code').textContent = sb.outro.command; $('#outro .url').textContent = sb.outro.url;
  const cards = (t) => {
    let shade = 0;
    const iEnd = sb.intro.end, io = Math.min(ramp(t, 0, 0.4), 1 - ramp(t, iEnd - 0.4, iEnd));
    $('#intro').style.opacity = io; $('#intro .teaser').style.opacity = ramp(t, 1.0, 1.4); shade = Math.max(shade, 0.9 * io);
    const b = sb.beats.filter((x) => x.title && x.title.start <= t).pop();
    if (b && t <= b.title.end) {
      const [n, text] = split(b.caption);
      if (title.dataset.t !== String(b.title.start)) { $('b', title).textContent = n; $('span', title).textContent = text; title.dataset.t = b.title.start; }
      const p = ease(ramp(t, b.title.move, b.title.end));
      title.style.transform = 'translate(-50%, -50%)';
      const from = title.getBoundingClientRect(), to = caption.getBoundingClientRect();
      const s = 1 + (parseFloat(getComputedStyle(caption).fontSize) / parseFloat(getComputedStyle(title).fontSize) - 1) * p;
      const dx = (to.left + to.width / 2 - (from.left + from.width / 2)) * p, dy = (to.top + to.height / 2 - (from.top + from.height / 2)) * p;
      title.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`;
      title.style.opacity = Math.min(ramp(t, b.title.start, b.title.start + 0.25), 1 - ramp(t, b.title.move + 0.55 * (b.title.end - b.title.move), b.title.end));
      shade = Math.max(shade, 0.72 * (1 - p));
    } else title.style.opacity = 0;
    const oo = ramp(t, sb.outro.start, sb.outro.start + 0.5);
    $('#outro').style.opacity = oo; shade = Math.max(shade, oo);
    dim.style.opacity = shade;
  };

  // --- one frame
  const MAX = 2; // lines kept in a column
  const draw = (t) => {
    const beat = sb.beats.filter((b) => b.start <= t).pop();
    for (const [id, el] of Object.entries(panes)) {
      const lines = sb.beats.filter((b) => b.pane === id).flatMap((b) => b.lines).filter((l) => l.start <= t).slice(-MAX);
      $('.lines', el).replaceChildren(...lines.map((l, i) => {
        const node = render(l, l.end <= l.start ? Infinity : Math.floor((t - l.start) * sb.rate), t < l.end);
        if (i < lines.length - 1) node.classList.add('old');
        return node;
      }));
      const on = beat && beat.pane === id;
      el.classList.toggle('active', !!on);
      if (layout === 'mobile') el.style.opacity = on ? Math.min(1, (t - beat.start) / 0.25) : 0;
    }
    const c = sb.beats.filter((b) => b.caption && b.title.move <= t).pop();
    if (c) {
      const [n, text] = split(c.caption);
      if (caption.dataset.t !== String(c.start)) { caption.innerHTML = '<b></b><span></span>'; $('b', caption).textContent = n; $('span', caption).textContent = text; caption.dataset.t = c.start; }
      caption.style.opacity = ramp(t, c.title.move + 0.5 * (c.title.end - c.title.move), c.title.end);
    } else { caption.innerHTML = '<b></b><span></span>'; caption.dataset.t = ''; caption.style.opacity = 0; }
    schematic(t);
    cards(t);
  };

  window.replay = {
    duration: sb.duration,
    poster: sb.poster,
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
