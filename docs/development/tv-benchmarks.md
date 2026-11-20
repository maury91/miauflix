# TV benchmarks

Frame timing measured on a Samsung TV, kept for comparing builds. Add a new dated section for each
run, with the same scenarios where they still apply, rather than editing old results. The plan
these numbers feed is [tv-performance-plan.md](../plans/tv-performance-plan.md), whose own baseline
(build `cad67322`) used the same "four Right presses, 600 ms apart" scenario.

## How to measure

1. Install the build on the TV (`scripts/install-tizen.sh`) and open its DevTools at
   `127.0.0.1:9222` with `node scripts/tv-debug.mjs <tv-ip>`: it closes the app, launches it in
   debug mode over SDB (no Tizen SDK needed) and forwards the inspector until stopped. Quit the
   Apps2Samsung desktop app first: while it's open it holds the TV's only SDB connection, and
   installs and the debug launch get `Connection reset by peer`. A reinstall ends the debug
   session; run the script again. `localStorage['miauflix:gl-tuning'] = '{}'`, then a reload
   (it's read at start), exposes the GL stats as `window.__glRows` without changing anything else.
2. Run the scenarios with [`scripts/tv-bench.mjs`](../../scripts/tv-bench.mjs). It finds the
   Miauflix page, sends remote keys over the DevTools protocol, and records
   `requestAnimationFrame` intervals between `start` and `stop`:

   ```bash
   node scripts/tv-bench.mjs '[{"start":true},{"key":"ArrowRight","repeat":4,"delay":600},{"stop":true}]'
   ```

   A `{"state":true}` step prints the page, its heading, the element under virtual focus and the
   one with DOM focus. Check it before a scenario: a move that hits the end of a row measures
   nothing.

3. Start each scenario cold: `{"reload":true}` reloads the page, then wait for Home's first focused
   card (the profile is remembered, so the app opens on Home after its intro).

### The standard scenario: Home, cold

Run it three times and record each run:

```bash
node scripts/tv-bench.mjs '[
  {"reload":true},
  {"until":"document.querySelector(\"button[data-focused][aria-labelledby]\")","ms":60000},
  {"wait":2000},
  {"key":"ArrowDown","repeat":2,"delay":1500},{"wait":1500},
  {"start":true},{"key":"ArrowRight","repeat":4,"delay":600},{"stop":true},
  {"wait":1500},
  {"start":true},{"key":"ArrowLeft","repeat":4,"delay":600},{"stop":true}
]'
```

It moves down to the third row, then measures four Right presses along it (a first pass: cards
mounted, decoded and rasterized as they come in) and four Left presses back over those cards.
Measure on rows long enough for every press to move: a press at a row's end measures nothing.
Continue watching (the first row here) holds only 3 titles, so it isn't used.

What the numbers mean:

- **fps**: frames drawn over the recorded time. 60 is the TV's refresh rate.
- **p50, p90, p95, max**: frame durations. A frame over 34 ms means at least one missed refresh;
  over 50 ms is a visible stutter.
- Each scenario's window includes the waits between presses, so the frame rate averages moving and
  settling.

Caveats:

- DevTools being attached costs a little.
- Screenshots aren't available: Tizen 5.5 never answers `Page.captureScreenshot`.
- Results move by a few fps between runs. Repeat a scenario before calling a change a regression.

## 2026-11-17: design-system phase 5

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Build:** `3367216a` plus the uncommitted phase 5 work: Home's panels as lists, the Settings
  panel, Who's watching and the profile editor on the navigation layer.
- **Profile:** one profile (Miau), signed in, 4 unread notifications.

Scenarios marked † were measured before the script existed: the probe didn't time its window or
report p90, and they didn't start cold, so they have no frame rate. Compare them by their frame
durations only. The editor's two "at rest" rows were measured the same way, but over a fixed 4 s
wait, so their frame rate is known.

### Home, the standard scenario (cold)

| Run | Row 3 first pass, 4 × Right               | Row 3, 4 × Left back                     |
| --: | ----------------------------------------- | ---------------------------------------- |
|   1 | 23 fps, p90 101.5, max 146, 23 over 50 ms | not run                                  |
|   2 | 25 fps, p90 94.1, max 181, 23 over 50 ms  | 39 fps, p90 56.5, max 152, 15 over 50 ms |
|   3 | 23 fps, p90 104.6, max 197, 18 over 50 ms | 41 fps, p90 68.8, max 138, 18 over 50 ms |

Frame durations in ms. Reloading takes about 10.5 s to the first focused card.

### Home, other scenarios

| Scenario                                                             | fps |  p50 |  p90 |   p95 | max | Over 34 / 50 ms |
| -------------------------------------------------------------------- | --: | ---: | ---: | ----: | --: | --------------: |
| At rest on Continue watching, 4 s                                    |  59 | 16.9 | 16.9 |  17.0 |  23 |           0 / 0 |
| 4 × Right, 600 ms apart, first pass over a row's cards (row 3)       |  23 | 29.0 | 95.2 | 142.9 | 150 |         29 / 20 |
| Same, the next row (row 4)                                           |  25 | 19.3 | 89.4 | 134.0 | 186 |         28 / 22 |
| 4 × Left back over the same cards (row 4)                            |  38 | 16.9 | 63.9 |  89.8 | 120 |         21 / 18 |
| 4 × Right, 600 ms apart, Continue watching just after opening Home † |   – | 20.7 |    – | 118.2 | 182 |          24 / – |
| Hold Right 2.5 s (Continue watching) †                               |   – | 17.2 |    – | 101.4 | 152 |          27 / – |
| Hold Left 2.5 s, ran off the first card onto the rail †              |   – | 20.3 |    – |  82.7 | 107 |          33 / – |
| 3 × Down, 800 ms apart †                                             |   – | 21.9 |    – | 112.5 | 193 |          26 / – |
| Hold Down 2 s †                                                      |   – | 21.6 |    – | 185.3 | 273 |          18 / – |
| Hold Up 3 s, back to the first row †                                 |   – | 31.5 |    – | 127.0 | 534 |          38 / – |

The † rows on Continue watching (3 titles) include presses that moved nothing at the row's ends.

Compared with [tv-performance-plan.md](../plans/tv-performance-plan.md): after its phase 1, the
same four presses ran at 44–49 fps on a first pass along a row and 53 fps going back over cards.
A first pass now runs at 23–25 fps, with 18–23 frames over 50 ms, in every run, and going back
over those cards at 38–41 fps. The first pass is the regression to look at next:
mounting, decoding and rasterizing cards not shown before (`MediaTile` since phase 5).

### Home's side-menu panels

| Scenario                                                  | fps |  p50 |  p95 | max | Over 34 ms |
| --------------------------------------------------------- | --: | ---: | ---: | --: | ---------: |
| Right from the bell into the notifications panel, 1.5 s † |   – | 16.9 | 17.1 |  51 |          1 |
| Hold Down 4 s in the notifications panel †                |   – | 16.9 | 17.3 |  34 |          0 |

The profile and settings panels behaved the same; their frames weren't recorded separately.

### Search

| Scenario                                            | fps |  p50 |  p95 | max | Over 34 ms |
| --------------------------------------------------- | --: | ---: | ---: | --: | ---------: |
| 3 × Right on the on-screen keyboard, 500 ms apart † |   – | 16.9 | 17.0 |  35 |          1 |

### Who's watching

| Scenario                                                     | fps |  p50 |  p95 | max | Over 34 ms |
| ------------------------------------------------------------ | --: | ---: | ---: | --: | ---------: |
| Right, Left, Right, Left, 700 ms apart (one profile + Add) † |   – | 29.6 | 52.2 |  97 |         34 |
| At rest with the live Plushie, 3 s †                         |   – | 16.9 | 38.0 |  49 |         19 |

### Profile editor

The live Plushie preview is a 562 × 562 canvas (52vh, the same size as before the redesign).

| Scenario                                                                | fps |   p50 |    p95 |  max | Over 34 ms |
| ----------------------------------------------------------------------- | --: | ----: | -----: | ---: | ---------: |
| At rest, 4 s                                                            |  13 |  16.9 |  162.0 |  179 |         23 |
| At rest with the Plushie canvas hidden, 4 s                             |  59 |  16.9 |   17.0 |   34 |          0 |
| One Right between colour swatches, 1.5 s †                              |   – |  16.9 |  159.2 |  184 |          8 |
| Choose a colour with OK, 2.5 s †                                        |   – | 151.3 | 1369.5 | 1370 |         17 |
| Down through the form (name, tabs, colours, fabrics, Fine-tune, Save) † |   – |  16.9 |  165.7 | 1525 |         36 |

All of the editor's cost at rest is the live Plushie: hiding its canvas brings the page to 59 fps.
Choosing a colour stalls one frame for about 1.4 s while the Plushie is redrawn.

## 2026-11-17: Home rows, compositing layers

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Build:** the phase 5 build above, before and after three CSS rules: the carousel viewport is a
  stacking context (`z-index: 0`), and at TV density the track keeps its own layer
  (`will-change: transform`) and the tile's focus scale has no transition.
- **Profile:** one profile (Miau), signed in. Each reinstall forgets the remembered profile:
  choose it once (OK on Who's watching) before the first cold run, or the scenario measures Who's
  watching.

### Home, the standard scenario (cold)

| Build  | Run | Row 3 first pass, 4 × Right               | Row 3, 4 × Left back                      |
| ------ | --: | ----------------------------------------- | ----------------------------------------- |
| Before |   1 | 23 fps, p90 101.3, max 154, 25 over 50 ms | 41 fps, p90 51.2, max 101, 13 over 50 ms  |
| Before |   2 | 32 fps, p90 85.3, max 135, 19 over 50 ms  | 28 fps, p90 101.4, max 135, 19 over 50 ms |
| Before |   3 | 32 fps, p90 69.6, max 152, 19 over 50 ms  | 36 fps, p90 74.9, max 136, 17 over 50 ms  |
| Before |   4 | 28 fps, p90 76.3, max 171, 19 over 50 ms  | 31 fps, p90 85.8, max 146, 20 over 50 ms  |
| Before |   5 | 17 fps, p90 126.1, max 191, 24 over 50 ms | 33 fps, p90 72.7, max 118, 18 over 50 ms  |
| Before |   6 | 22 fps, p90 120.8, max 163, 24 over 50 ms | 29 fps, p90 84.5, max 135, 17 over 50 ms  |
| After  |   1 | 34 fps, p90 64.6, max 153, 18 over 50 ms  | 47 fps, p90 30.2, max 88, 7 over 50 ms    |
| After  |   2 | 42 fps, p90 51.4, max 111, 15 over 50 ms  | 50 fps, p90 29.4, max 96, 4 over 50 ms    |
| After  |   3 | 48 fps, p90 46.2, max 126, 13 over 50 ms  | 50 fps, p90 34.0, max 68, 6 over 50 ms    |
| After  |   4 | 47 fps, p90 44.1, max 126, 13 over 50 ms  | 48 fps, p90 37.5, max 110, 8 over 50 ms   |
| After  |   5 | 26 fps, p90 78.4, max 226, 23 over 50 ms  | 48 fps, p90 36.3, max 85, 11 over 50 ms   |

Frame durations in ms. Before runs 1–3 are the install the phase 5 section measured, 4–6 a
reinstall of the same build; after runs 1–5 are one install. A cold first pass still varies from
run to run (26 and 34 fps against 42–48): it overlaps rows and images still arriving after the reload.

### What changed

Compositing layers, counted over `LayerTree.layerTreeDidChange` around one Right press:

| Build  | At rest | During a move (about 550 ms) |
| ------ | ------: | ---------------------------: |
| Before |      23 |                      110–117 |
| After  |      90 |                        90–96 |

Before, the track slid on a transition without a layer of its own, and the focused tile animated
its scale. Chromium can't tell where an animated element will be, so it assumed both overlapped
everything painted after them in the page's stacking context: every later row's slots (each placed
with its own `translateX`, so they couldn't be squashed), edge fades and clips took a layer for the
length of each move, were rasterized afresh and painted back into the page afterwards. The two
tiles' scale animation alone added about ten layers inside the row. Rasterization over four first
pass presses went from about 2.6 s to 1 s across the tile workers.

The rules were first tried by injecting CSS into the running page (same scenario, three runs each):

| Injected                                                   | First pass, fps | Back, fps |
| ---------------------------------------------------------- | --------------: | --------: |
| Viewport stacking context, no tile scale transition        |           25–38 |     44–48 |
| The same, and no artwork fade-in                           |           28–35 |     37–46 |
| Viewport stacking context, no tile transition, track layer |           41–48 |     51–59 |
| The same, and no artwork fade-in                           |           40–45 |     51–55 |

The artwork's fade-in made no difference beyond the noise, so it is kept.

### What is left

Traces of two first passes on the new build: about 13 ms of `UpdateLayerTree` per main frame while
a row slides (it walks the paint layers of every mounted card, as measured in
[tv-performance-plan.md](../plans/tv-performance-plan.md)), the row's render on each key (about
50 ms), and the hero's backdrop swap after each rested press (`MediaHero`'s reveal frame, up to
62 ms). The same costs bounded the plan's last measurement at 44–49 fps.

## 2026-11-17: Home, React work per move

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Build:** before is the compositing-layers build above (`index-BCSKZwEL.js`); after adds the
  changes below (`index-C79WriRR.js`). Same stylesheet (`style-CTDoe-cC.css`).
- **Profile:** one profile (Miau), signed in. Both installs were measured the same day, the after
  build first.

### What a move renders

Counted with [`scripts/react-commit-probe.js`](../../scripts/react-commit-probe.js), a React
DevTools-style hook injected before the app boots (see "Counting React commits" below). One Right
press on row 3, at rest before and after:

- **Before:** the row (`CategoryRow`, its title, `Carousel`, the two tiles whose focus changed and
  one card mounted); the row again (the coalesced selection); then Home, the hero and the row a
  third time (Home passed it the new remembered card).
- **After:** `Carousel`, the two tiles whose focus changed and one card mounted; then, on the next
  task, Home and the hero. No row renders.

Each repeat of a held Right is now only the first of those commits. What else follows a press in
the log isn't the move itself: pages of other rows and their artwork arriving, the focused title's
details prefetch and preparation status reaching the hero, and the viewport promotion request.

A trace of 2.5 s of held Right (Right auto-repeating every 50 ms, row 3, cold):

| Build  | Keydown handling, median / max | All JavaScript | `UpdateLayerTree` (frames, median per frame) |
| ------ | -----------------------------: | -------------: | -------------------------------------------: |
| Before |                    34 / 124 ms |        1360 ms |                         914 ms (39, 31.5 ms) |
| After  |                     17 / 46 ms |         809 ms |                        1540 ms (60, 29.6 ms) |

A single rested press took 51 ms of keydown handling before. With less JavaScript, the main thread
draws more frames, and each frame of the slide spends about 30 ms in `UpdateLayerTree`: Chromium
walks every paint layer of the page, and Home has about 1,000 (992 positioned elements, 15 rows and
75 cards mounted, about 13 positioned elements per card). That alone keeps a slide under 30 fps.

### Home, the standard scenario (cold)

| Build  | Run | Row 3 first pass, 4 × Right              | Row 3, 4 × Left back                     |
| ------ | --: | ---------------------------------------- | ---------------------------------------- |
| Before |   1 | 44 fps, p90 50.7, max 124, 15 over 50 ms | 45 fps, p90 38.7, max 109, 10 over 50 ms |
| Before |   2 | 47 fps, p90 49.0, max 134, 13 over 50 ms | 51 fps, p90 30.9, max 86, 8 over 50 ms   |
| Before |   3 | 46 fps, p90 49.5, max 125, 13 over 50 ms | 50 fps, p90 30.2, max 80, 6 over 50 ms   |
| After  |   1 | 39 fps, p90 51.3, max 87, 12 over 50 ms  | 46 fps, p90 34.4, max 81, 8 over 50 ms   |
| After  |   2 | 46 fps, p90 56.5, max 88, 18 over 50 ms  | 51 fps, p90 28.0, max 73, 6 over 50 ms   |
| After  |   3 | 46 fps, p90 51.0, max 140, 15 over 50 ms | 53 fps, p90 34.0, max 74, 11 over 50 ms  |

Frame durations in ms. A fourth before run is left out: its Down presses arrived before Home was
ready, and it measured Continue watching.

### Home, held Right and Down (cold, from row 3)

| Scenario               | Before, fps | After, fps |
| ---------------------- | ----------: | ---------: |
| Hold Right 2.5 s       |  19, 11, 16 | 11, 14, 15 |
| 3 × Down, 800 ms apart |  30, 32, 28 | 34, 25, 38 |

Two more after runs of held Right gave 16 and 13 fps.

### What it means

The React work per move is down to the renders a move needs, and the worst frames of a first pass
are shorter (max 87–140 ms against 124–134 ms), but the frame rate is the same within the noise
in every scenario. JavaScript no longer limits Home on the TV: the paint layers of everything
mounted do. Hiding the 11 rows off screen (`display: none`, injected) raised held Right from 11–15
to 23–27 fps.

Against the WebGL spike (first pass about 60 fps, held Right 53–54, Down 59), the DOM build is
still 14–21 fps short on a first pass, about 40 fps short when holding Right and about 25 fps short
moving down.

### Counting React commits

Inject the probe before a reload, then record around the keys:

```bash
node scripts/tv-bench.mjs '[
  {"inject":"scripts/react-commit-probe.js"},{"reload":true},
  {"until":"document.querySelector(\"button[data-focused][aria-labelledby]\")","ms":60000},
  {"wait":2000},{"key":"ArrowDown","repeat":2,"delay":1500},{"wait":2500},
  {"eval":"__reactCommits.start()"},{"key":"ArrowRight","delay":1200},{"eval":"__reactCommits.report()"}
]'
```

The report lists each commit with the components that rendered and why (`state#n` for the hooks
whose state changed, `props:` for the props that did, `parent` when the parent re-rendered with
equal props, `mount`), and the Redux store notifications with the slices each one changed. The
TV build is minified, so components without a readable name show the start of their source.
`{"profile":"start"}` and `{"profile":"stop","out":"file.cpuprofile"}` record a CPU profile around
any steps.

## 2026-11-17: Home cards without their logo

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Build:** the compositing-layers build (`index-BCSKZwEL.js`), with and without a stylesheet
  injected after each reload that hides every card's logo (`display: none` on the logo's box), so
  each card draws one image instead of two. Runs alternate between the two.
- **Why:** a card is two images, its backdrop and the title logo over it. If one image is
  measurably cheaper, a card image with the logo drawn into it keeps the look at the cost of one.

### Home, the standard scenario (cold)

| Logo  | Row 3 first pass, 4 × Right (fps) | Row 3, 4 × Left back (fps) |
| ----- | --------------------------------- | -------------------------- |
| Shown | 30, 32, 39, 40, 37 (mean 36)      | 49, 48, 47, 47, 52         |
| None  | 50, 42, 40, 44, 37 (mean 43)      | 50, 49, 50, 48, 51         |

Two runs are left out (one of each): their Down presses arrived before Home was ready, and they
measured Continue watching. Held Right 2.5 s, from row 3: 19 and 19 fps with logos, 16, 23 and 16
without.

### What it means

Without logos a first pass along a row is about 7 fps faster on average (the ranges overlap:
37–50 against 30–40), and it has fewer long frames. Going back over cards already drawn and
holding Right don't change: the logo costs when a card is first drawn (decoding and rasterizing a
second image), not when cards already drawn move.

## 2026-11-17: Home card images (backdrop and logo in one picture)

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Build:** card images (`index-DAutGvJQ.js`): each Home card asks the backend for
  `/api/artwork/card/:type/:id/sm.jpg` (384×216, the logo drawn above the episode line) and falls
  back to the backdrop and logo layers if it fails.
- **Serving:** the endpoint was not deployed. `tv-bench.mjs`'s `serve` step answered the TV's card
  image requests through DevTools request interception, with images drawn beforehand by the
  catalog's `CardImageService` for the 278 titles on Home (`sm`, baseline JPEG at 82, about 21 KB
  each, or WebP at 80, about 15 KB). **Layers** answers 404, so every card falls back to today's
  two images. About 13 cards per run were titles missing from the drawn set and stayed two layers.
- **Scenario:** the standard one (row 3, Heart of the Beast first in every run), then held Right
  2.5 s and 3 × Down. Four rounds, each alternating layers, JPEG and WebP.

| Cards  | Row 3 first pass, 4 × Right (fps) | 4 × Left back (fps) | Held Right 2.5 s (fps) | 3 × Down (fps) |
| ------ | --------------------------------- | ------------------- | ---------------------- | -------------- |
| Layers | 21, 33, 43, 42 (mean 35)          | 44, 50, 49, 40      | 10, 11, 18, 8          | 19, 28, 21, 20 |
| JPEG   | 42, 41, 37, 46 (mean 41.5)        | 42, 54, 51, 54      | 15, 14, 17, 12         | 25, 18, 19, 21 |
| WebP   | 53, 40, 41, 52 (mean 46.5)        | 52, 55, 50, 46      | 15, 11, 16, 15         | 18, 19, 27, 20 |

The first layers run was the first after the install, and its 21 fps may include colder caches;
without it, layers average 39.

### What it means

One image per card makes a first pass along a row faster (41.5 and 46.5 fps on average against 35,
or 39 without the first layers run; the logo-less cards measured 7 fps faster earlier today), going back over drawn cards a little
faster (46 to 50), and holding Right about 3 fps faster; moving between rows does not change.
WebP and JPEG are within the noise of each other in the scenario (WebP's 5 fps lead on a first
pass is smaller than either's spread). Decoding alone decides it: drawing 80 card images to a
canvas right after they load took 6.3, 6.2 and 5.9 ms per image in JPEG (p90 about 8 ms) against
9.6, 9.7 and 10.4 ms in WebP (p90 13 to 18 ms), three runs each. The TV asks for baseline JPEG;
browsers, which decode either quickly, ask for the quarter-smaller WebP.

## 2026-11-17: Home rows drawn with WebGL (spike)

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, 1920×1080, device pixel ratio 1.
- **Builds:** the same code twice, `3367216a` plus the uncommitted work of the sections above (per
  move React work, card images, row layers) plus the GL rows spike. **DOM** has the flag off
  (`index-COZ0CHR2.js`); **GL** is packaged with `MIAUFLIX_TV_GL_ROWS=true` (`index-CuzzYiVn.js`):
  Home's rows (titles, carousels, tiles, artwork, logos, progress, focus outline and scale, edge
  fades, the slides along and between rows) are drawn by the design-system components into one
  WebGL canvas, with React and the navigation layer driving them as before. The hero, rail and
  panels stay DOM. See [the GL rows plan](../plans/tv-gl-rows-plan.md).
- **Serving:** card images live from the server. GL measured first, then DOM, both cold.

### Home, the standard scenario (cold)

| Build | Run | Row 3 first pass, 4 × Right              | Row 3, 4 × Left back                    |
| ----- | --: | ---------------------------------------- | --------------------------------------- |
| DOM   |   1 | 59 fps, p90 35.2, max 120, 11 over 50 ms | 51 fps, p90 28.9, max 99, 4 over 50 ms  |
| DOM   |   2 | 51 fps, p90 44.9, max 95, 14 over 50 ms  | 54 fps, p90 28.5, max 76, 5 over 50 ms  |
| DOM   |   3 | 50 fps, p90 50.2, max 102, 15 over 50 ms | 53 fps, p90 29.2, max 106, 9 over 50 ms |
| GL    |   1 | 54 fps, p90 26.5, max 58, 3 over 50 ms   | 55 fps, p90 23.5, max 46, 0 over 50 ms  |
| GL    |   2 | 55 fps, p90 26.7, max 75, 2 over 50 ms   | 55 fps, p90 22.5, max 58, 2 over 50 ms  |
| GL    |   3 | 55 fps, p90 26.6, max 52, 2 over 50 ms   | 56 fps, p90 22.2, max 52, 1 over 50 ms  |

### Home, held Right and Down (cold, from row 3)

| Scenario               | DOM, fps   | GL, fps    |
| ---------------------- | ---------- | ---------- |
| Hold Right 2.5 s       | 14, 17, 15 | 36, 33, 40 |
| 3 × Down, 800 ms apart | 27, 32, 35 | 51, 49, 47 |

The renderer drew about 40 quads in 2 draw calls per frame, in 1–2 ms of JavaScript (7 ms at
most); about 33 images were uploaded per run at about 1.3 ms each, none failed, and textures held
about 11 MB.

### What it means

- **A first pass along a row** is about the same frame rate (DOM 50–59, GL 54–55), but GL has far
  fewer long frames: p90 26.5 ms against 35–50 ms, at most 3 frames over 50 ms against 11–15, and
  no frame over 75 ms against 95–120. Going back is a little smoother too.
- **Holding Right** goes from 14–17 to 33–40 fps, and **moving between rows** from 27–35 to
  47–51: the moves that paid for re-layering the whole page now cost a few quads.
- The throwaway spike, which ran no React and no DOM, reached 53–54 holding Right and 59 moving
  down. A CPU profile of 2.5 s of held Right on the GL build (3.4 s window) shows where the rest
  goes: the renderer 290 ms, keydown handling and React about 600 ms, and 1,560 ms of native work
  outside JavaScript (style, layout and paint of what is still DOM: the invisible rows' buttons and
  the hero). Making the hidden DOM lighter and the hero cheaper per move are the next levers.
- `requestAnimationFrame` intervals measure the main thread. In the DOM build the slides are CSS
  transitions the compositor could run between main-thread frames, but on this TV (software
  raster) each frame of a move needs the main thread's layer update anyway, so the two builds are
  compared on the same footing.

## 2026-11-17: Home rows and hero drawn with PixiJS (spike)

- **Device:** Samsung TV, Tizen 5.5, Chromium 69.0.3497, Mali-TDVX (WebGL 2), 1920×1080, device
  pixel ratio 1.
- **Builds:** the GL spike above, extended to draw Home's hero (backdrops, shade, details) in the
  same canvas, packaged with `MIAUFLIX_TV_GL_ROWS=true`. **Quad renderer + hero**
  (`index-n1esONSB.js`): the spike's own renderer, everything redrawn every frame through its
  rounded-rectangle shader. **PixiJS + hero** (`index-CjNK5qvI.js`): the renderer rebuilt on
  PixiJS 8: a retained display tree (a node paints only when what it draws changes), Pixi's batched
  sprite shader, rounded corners as geometry with MSAA, clips as stencil rectangles, the hero's shade
  drawn once into a texture between the live backdrops (under) and details (over), and the fade
  into the rows copied from a 1920×32 px texture of the hero. Also in both: Home's page is black
  again (it was `#0A0D0F` since the design system) and the last rows scroll to the top.
- **Serving:** card images live from the server, cold (each run reloads).

### Home, the standard scenario (cold)

| Build                | Run | Row 3 first pass, 4 × Right              | Row 3, 4 × Left back                     |
| -------------------- | --: | ---------------------------------------- | ---------------------------------------- |
| Quad renderer + hero |   1 | 21 fps, p90 81.3, max 125, 29 over 50 ms | 32 fps, p90 78.9, max 136, 21 over 50 ms |
| Quad renderer + hero |   2 | 20 fps, p90 79.3, max 111, 35 over 50 ms | 23 fps, p90 90.7, max 134, 30 over 50 ms |
| Quad renderer + hero |   3 | 23 fps, p90 84.6, max 142, 28 over 50 ms | 23 fps, p90 98.7, max 134, 27 over 50 ms |
| PixiJS + hero        |   1 | 45 fps, p90 33.8, max 72, 3 over 50 ms   | 55 fps, p90 23.3, max 43, 0 over 50 ms   |
| PixiJS + hero        |   2 | 45 fps, p90 37.4, max 64, 5 over 50 ms   | 55 fps, p90 21.2, max 40, 0 over 50 ms   |
| PixiJS + hero        |   3 | 46 fps, p90 37.5, max 66, 4 over 50 ms   | 55 fps, p90 22.4, max 41, 0 over 50 ms   |

For comparison, from the section above: DOM 50–59 first pass and 51–54 back; GL rows with the DOM
hero 54–55 and 55–56.

### Home, held Right and Down (cold, from row 3)

| Scenario               |   DOM | GL rows, DOM hero | Quad renderer + hero | PixiJS + hero |
| ---------------------- | ----: | ----------------: | -------------------: | ------------: |
| Hold Right 2.5 s       | 14–17 |             33–40 |                   22 |            30 |
| 3 × Down, 800 ms apart | 27–35 |             47–51 |                   27 |            39 |

PixiJS + hero per run: JavaScript per frame about 3 ms, about 54 image uploads at about 4 ms each,
about 44 MB of textures, the shade drawn twice, the fade band about 310 times (once per frame of a
backdrop crossfade).

### Tiles baked from their `.gl.ts` form

Build `index-BIomsNXX.js`, same session-free conditions. Each tile is one picture: its `.gl.ts`
form (`MediaTile.gl.ts` over `CollectionTile.gl.ts` and `Artwork.gl.ts`) is drawn once its images
and texts are ready, baked into a texture with antialiased corners cut afterwards, and shown as
one sprite; only the focus outline and scale stay live. The row slides a group of those sprites.

| Run | Row 3 first pass, 4 × Right            | Row 3, 4 × Left back                   |
| --: | -------------------------------------- | -------------------------------------- |
|   1 | 48 fps, p90 34.0, max 68, 4 over 50 ms | 58 fps, p90 19.5, max 35, 0 over 50 ms |
|   2 | 53 fps, p90 32.3, max 68, 1 over 50 ms | 59 fps, p90 19.8, max 33, 0 over 50 ms |
|   3 | 52 fps, p90 34.6, max 53, 1 over 50 ms | 59 fps, p90 20.3, max 39, 0 over 50 ms |

Held Right: 29 fps (PixiJS + hero 30). 3 × Down: 43 fps (39). Per run: 31 tiles baked in about
65 draw attempts (a tile waits for its images and texts), about 7 ms a bake, about 54 MB of
textures (the image textures stay until the 64 MB budget needs them).

### A static focus outline and a hero that waits (Prime Video's pattern)

Build `index-C4krXcU7.js`: the baked tiles above, plus three things Prime Video does. The focused
card always rests in the same place (rows already did vertically; now the row keeps the focused
card in the leading slot to its end, `paging: 'anchor'`), so the outline is drawn once there and
never moves (`GlFocusAnchor`). During a burst of moves the hero shows no details and keeps its
image; after 400 ms of rest the details show, after 800 ms the image changes (it was 250 ms).

| Run | Row 3 first pass, 4 × Right             | Row 3, 4 × Left back                    |
| --: | --------------------------------------- | --------------------------------------- |
|   1 | 55 fps, p90 21.4, max 136, 1 over 50 ms | 59 fps, p90 17.2, max 90, 1 over 50 ms  |
|   2 | 60 fps, p90 21.8, max 35, 0 over 50 ms  | 58 fps, p90 18.6, max 102, 2 over 50 ms |
|   3 | 51 fps, p90 33.8, max 102, 3 over 50 ms | 60 fps, p90 18.1, max 39, 0 over 50 ms  |

Held Right: **48 fps** (baked tiles 29, DOM 14–17). 3 × Down: 44 (43). The fade band redrew
170–240 times a run instead of about 310: the hero crossfades once per rest, not per move.

### Details fading out and in, logos waited for, cached rows above

Build `index-bRE5flWC.js`, on top of the one above. A move fades the hero's details out over
200 ms; once the selection has rested 200 ms the new details fade in over 200 ms, only when all
their texts and the logo are ready (a logo still being made waited for up to 600 ms). The next
title's texts and logo start loading once the selection pauses 100 ms. The shade is opaque up to
the backdrop's left edge. Rows mounted above the loaded ones show their cached cards.

| Run | Row 3 first pass, 4 × Right            | Row 3, 4 × Left back                   |
| --: | -------------------------------------- | -------------------------------------- |
|   1 | 53 fps, p90 30.6, max 48, 0 over 50 ms | 56 fps, p90 24.1, max 99, 2 over 50 ms |
|   2 | 54 fps, p90 26.9, max 39, 0 over 50 ms | 55 fps, p90 22.0, max 43, 0 over 50 ms |
|   3 | 55 fps, p90 24.9, max 60, 1 over 50 ms | 55 fps, p90 24.0, max 30, 0 over 50 ms |

Held Right: 44 fps (48 before). 3 × Down: 40 (44). Loading the next title from the first move
instead (build `index-9e42V0Zy.js`) dropped held Right to 29: every title passed rendered its
texts and fetched its logo.

### What it means

- **The hero in the quad renderer halved the frame rate** (54–55 → 20–23 on a first pass): every
  frame redrew about four full-screen layers through the rounded-rectangle shader. Hiding the GL
  hero in the same session brought it back to 46–54 fps; JavaScript was about 2 ms a frame, so the
  cost was the GPU's fill.
- **PixiJS brings the hero to 45–46 / 55 fps.** On the way there, on the TV: with the whole hero
  baked into one texture, re-baking it on every crossfade frame and every text that landed cost
  about 10 fps (57–58 fps with bakes switched off in the same session, 46 with them on); drawing
  the backdrops and details live around a shade drawn once removed that.
- **Still behind GL rows with the DOM hero** on a first pass (45 vs 54–55), held Right (30 vs
  33–40) and moving down (39 vs 47–51): the hero's backdrops are now a full-screen sprite drawn
  every frame (two during a crossfade), on top of the shade's. Ahead of the DOM build everywhere
  except the first pass (DOM 50–59), with far fewer long frames.
- **Baked tiles bring the first pass to 48–53 and going back to 58–59 fps**, the best Home
  numbers so far with the hero drawn, and 3 × Down from 39 to 43. Held Right didn't move (29–30):
  there the cost isn't drawing tiles (a focus move now repaints only two outlines); what's left is
  the hero changing title on every step (backdrop crossfade, the fade band redrawn every frame of
  it) and React's work per move. A bake costs about 7 ms on the TV (a render-target switch on a
  tiled GPU), so more than about one per frame would show; packing tiles in an atlas page would
  batch them.
- **The hero waiting for a rest is what held Right needed: 29 → 48 fps**, and the first pass is
  51–60 (DOM 50–59), going back 58–60. Each move used to start a backdrop crossfade and new
  details (texts to render, the fade band redrawn every frame of it); now a burst changes only
  the row's position. The static outline removes the last per-move repaint of the tiles.
- Two Chromium 69 traps found on the way: Pixi needs `String.prototype.matchAll` (73) and
  `replaceAll` (85) (`gl/legacy.ts`), and Pixi's GPU garbage collector re-uploads textures unused
  for a minute from their source, which the renderer had already closed: cards went blank after a
  minute (the collector is off; the renderer has its own 64 MB budget).

## 2026-11-19: GL engine split (Phase 1) and black flashes

Same TV and server for every run, `scripts/tv-bench.mjs`, 3 cold runs per scenario. The spike is
the `tv-gl-spike` branch (`index-BhR5SHS8.js`), Phase 1 the split engine.

| Scenario                  | Spike     | Phase 1   | Phase 1, buffer copied |
| ------------------------- | --------- | --------- | ---------------------- |
| Row 3 first pass, 4×Right | 49–51 fps | 47–51 fps | 46–49 fps              |
| Row 3 back, 4×Left        | 53–57 fps | 51–54 fps | 53–55 fps              |
| Held Right, 2.5 s         | 26–32 fps | 20–34 fps | 24–48 fps              |
| 3×Down                    | 36–38 fps | 35–52 fps | 34–45 fps              |

The split costs nothing measurable (going back may be 2–3 fps lower, within the run-to-run noise).

### Black flashes

Both builds showed every GL layer blank for about 0.1 s, a few times a minute, also while idle on
a title. A probe reading the canvas each frame never caught an empty frame, a lost context or a
canvas resize; the TV refuses the multisampled canvas (`antialias` false in the context
attributes), and halving the texture budget to 32 MB didn't remove them. Flashes counted by eye
over one-minute segments of the same moves, alternating:

| Canvas buffer                         | Segments | Flashes                                            |
| ------------------------------------- | -------: | -------------------------------------------------- |
| Swapped (`preserveDrawingBuffer` off) |        7 | 1, 0, ~3, 1, 2 (double), 3 during a benchmark pass |
| Copied (`preserveDrawingBuffer` on)   |        3 | 0, 0, 0                                            |

The swapped buffer is shown undrawn now and then (the compositor presents the canvas without a new
frame); with the buffer copied there is nothing undrawn to show. It's now the default
(`GlTuning.preserveDrawingBuffer`), at no measurable cost. Switches for testing on the TV:
`localStorage['miauflix:gl-tuning']` as JSON (`textureBudget`, `antialias`, `frameBudgetMs`,
`preserveDrawingBuffer`, `transparent`), read when the surface starts, in the Tizen and development builds only.

### Phase 2 (pictures and metrics)

Build `index-C1URdnHu.js`, buffer copied, same session as above. Row 3 first pass 45–50 fps,
back 49–53, held Right 27–35, 3×Down 34–40; 27 pictures baked per standard run, 0 errors, 46–53 MB
of textures. Within the run-to-run noise of Phase 1: moving the pictures to `*.art.ts` and
generating their keys costs nothing measurable. No flashes in two more one-minute segments watched on this build
(5 segments in all with the buffer copied, none with a flash).

### Phase 3 (components split by render mode)

Build `index-B5EQJhKT.js`. Row 3 first pass 45–47 fps, back 51–53, held Right 22–39 (six runs:
22, 32, 39, 24, 24 and one lost), 3×Down 34–46; 28 pictures baked per standard run, 0 errors,
46–58 MB of textures. Cold start to the first focused tile 8.8–10.9 s in 11 of 12 loads (Phase 2:
9.6–12.4); one took 26.9 s and the benchmark's page script was gone after it, not reproduced
since. Within the noise of Phases 1 and 2: on the TV the backend is still in the one bundle (the
Tizen build inlines dynamic imports), and the split views run the same work as before.

### Phase 4 (hero and Home layout from one source)

Build `index-CBlhQ126.js`. Row 3 first pass 45–47 fps, back 51–53, held Right 22–36, 3×Down
35–46; 28 pictures baked per standard run, 0 errors, 46–59 MB of textures. Cold start to the
first focused tile 10.2–11.5 s. Within the noise of Phase 3: the hero draws the same calls from
the shared model and pictures.

### Phase 5 (production requirements)

Build `index-ClOgeYsr.js`. Row 3 first pass 44–47 fps, back 50–51, held Right 42–47, 3×Down
35–41; 28 pictures baked per standard run, 0 errors, 43–56 MB of textures (tiles now bake at
1.03×). Cold start to the first focused tile 5.9–12.5 s (most about 10 s).

The first Phase 5 package (`index-DvO6BdvV.js`) baked 41 pictures per run instead of 28: Home's
first pictures were drawn before their font weights had loaded, so the font epoch redrew all of
them once (since the spike, those first pictures had kept the fallback font). Texts now wait for
their own face (`document.fonts.load`), and the epoch stays at 0 on a cold load. Held Right is the
best measured since the spike (spike 44–48; Phase 4 22–36), likely from fewer picture redraws while
moving; 3×Down is within the noise of Phase 4.

### Phase 6 (performance, first pass)

Build `index-CO-avxVx.js`. Row 3 first pass 46–51 fps, back 51–52, held Right 37–49, 3×Down
41–43; 0 errors, 47–58 MB of textures; 56 picture draws per standard run (72 in Phase 5).

Profile of the first pass (4.8 s): 45% idle, the frame's own draw 18.5%. `syncRoot` is still about
315 ms over the run (every tile's box changes while the track slides), the band redraw about
105 ms (the hero crossfade redraws it every frame).

Long frames: a probe recorded every frame over 34 ms with the time the frame's own draw took.
Of 28 long frames (35–85 ms) in a run, the draw took 2–34 ms; the run had one long task (52 ms).
The rest is GPU and compositor time. Checks:

- `antialias: false`: no change; the TV's WebGL never had MSAA (`SAMPLES` 0).
- The hero backdrop hidden (the largest fill): first pass 51 and 53 against 48 and 51, back 54
  and 55 against 54 and 52, within the noise.

### Phase 6 (fill)

Fill per frame: about 2.4 screens of sprites at rest (the hero's baked layer alone a full screen).
With every GL layer hidden (the canvas still cleared and presented) the first pass ran 53–55 fps
and back 53; with Pixi's render switched off, 53–57 and 58–59.

Build `index-C50YoBU8.js`: the baked hero layer ends at the hero's height (55vh) and the canvas is
opaque. Row 3 first pass 50, 52, 52 fps, back 53, 52, 54, held Right 42, 52, 44, 3×Down 43, 40;
0 errors, 49.8 MB of textures.

Opaque against transparent (`GlTuning.transparent`), alternating cold runs: first pass 52, 52, 51
against 48, 52, 51; back 56, 53, 50 against 53, 52, 55. Within the noise. 3×Down ran 40–50 in
both; its window varied from 2.8 to 7.1 s (a long window takes in idle frames after the moves),
so it can't tell them apart.

### Phase 6 against the spike, the same day

The plan's targets come from the spike's best session (first pass 51–60, back 58–60), on the
server data of that day. Both builds measured cold, three runs each, one after the other; 3×Down
ends 0.8 s after the last key (`"settle": 800`).

| Scenario         | Spike (`index-BhR5SHS8.js`) | Phase 6 (`index-LPgnCQwF.js`) |
| ---------------- | --------------------------- | ----------------------------- |
| Row 3 first pass | 50, 51, 50                  | 50, 50, 50                    |
| Row 3 back       | 54, 55, 55                  | 52, 55, 53                    |
| Held Right 2.5 s | 47, 37, 40                  | 41, 44, 30                    |
| 3 × Down         | 39, 40, 45                  | 48, 41, 41                    |

Phase 6: 28 pictures baked per standard run, 0 errors, 46–53 MB of textures. Level with the
spike: the refactoring cost nothing, and neither build reaches the targets on today's data.

Texture budget 40 MB (`GlTuning.textureBudget`, what 2018–2019 TVs now get), two runs: first pass
53 and 49, back 55 and 52, held Right 35 and 25, 3×Down 35 and 42 (`settle`); 0 errors, and Home
still worked when coming back up and down after the hold. Holding Right fetches more images again
(64–69 uploads against 56–59).

## 2026-11-20: GL on by default (Phase 8)

Build `index-BLBQcG5U.js`, packaged with the defaults (`scripts/package-tizen.sh
https://my.miauflix.cat`, GL on), installed with `scripts/install-tizen.sh` and measured through
`scripts/tv-debug.mjs`. Same TV (TU8072), cold, 3×Down with `"settle": 800`. Phase 6's build with
the flag's default flipped, so the numbers should match Phase 6's:

| Scenario         | Phase 8        | Phase 6 (2026-11-19) |
| ---------------- | -------------- | -------------------- |
| Row 3 first pass | 51, 48, 48     | 50, 50, 50           |
| Row 3 back       | 51, 50, 49     | 52, 55, 53           |
| Held Right 2.5 s | 30, 19, 34, 26 | 41, 44, 30           |
| 3 × Down         | 46, 41, 39     | 48, 41, 41           |

27 pictures baked per standard run, 39–40 after a hold; 0 errors; 48 MB of textures after a
standard run, 53–56 MB after a hold. The first pass and 3×Down are level with Phase 6, going back
2–4 fps lower. Held Right is lower (19–34 against 30–44) with the same pictures and uploads; it
has been the noisiest scenario since the spike (Phase 4: 22–36, Phase 5: 42–47), and 19 fps is one
run. Re-measure it before reading a regression into it.

The runs logged the TV out once, during a held-Right run: a reload that cut off a token refresh
after the server had rotated the token. Fixed in the backend (a TV presenting the token the last
rotation replaced, within 30 s, gets a new one); the held-Right and 3×Down runs above came after
signing in again, before the fix was deployed.

### GL against DOM, and the card image on the DOM rows

Same build and session, after the backend fix was deployed. DOM is the same package with
`localStorage['miauflix:gl-rows'] = '0'`. Both use the server's card images (backdrop and logo in
one picture). Cold, three runs each, Project Hail Mary focused on row 3 in every run:

| Scenario         | GL         | DOM        |
| ---------------- | ---------- | ---------- |
| Row 3 first pass | 50, 51, 50 | 29, 33, 37 |
| Row 3 back       | 55, 51, 53 | 42, 43, 45 |
| Held Right 2.5 s | 32, 32, 30 | 12, 11, 16 |
| 3 × Down         | 41, 43, 39 | 41, 34, 31 |

Whether the card image still helps the DOM rows: the same DOM runs with the card images answered
404 (`serve` with `"ext": "none"`), so every tile falls back to its backdrop and logo layers. The
browser cache has to be off in both conditions (`{"cache": false}`): Chromium 69's request
interception never sees requests the cache answers, and a first attempt with the cache on left 52
of 76 tiles showing their card image.

| Scenario, cache off | Card image | Backdrop + logo |
| ------------------- | ---------- | --------------- |
| Row 3 first pass    | 33, 35, 36 | 32, 33, 30      |
| Row 3 back          | 38, 42, 43 | 39, 42, 35      |
| Held Right 2.5 s    | 9, 10, 10  | 11, 12, 14      |
| 3 × Down            | 29, 20, 26 | 21, 23, 19      |

On today's DOM rows the card image is worth about 3 fps on a first pass and a few on 3×Down,
within the noise for going back, and nothing holding Right. On 2026-11-17 it was worth about 6 fps
on a first pass, when the DOM rows ran a first pass at 37–46 with card images (50–59 that evening).
The DOM rows are now slower than then (29–37 with the cache on, 33–36 with it off), so
something else in them costs more than the second image did. With GL the default, they are the
fallback; the card image stays for both forms (GL bakes it into the tile too).

## 2026-11-20: Why the DOM rows measure lower than on 2026-11-17

The section above has the DOM rows at 29–37 fps on a first pass and 11–16 holding Right, against
50–59 and 14–17 for the spike's DOM build on 2026-11-17. To tell our code from the conditions,
three builds were measured the same evening, one after the other, on the same TV (TU8072), server
data and card images (live, cache on), cold, Project Hail Mary focused on row 3 in every run:

- **GL build, DOM forced**: the Phase 8 package (`index-BLBQcG5U.js`) with
  `localStorage['miauflix:gl-rows'] = '0'`, as in the section above.
- **DOM package**: the same tree packaged with `MIAUFLIX_TV_GL_ROWS=false` (`index-xTYmuP0e.js`).
- **Spike, DOM**: the frozen spike (`tv-gl-spike`, `b00934df`) packaged with its default, the GL
  rows off (`index-BNx0rU_V.js`): the code the 2026-11-17 DOM numbers came from, before the DOM
  views were split from the GL ones.

| Scenario                   | GL build, DOM forced | DOM package            | Spike, DOM     |
| -------------------------- | -------------------- | ---------------------- | -------------- |
| Row 3 first pass           | 40, 39               | 37, 36, 37             | 38, 37, 41     |
| Row 3 back                 | 39, 43               | 40, 44, 44             | 39, 44, 47     |
| Held Right 2.5 s           | –                    | 13, 12, 11, 16, 12, 15 | 15, 16, 11, 14 |
| 3 × Down (`"settle": 800`) | –                    | 12, 22, 15, 26, 30, 19 | 26, 20, 30, 24 |

The spike's own DOM build runs at the same frame rate as today's DOM rows: the 2026-11-17 numbers
don't reproduce with the 2026-11-17 code. The GL build with the DOM rows forced is level with the
DOM package, so the runtime switch costs nothing either (in DOM mode it mounts no surface or
canvas; the Pixi code is in the one bundle on the TV, but never runs).

Traces of one first pass each (4 × Right, `devtools.timeline`, the renderer's main thread):

| Build                | Main frames | `UpdateLayerTree` | JavaScript |
| -------------------- | ----------: | ----------------: | ---------: |
| GL build, DOM forced |          54 |            867 ms |     658 ms |
| DOM package          |          61 |            712 ms |     500 ms |
| Spike, DOM           |          80 |            713 ms |     436 ms |

And of held Right: DOM package 37 main frames, 918 ms of `UpdateLayerTree`, 680 ms of
JavaScript; spike 33, 781 ms and 618 ms. Each is a single cold run, and the spread between them
is the spread between runs (the frame-rate runs above overlap). As on 2026-11-17, the frames are
bounded by the layer update of the mounted rows (about 990 elements, 850 of them positioned, 68
cards), not by React. The DOM is the same size as then (992 positioned elements, 75 cards).

### What it means

The DOM rows are not slower because of the GL work: the same code measures the same today. The
50–59 fps of 2026-11-17 was the best session measured, not the DOM rows' usual rate: earlier that
day the same rows with card images ran their first pass at 37–46 (the card image section), and
the spike's GL build, 54–55 that evening, ran 49–51 on 2026-11-19. Conditions that changed between
sessions and aren't ours: the server's lists (what row 3 holds, how many cards show progress or
a badge), the order and warmth of the TV's caches, and the TV's own state (uptime, memory). The
DOM rows on this TV run their first pass at about 36–41 fps on today's data; comparisons between
builds need runs from the same session, as here.

## 2026-11-20: Cards mounted past each side of a row

A Home row on the TV mounted 2 cards past each side of its page once it had been in view 400 ms
(1 until then, the peeking card). The same package was measured with
`localStorage['miauflix:tv-overscan']` (a temporary override, removed since) setting every row to
2, 1 or 0, cold, Project Hail Mary focused on row 3. Cards mounted at the end of a standard run:
54–57 with 2, 49–54 with 1, 38–45 with 0.

GL rows (the default), alternating 2 and 1, three rounds:

| Scenario                   | 2 per side | 1 per side |
| -------------------------- | ---------- | ---------- |
| Row 3 first pass           | 50, 48, 52 | 50, 52, 52 |
| Row 3 back                 | 53, 51, 52 | 50, 52, 50 |
| Held Right 2.5 s           | 28, 21, 29 | 18, 34, 30 |
| 3 × Down (`"settle": 800`) | 37, 41, 39 | 44, 46, 45 |

3 × Down had 9–15 frames over 50 ms with 2 and 4–6 with 1.

DOM rows (`localStorage['miauflix:gl-rows'] = '0'`), 2, then 1, then 0:

| Scenario                   | 2 per side | 1 per side | 0 per side |
| -------------------------- | ---------- | ---------- | ---------- |
| Row 3 first pass           | 39, 36, 30 | 41, 37, 36 | 32, 34, 41 |
| Row 3 back                 | 36, 40, 41 | 43, 43, 42 | 46, 44, 46 |
| Held Right 2.5 s           | 13, 14     | 14, 12     | 18, 16     |
| 3 × Down (`"settle": 800`) | 19, 30     | 31, 32     | 36, 38     |

### What it means

With GL, one card per side moves between rows about 6 fps faster and with fewer long frames: each
row brought into view mounts, registers and syncs fewer cards. Moves along a row don't change
(GL draws only what's on screen), and held Right is within its usual noise. The DOM rows gain on
going back and moving down. With none, the peeking card at each end of a row is missing and the
row no longer shows there is more, so the TV now keeps one card per side in every row, in view or
not (`CategoryRow`'s overscan), and the 400 ms switch to two is gone.

## 2026-11-20: GL rows without the hidden text for assistive technology

Under the GL canvas, the DOM keeps what screen readers read: each card's twin button with its
label, supporting line, badge and progress as text, the rows' headings, and the hero's hidden live
region (title, metadata, genres, the whole overview, the source status), redrawn on every rested
move. To see what that text costs, a stylesheet injected once Home was ready hid it
(`display: none` on the twin buttons' spans, the rows' `h2` and the hero's `header[aria-live]`),
keeping the twin buttons, so focus and keys worked as before. Build `index-DImUA1qa.js` (one card
past each side), GL rows, cold, alternating, three rounds:

| Scenario                   | Text kept  | Text hidden |
| -------------------------- | ---------- | ----------- |
| Row 3 first pass           | 48, 53, 48 | 52, 52, 46  |
| Row 3 back                 | 54, 51, 51 | 51, 53, 51  |
| Held Right 2.5 s           | 27, 32, 27 | 36, 29, 27  |
| 3 × Down (`"settle": 800`) | 45, 43, 41 | 41, 47, 44  |

No difference beyond the noise in any scenario: the text kept for assistive technology costs
nothing measurable on the TV. The hidden DOM is about 330 elements in GL (against 800 with the DOM
rows), and what limits the GL rows lies elsewhere.
