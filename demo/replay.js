// Four asciinema players on one clock. The clock is either live (?autoplay=1) or driven frame by
// frame by film.mjs (?frames=1), which seeks every player to the same time before each screenshot.
(async () => {
  const q = new URLSearchParams(location.search);
  const layout = q.get('layout') || (innerWidth < 700 ? 'mobile' : 'desktop');
  const build = q.get('build') || 'build';
  const speed = parseFloat(q.get('speed') || '1');
  document.documentElement.classList.add(layout);

  const timeline = await (await fetch(`${build}/timeline.json`)).json();
  // Desktop order: agents on the left, nodes on the right; the asker's side on top.
  const order = ['requester-agent', 'requester-node', 'responder-agent', 'responder-node'];
  const panes = order.map((id) => timeline.panes.find((p) => p.id === id)).filter(Boolean);

  const grid = document.getElementById('grid');
  const caption = document.getElementById('caption');
  const players = panes.map((p) => {
    const el = document.createElement('section');
    el.className = 'panel';
    el.dataset.pane = p.id;
    el.innerHTML = `<header><h2></h2>${p.note ? '<span class="note"></span>' : ''}</header><div class="clip"><div class="term"></div></div>`;
    el.querySelector('h2').textContent = p.title;
    if (p.note) el.querySelector('.note').innerHTML = p.note.replace(/^(\S+)/, '<code>$1</code>');
    grid.append(el);
    const player = AsciinemaPlayer.create({ url: `${build}/${p.id}.cast` }, el.querySelector('.term'), {
      autoPlay: false, preload: true, controls: false, loop: false, speed, theme: 'wats', cursorMode: 'hidden',
      // Mobile: a fixed 12 px font, cropped to a window of the last lines (see crop below).
      ...(layout === 'mobile' ? { fit: false, terminalFontSize: '12px' } : { fit: 'both' }), terminalFontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', terminalLineHeight: 1.25,
    });
    return { pane: p, el, player };
  });

  // Wait until every recording is loaded.
  const loaded = () => players.every((x) => x.player.getDuration() !== undefined);
  while (!loaded()) await new Promise((r) => setTimeout(r, 50));

  const at = (list, t) => list.filter((x) => x.t <= t).pop();
  const fade = (t, since, len = 0.3) => Math.max(0, Math.min(1, (t - since) / len));
  // Captions, focus and (on mobile) which panel shows: a pure function of t, so frames are reproducible.
  const decorate = (t) => {
    const c = at(timeline.captions, t);
    if (c) {
      const [, n, text] = c.text.match(/^(\d+)\s+(.*)$/) || [null, '', c.text];
      if (caption.dataset.t !== String(c.t)) { caption.innerHTML = n ? '<b></b><span></span>' : '<span></span>'; if (n) caption.querySelector('b').textContent = n; caption.querySelector('span').textContent = text; caption.dataset.t = c.t; }
      caption.style.opacity = fade(t, c.t);
    } else { caption.textContent = ''; caption.dataset.t = ''; }
    const f = at(timeline.focus, t) || timeline.focus[0];
    for (const x of players) {
      const on = x.pane.id === f.pane;
      x.el.classList.toggle('active', on);
      if (layout === 'mobile') { x.el.style.opacity = on ? fade(t, f.t, 0.25) : 0; if (on) crop(x); }
      else x.el.querySelector('.term').style.opacity = on ? 1 : 0.5;
    }
  };

  // Mobile crop: show the last `rows` non-empty lines; the panel's width cuts at about 50 columns.
  const rows = 12;
  const crop = (x) => {
    if (q.get('nocrop')) return;
    const lines = [...x.el.querySelectorAll('.ap-line')];
    const last = lines.findLastIndex((l) => l.textContent.trim());
    const top = Math.max(0, last - rows + 1);
    const term = x.el.querySelector('.term');
    if (lines[1]) term.style.transform = `translateY(${-(lines[1].offsetTop - lines[0].offsetTop) * top}px)`;
  };

  const seekAll = (t) => Promise.all(players.map((x) => x.player.seek(Math.min(t, x.player.getDuration()))));

  window.replay = {
    duration: timeline.duration,
    async renderAt(t) {
      await seekAll(t);
      await new Promise((r) => requestAnimationFrame(r)); // let the players draw before measuring lines
      decorate(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    },
  };

  if (q.get('frames')) { await window.replay.renderAt(0); document.documentElement.dataset.ready = '1'; return; }

  // Live playback on one clock: start all players together, decorate from elapsed time.
  const run = async () => {
    await seekAll(0);
    for (const x of players) { await x.player.pause(); }
    await Promise.all(players.map((x) => x.player.play()));
    const start = performance.now();
    const step = () => {
      const t = ((performance.now() - start) / 1000) * speed;
      decorate(t);
      if (t < timeline.duration) requestAnimationFrame(step);
      else if (q.get('loop')) run(); else document.documentElement.dataset.done = '1';
    };
    requestAnimationFrame(step);
  };
  if (q.get('autoplay')) run(); else { decorate(0); document.documentElement.dataset.ready = '1'; }
})();
