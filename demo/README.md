# Demo video: "One question, two nodes"

This folder makes the looping video in the homepage section *One question, two nodes*. It replays a real exchange that was recorded in four terminals, puts the four panels side by side in a page, and films that page. It is not published. Only the videos and posters it writes to `site/demo/` are published.

| File | What it does |
| --- | --- |
| `casts/` | Input, not committed: the four recordings (`requester-agent`, `requester-node`, `responder-agent`, `responder-node`) as `.cast` files, each with a `.start` file holding its start time in epoch seconds |
| `edits.json` | Panel titles, and the lines to drop, dim or blank. Also the idle cap, the 2 s holds at key moments, and the captions |
| `prepare.mjs` | Cleans the casts and puts them on one shared, compressed clock. Writes `build/` (cleaned casts and `timeline.json`, not committed) |
| `replay.html`, `replay.css`, `replay.js` | The four-panel replay: a 2x2 grid on desktop, one panel at a time on mobile |
| `film.mjs` | Films the replay frame by frame and encodes `site/demo/one-question-two-nodes[-mobile].{webm,mp4}` and `poster[-mobile].jpg` |
| `vendor/asciinema-player/` | asciinema-player 3.17.0 (Apache-2.0), vendored so the page needs no CDN |

## Make the video

Needs Node 22+, ffmpeg and Google Chrome (or set `CHROME` to a Chromium binary).

```sh
cd demo
npm install                                  # playwright-core, and the player package
cp ~/wats-demo/casts/*.cast ~/wats-demo/casts/*.start casts/
node prepare.mjs                             # prints the edits, the length and where the captions land
node film.mjs --stills 3,10,20               # quick look: demo/frames/*.png
node film.mjs                                # desktop and mobile videos and posters, in site/demo/
```

To watch it live, serve this folder and open `replay.html?autoplay=1` (add `&layout=mobile` for the mobile layout, `&loop=1` to loop).

## Rules for editing a recording

- Only drop, dim or blank lines. Never reorder or invent anything. `prepare.mjs` prints every edit it makes.
- Compress idle time on the shared clock, never per panel, so the panels stay aligned. The gap between two significant events is capped. Spinners and counters in between are spread over the shorter gap. Text keeps its real pace.
- Scrub anything personal. The cleaned casts get new headers without `command`, `env` or `theme`, which carry local paths and host names.
