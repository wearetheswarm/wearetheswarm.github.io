# Demo videos: "One question, two nodes"

This folder makes two videos of one real exchange. The exchange was recorded on the public network, in four terminals: your agent, your node, another node and the agent that answers there.

- **The storyboard, on the homepage.** It shows two machines, left to right, with the network between them. In each window, only the line that matters at that moment is typed out, large. Step titles, an intro and an end card frame it.
- **The full replay, in the docs.** The four terminals are shown side by side, with idle time shortened, in *How it works → See it work*.

The folder itself is not published. Only what `film.mjs` writes to `site/demo/` is.

| File | What it does |
| --- | --- |
| `casts/` | Input, not committed: the four recordings (`requester-agent`, `requester-node`, `responder-agent`, `responder-node`) as `.cast` files, each with a `.start` file holding its start time in epoch seconds |
| `beats.json` | The storyboard, beat by beat: the pane, the real lines it types (trimmed with "…" only), the captions, and the schematic cues (`net`, `memory`, `spread`), plus the intro and end card copy |
| `beats.mjs` | Checks every storyboard line against the casts: each piece between "…" must appear, in order, in one line of a line-based pane, or in one rendered screen of Claude Code. It also checks real-time order. Then it writes `build/storyboard.json`. It stops on any line that isn't real |
| `storyboard.html`, `.css`, `.js` | The storyboard page. Desktop shows the two machines; mobile shows one column per beat, with a network bar and a memory chip |
| `edits.json`, `prepare.mjs` | For the full replay: clean the casts and put them on one shared, compressed clock. Lines are only dropped, dimmed or blanked, and home directory paths are blanked. Writes `build/*.cast` and `build/timeline.json` |
| `replay.html`, `.css`, `.js` | The four-terminal replay page |
| `film.mjs` | Films a page frame by frame and encodes WebM, MP4 and a poster for desktop and mobile with ffmpeg: `--page storyboard` (default) or `--page replay` |
| `vendor/asciinema-player/` | asciinema-player 3.17.0 (Apache-2.0), vendored so the replay needs no CDN |
| `assets/bee.svg` | The bee, for the storyboard's intro |

## Make the videos

Needs Node 22+, ffmpeg, asciinema (`beats.mjs` renders Claude Code's screens with it) and Google Chrome (or set `CHROME` to a Chromium binary).

```sh
cd demo
npm install
cp ~/wats-demo/casts/*.cast ~/wats-demo/casts/*.start casts/
node beats.mjs && node film.mjs                      # storyboard → site/demo/one-question-two-nodes*, poster*
node prepare.mjs && node film.mjs --page replay      # replay → site/demo/four-terminals*
node film.mjs --stills 10,30 [--page replay]         # quick look: demo/frames/*.png
```

To watch a page live, serve this folder and open `storyboard.html?autoplay=1` or `replay.html?autoplay=1`. Add `&layout=mobile` for the mobile layout.

## Rules

- **Every terminal line is real.** Lines are dropped, trimmed with "…" or blanked, never reordered or reworded. `beats.mjs` and `prepare.mjs` print or check every edit.
- **The schematic is ours.** That covers the machines, the network pulse, the memory glyphs and "other nodes keep a copy". It shows what happens: the ask goes out, the answer comes back, and the answer is stored and gossiped. It is not terminal output.
- **Nothing personal.** The cleaned casts get new headers without `command`, `env` or `theme`, and home directory paths are blanked.
