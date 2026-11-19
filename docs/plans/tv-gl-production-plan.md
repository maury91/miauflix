# Plan: GL rendering, from spike to production

Status: in progress (2026-11-18). Follows the [GL rows spike](tv-gl-rows-plan.md). Phases 0 and 1
have landed (see [Progress](#progress)); Phase 1's TV numbers are still to be measured. The spike's numbers are in the
[benchmarks](../development/tv-benchmarks.md#2026-11-17-home-rows-and-hero-drawn-with-pixijs-spike).

## Goal

Home's rows and hero drawn by WebGL on the TV, on by default, with the DOM as the web form and the
fallback. Three requirements, in this order when they conflict:

1. **Maintainable.** The code is split by concern, reads without knowing the spike's history, and
   a change to a component's look is made once and reaches both its DOM and its GL form (or a test
   says it didn't).
2. **Fast.** At least the spike's best numbers on the TV, and no cost to the web build.
3. **Testable.** Most of the logic runs in unit tests without WebGL; what needs WebGL runs in the
   Storybook browser tests; the TV numbers are re-measured per phase with `tv-bench.mjs`.

And one opportunity: parts built for GL (a component drawn as one picture, the image pipeline, the
static focus outline) are useful to the DOM form too. The architecture below is shaped so they can
be shared rather than copied.

## What the spike leaves to fix

Kept as they are: the retained scene (`GlNode`), Pixi as the backend, baking a tile into one
picture, the static focus outline and the hero waiting for a rest, the DOM kept for focus and
semantics, the Chromium 69 workarounds. The problems are in how it is put together:

- **Two forms inline in each component.** `CollectionTile`, `Carousel`, `Artwork`, `MediaTile`,
  `CategoryRow` and `MediaHero` each grew an `if (glParent)` branch next to their DOM. The GL hooks
  run in the DOM form too (`useGlNode` creates a node for every tile on the web), and each file now
  mixes state, semantics, DOM styling and GL drawing.
- **Pixi is probably in the web bundle.** Every component imports `../gl`, whose index re-exports
  `GlSurface` → `renderer.ts` → `pixi.js`.
- **Layout written twice, sometimes three times.** The tile ratios (`RATIO` in `Artwork.tsx`,
  `TILE_RATIO` in `CollectionTile.gl.ts`, padding in `collectionTile.css.ts`); the logo box
  (`mediaTile.css.ts`, `LOGO_BOX`, `CARD_IMAGE_LOGO_BOX`); the scrim's last stop parsed out of the
  CSS string with a regex; the hero's type sizes as `clamp(...)` in styled-components and again as
  `clamp(32, windowHeight * 0.05, 73.6)` in `GlHero.tsx`; the row title and state positions and the
  focus anchor's box as `vh` arithmetic in `CategoryRow` and `HomePage`. Nothing tells you when one
  copy moves and the other doesn't.
- **Behaviour written twice.** MediaTile's fallbacks (titled backdrop → artwork + logo → label) are
  a `useState` machine in the DOM and a status-driven function in GL, with small differences. The
  hero's details (which texts, status, logo wait) are re-derived in `GlHero.tsx` (605 lines).
- **Hand-written cache keys and deps.** A `GlArt` key is a string the author keeps in step with
  the props; a prop missing from it is a stale picture. `useGlPaint` deps are manual; CategoryRow's
  title passes none and repaints every commit.
- **One 1,350-line renderer** holding nine concerns: Pixi init and context loss, the frame loop,
  image fetch/decode/upload, text rasterizing, the LRU budget, art baking and corner masks, scene
  → Pixi sync with culling and masks, the hero bake, and the fade band. Three independent
  per-frame budgets (2 uploads, 4 ms text, 4 ms bakes) that don't know about each other.
- **Home's shape in the engine.** `GlSurface`'s `fixed`/`under`/`over`/`top` layers, `contentTop`,
  `contentClipTop`, `fade` and the scroll animation are Home's hero-over-rows layout; the
  renderer's `fixed`, `heroTexture` and `band` are the hero.
- **Few tests** (only `pixiWorkarounds.test.ts`), and the gaps the spike plan lists: pointer,
  context loss beyond restore, reduced motion, late fonts, text blurred by the focus scale, and
  the pieces Home still draws as nothing (spinner, badge) or plain text (error, empty).

## Target architecture

### One picture, several painters

The central change. A component's look is a **picture**: a pure function from props and metrics to
draw calls on a `Painter`. It doesn't know which renderer runs it.

```
            collectionTile.metrics.ts  ──►  collectionTile.css.ts  ──►  DOM form
                       │
                       ▼
 MediaTile props ─► mediaTile.art.ts ─► Painter ─┬─► PixiPainter      GL: baked into a texture / atlas
                   (collectionTile.art.ts,       ├─► Canvas2DPainter  DOM: the tile as one bitmap (Phase 7)
                    artwork.art.ts)              └─► RecordingPainter tests: a list of draw calls
```

- The spike's `.gl.ts` files become `*.art.ts`: same idea, but no longer GL-specific. They import
  tokens and metrics, never React, Pixi or the DOM.
- `Painter` stays the contract (rect, gradient, image, text, measure). Images and texts keep the
  spike's two-phase semantics, which work for every painter: a draw asks for what it needs, gets a
  status back, and is drawn again when something settles.
- **The key comes from the drawing, not from the author.** A picture is recorded with the
  `RecordingPainter` (a handful of calls, cheap) and its key is a hash of the recording plus the
  statuses it saw. A prop that changes the drawing changes the key; one that doesn't, doesn't. This
  removes hand-written keys and the `useGlPaint` deps that mirror them. Measure the recording's
  cost per tile in Phase 2; the fallback is a generated key from the art's typed props.

### Shared metrics and models

- **`*.metrics.ts` per component**: the numbers both forms need (ratios, insets, the scrim's stops
  as data, the progress bar's inset and height, the logo box, type roles). `*.css.ts` and
  `*.art.ts` import them; vanilla-extract evaluates them at build time, so the DOM costs nothing.
  The logo box moves to `@miauflix/service-contracts` next to `CARD_IMAGE_LOGO_BOX`, so the server's
  card images, the CSS and the art have one source. Tokens gain structured forms where the CSS
  string is all there is today (the tile scrim).
- **Pure models for behaviour**: `resolveMediaTileVisual(props, statuses)` (which layers show,
  whether the tile is named by its visual) used by the DOM tile and the art;
  `heroDetailsModel(media, preparation, availability)` (title or logo, metadata parts, rating,
  status, genres, overview) used by `HeroDetails` and the GL hero; the hero's type sizes as one
  `heroTypeScale(viewportHeight)` that the styled-components and the art both call.
- **Page geometry as functions**: Home's row top, title band, carousel padding and the focus
  anchor's box come from one `homeLayout(viewport, geometry)`; `CategoryRow`, `HomePage`, the CSS
  and the anchor read it instead of repeating `windowHeight * 0.54 + …`.

### Components: a shared hook, a DOM view, a GL view

Each component with a GL form is split by concern, and the choice is made once:

```
collection-tile/
  CollectionTile.tsx        public component: picks the view from the render mode, nothing else
  useCollectionTile.ts      nav focus, ids, aria, pointer: everything both views need
  CollectionTileDom.tsx     today's DOM (unchanged behaviour)
  CollectionTileGl.tsx      GL binding: registers the node, shows the baked picture; renders the
                            semantic twin (the button, one aria-label) for focus and the reader
  collectionTile.art.ts     the picture
  collectionTile.metrics.ts the shared numbers
  collectionTile.css.ts
```

- **`RenderMode`** (`'dom' | 'gl'`) is a context set by `GlSurface` (and `'dom'` everywhere else).
  The public component reads it once and renders one view; the other view's hooks never run. The
  GL view is loaded with the GL chunk (below), so the web build doesn't include it.
- **The semantic twin is the source of behaviour.** In GL mode the button still owns focus,
  `data-focused`, `aria-*` and activation. GL forwards pointer input to it (hit-testing, Phase 5),
  so there is one path for select, play and focus.
- **Import boundaries, enforced by lint** (`no-restricted-imports` overrides): `*.art.ts`,
  `*.metrics.ts` and `gl/core` import no React, Pixi or DOM; `*Dom.tsx` imports nothing from `gl`;
  only `gl/pixi` imports `pixi.js`.

What a change looks like, which is the maintainability test:

| Change                                     | Where                                    | Caught if one form drifts        |
| ------------------------------------------ | ---------------------------------------- | -------------------------------- |
| Tile corner radius, colours                | `tokens.ts`                              | parity story                     |
| Move the progress bar, scrim start         | `collectionTile.metrics.ts`              | parity story                     |
| New fallback rule for a tile               | `resolveMediaTileVisual` + its unit test | both forms use it                |
| New element on the tile (a badge)          | `collectionTile.art.ts` + the DOM view   | parity story, recording snapshot |
| New hero metadata                          | `heroDetailsModel` + both views          | model test, parity story         |
| Something that only animates (focus scale) | the shared hook's state, each view       | interaction test per mode        |

### The engine

`shared/design-system/gl/`, split so each part is small and testable on its own:

```
gl/
  core/                 no Pixi, no React; unit tested in jsdom
    scene.ts            GlNode (as today) + hit-testing (inverse transforms)
    frameScheduler.ts   rAF loop, invalidation, ONE per-frame budget shared by uploads, text, bakes
    easing.ts, units.ts
  paint/
    painter.ts          Painter, GlArt, TextSpec, ImageStatus
    recordingPainter.ts tests and art keys
    canvas2dPainter.ts  the picture into a 2D canvas (DOM bitmaps, and GL text)
    textLayout.ts       wrap and ellipsize (pure, measure injected)
  resources/
    imagePipeline.ts    fetch → createImageBitmap (scaled) with priorities: visible, near,
                        prefetch; shared with the DOM preloader (Phase 7)
    textureBudget.ts    LRU by bytes, budget per device class (pure)
  bake/
    bakery.ts           queue of pictures, waits for their resources, bakes within the budget
    atlas.ts            pages and slots by size class (pure packer)
  pixi/                 the only place that imports pixi.js; loaded as a separate chunk
    backend.ts          init, resize, context loss and restore, stats
    pixiPainter.ts      Painter → Sprites/Graphics
    sync.ts             GlNode tree → Containers, culling, clip masks
    compat/             legacy.ts, pixiWorkarounds.ts
  react/
    GlSurface.tsx       canvas, backend, RenderMode, named layers
    GlLayer.tsx         a layer: live, or baked into one texture when it changes
    GlScroller.tsx      a clipped, scrolled node with a fade edge (Home's rows)
    hooks.ts            useGlNode, useGlArt (art in, sprite out), useGlImageStatus
```

- **Pixi behind an interface.** `core`, `paint`, `resources` and `bake` describe what is drawn;
  `pixi/backend.ts` is one implementation. Keeping Pixi is the plan (it brought held Right from
  29 to 48 fps), but the boundary means it could be replaced or upgraded without touching
  components.
- **The GL chunk is lazy.** `GlSurface` imports `gl/pixi` with `import()`. The TV build preloads
  it (it's a local package, so the load is fast); the web build never requests it. Pixi imports go
  through its subpath modules with only the extensions used (WebGL, sprites, graphics, render
  textures), not `accessibility`, `events` or WebGPU.
- **No Home in the engine.** The hero bake becomes a `GlLayer baked`; the fade band becomes the
  `GlScroller`'s fade edge copying from the layer under it; `fixed`/`under`/`over`/`top` become
  layers Home declares. `window.__glRows` and the stats overlay are development-only.
- **One budget per frame.** Uploads, text and bakes draw from the same budget (start from the
  spike's total, about 8 ms on the TV), visible work first. Stats keep reporting each.

### Text

Canvas 2D text baked into the picture (as the spike does) stays, with two fixes:

- **Sharp under the focus scale:** focusable pictures are baked at their focused size
  (`dpr × 1.03`) and drawn slightly scaled down at rest. Cheaper than an MSDF atlas; MSDF is the
  fallback if the TV's filtering still blurs it.
- **Late fonts:** the font epoch (bumped on `document.fonts` `loadingdone`) is part of every
  picture's key, so text drawn in a fallback font is re-baked.

## Shared with the DOM

What GL taught that the DOM form can use. Each is measured on the TV before it's kept.

1. **The tile as one picture in the DOM.** The DOM bottleneck on the TV is layers
   (`UpdateLayerTree` over about 1,000 of them), and a tile is a frame, an image, a logo image, a
   scrim, a progress bar and text spans. With `Canvas2DPainter`, the same `mediaTile.art.ts` draws
   the tile into a bitmap and the DOM tile becomes a button with one image (text kept for the
   reader, visually hidden). Two ways to show it, to compare: a `<canvas>` per tile, or
   `toBlob` → object URL → `<img>` (encoding costs CPU; JPEG/WebP, not PNG). Drawing happens off
   the critical path, visible tiles first, through the same scheduler. Check whether the TV's
   Chromium 69 supports `OffscreenCanvas` with fonts in a worker; if it does, the drawing leaves
   the main thread. Risk: canvas 2D is software-rasterized on the TV, so the bitmap must cost less
   than the layers it removes.
2. **Server card images and client pictures agree.** The catalog already draws backdrop + logo
   into card images. With the logo box in `service-contracts` and the art using it, the client
   picture is "card image + frame, scrim, text, progress", and the server could later take more of
   it (the frame and scrim are static) where the per-user parts allow.
3. **One image pipeline.** The DOM's `imagePreloader` and GL's texture loader both prioritize by
   visibility and prefetch margins; `imagePipeline.ts` becomes the scheduler for both (priorities,
   concurrency, decode size). The DOM gets the decode-to-drawn-size scaling only where it uses
   bitmaps (point 1).
4. **The static focus outline and anchor paging.** `paging: 'anchor'` and one outline that never
   moves cut per-move repaints in GL; on the DOM TV the outline would be one element outside the
   rows instead of a pseudo-element per tile. Today CategoryRow picks `anchor` only in GL; measure
   it in the DOM TV build and make it a TV choice, not a GL one.
5. **Text layout.** `textLayout.ts` (wrap, ellipsize to N lines) is shared by the GL text, the
   DOM bitmaps and any canvas drawing.

## Performance

Acceptance on the TV (Tizen 5.5, `tv-bench.mjs`, cold, three runs), from the spike's best build:

| Scenario                    | Target                    | Spike best |
| --------------------------- | ------------------------- | ---------- |
| Row 3 first pass, 4 × Right | ≥ 52 fps, ≤ 1 frame >50ms | 51–60      |
| Row 3, 4 × Left back        | ≥ 57 fps                  | 58–60      |
| Hold Right 2.5 s            | ≥ 45 fps                  | 44–48      |
| 3 × Down, 800 ms apart      | ≥ 44 fps                  | 40–44      |
| Texture memory              | within the device budget  | ~54 MB     |
| Web bundle (initial JS)     | unchanged from `main`     | —          |

Each refactoring phase must hold these (no regressions from restructuring); Phase 6 is where they
improve:

- **Atlas bakes.** A bake is about 7 ms, mostly the render-target switch. Bake several pictures
  per switch into atlas pages (slots by size class: a row's tiles share a size), one sprite batch
  per page.
- **Hero details baked ahead.** The upcoming title's details are baked while the current ones
  show, so a rest swaps a sprite.
- **Less per-move work outside GL.** Keep the semantic twin minimal (one `aria-label` per tile, no
  text layout), keep the track position out of React state, and trace keydown → commit with
  `tv-bench.mjs`.
- **Texture budget per device class** (2018 TVs have less memory), with eviction tests.

## Testing

| Layer             | What                                                                                                                                                                                                               | Where                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Pure logic        | scene transforms, animations and hit-testing (fake clock); scheduler budgets; LRU; atlas packer; image priorities; text layout (fake measure); metrics; `resolveMediaTileVisual`; `heroDetailsModel`; `homeLayout` | vitest `unit` (jsdom)                        |
| Pictures          | each `*.art.ts` drawn with `RecordingPainter` for its variants (statuses loading/ready/failed): snapshot of draw calls; key changes exactly when the drawing does                                                  | vitest `unit`                                |
| Engine with WebGL | surface mounts, a picture bakes, culling, eviction, context loss and restore (`WEBGL_lose_context`), fallback to DOM                                                                                               | vitest `storybook` (Chromium, SwiftShader)   |
| Parity            | each component's stories rendered in DOM and GL side by side, compared against each other with a tolerance, plus the usual baselines                                                                               | Storybook + `test:visual`                    |
| Semantics         | the accessibility tree is the same in both modes (role, name, focus, `aria-*`)                                                                                                                                     | vitest `unit`                                |
| TV performance    | the table above, per phase                                                                                                                                                                                         | `tv-bench.mjs`, recorded in tv-benchmarks.md |

The parity stories are what keep "change once, both forms follow" honest: a change that reaches
one form only fails a test.

## Production requirements

- **Fallback.** The render mode is decided once at start: GL if enabled for the build, WebGL is
  available, and the device isn't blocklisted. A context that isn't restored within a few seconds,
  or is lost repeatedly, switches the surface to DOM at runtime (children remount in DOM mode; Home's
  state is in Redux, so focus survives). Tested with `WEBGL_lose_context`.
- **Pointer (Smart Remote, web).** The canvas takes pointer events; the scene hit-tests node boxes
  (with their transforms) and forwards to the semantic twin: move focuses, click activates.
- **Accessibility.** The semantic twin is the reader's tree. On the TV, Samsung's reader speaks the
  focused element and draws its own highlight, so unpositioned twins are acceptable there; that's
  the scope while GL is TV-only. `prefers-reduced-motion` makes engine animations instant.
- **Complete Home.** GL forms for the row spinner, `Badge`, and the error and empty states (from
  their own `*.art.ts`), so nothing is invisible with GL on.
- **Flag to default.** `VITE_TV_GL_ROWS` becomes a build option that defaults to on for Tizen,
  with a runtime override (`localStorage`) to force DOM for support. The web stays DOM.

## Phases

Each phase lands on its own, behind the flag, with the TV numbers re-measured.

| #   | Phase                       | Deliverable                                                                                                                                                                                                     | Estimate                               |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 0   | Freeze the spike            | The spike committed on its branch as the reference build; its numbers are the baseline                                                                                                                          | ½ day                                  |
| 1   | Split the engine            | `gl/` as above (`core`, `paint`, `resources`, `bake`, `pixi`, `react`), the hero and band out of the renderer into `GlLayer`/`GlScroller`, one frame budget, unit tests for the pure parts. No behaviour change | 3–4 days                               |
| 2   | Pictures and metrics        | `*.art.ts` for Artwork, CollectionTile, MediaTile, Carousel edges; `*.metrics.ts` used by the CSS; `RecordingPainter`, recorded keys, snapshots; `resolveMediaTileVisual`; logo box in `service-contracts`      | 3 days                                 |
| 3   | Split the components        | Shared hook + DOM view + GL view for Artwork, CollectionTile, MediaTile, Carousel, CategoryRow; `RenderMode`; lazy GL chunk; lint boundaries; web bundle checked                                                | 3–4 days                               |
| 4   | The hero                    | `heroDetailsModel`, `heroTypeScale`, `homeLayout`; `MediaHero` split like the components; hero details as a picture                                                                                             | 2–3 days                               |
| 5   | Production requirements     | Fallback on context loss, pointer hit-testing, reduced motion, font epoch, text baked at focused size, GL forms for spinner, badge, error, empty                                                                | 4–5 days                               |
| 6   | Performance                 | Atlas bakes, hero details baked ahead, minimal semantic twin, per-device budget; targets above met                                                                                                              | 3–4 days                               |
| 7   | DOM reuse (parallel from 2) | `Canvas2DPainter`; the tile as one bitmap in the DOM TV build (canvas vs img), measured; shared image pipeline; anchor paging and static outline on the DOM TV                                                  | 3–4 days, then keep or drop by numbers |
| 8   | Default on                  | Flag default for Tizen, runtime override, an architecture reference for the GL layer and a style-guide section on writing a component's picture; the spike plan marked done                                     | 1–2 days                               |

Roughly 4–5 weeks for Home on the TV, with Phase 7 decided by its measurements. Search's grid and
the details page's episode list come after, each needing a `Grid`/list GL form and its pictures;
with Phases 1–3 done that's mostly new `*.art.ts` files and views.

## Progress

- **Phase 0 (done).** The spike as measured is the `tv-gl-spike` branch.
- **Phase 1 (done, measured: no change from the spike).** `gl/` is split as above, with these differences:
  - Text rasterizing is `paint/textRaster.ts` (canvas 2D, one scratch canvas); `Canvas2DPainter`
    and `RecordingPainter` come with Phases 2 and 7. Gradient and corner pixels are pure
    (`paint/rasters.ts`).
  - Pixi's side is `backend.ts` (wiring, frame, context loss), `textures.ts` (every texture and its
    queues), `pixiPainter.ts`, `sync.ts` (containers, culling, clips, baked layers, fade bands) and
    `pictures.ts` (baking GlArt). `bake/atlas.ts` was planned for Phase 6 and dropped (see Progress).
  - "Baked" and "fade edge" are node properties (`GlNode.bake`, `GlNode.fade` + `fadeFrom`) that
    `GlLayer` and `GlScroller` set. Named layers (`useGlLayer`) let a component draw into a layer
    declared elsewhere: the hero's backdrops and details sit in their own layers while its React
    tree is in the baked one. Home's layers are in `pages/home/homeGlLayers.ts`.
  - The fade band is now drawn inside the scroller (under the focus layer, which it never overlaps)
    and copies the layer group holding the backdrops and the baked shade, as before.
  - One budget of 8 ms per frame; uploads keep their cap of 2 per frame within it.
  - `GlSurface` still imports the Pixi backend statically: the lazy chunk is Phase 3. `__glRows`
    (`exposeAs`) stays on the Tizen build so stats can be read there until Phase 8.
  - Measuring it on the TV found the black flashes the spike had too (every GL layer blank for
    about 0.1 s, a few times a minute): the swapped canvas buffer shown undrawn. The canvas now
    keeps its buffer (`preserveDrawingBuffer`), at no measurable fps cost. `GlTuning` overrides
    the engine's defaults for testing on the TV (tv-benchmarks.md, 2026-11-19).

- **Phase 2 (done, measured: no change from Phase 1, no flashes).** Pictures are `artwork.art.ts`, `collectionTile.art.ts`,
  `mediaTile.art.ts` and `carousel.art.ts` (the edges); the `.gl.ts` files are gone. They import
  the engine's pure parts from `gl/art` and their numbers from `*.metrics.ts`
  (`collectionTile.metrics.ts`: ratios, radius, focus scale and outline, disabled opacity,
  progress and text insets; `artwork.metrics.ts`: the fallback title; `mediaTile.metrics.ts`:
  `LOGO_BOX` from `CARD_IMAGE_LOGO_BOX`, via the browser-safe `card-image/v1` subpath), which the
  CSS uses too. `tokens.tileScrim` holds the tile scrim's stops; `scrim.tile` is built from it.
  `resolveMediaTileVisual` decides MediaTile's fallbacks for the DOM tile and the picture.
  `RecordingPainter` (`gl/testing`) records draw calls: each picture has snapshot tests of its
  variants. ESLint keeps `*.art.ts` and `*.metrics.ts` free of React, Pixi, styled-components,
  `gl`'s index and CSS files. Differences from the plan:
  - **Keys are generated from typed props, not recorded** (`artKey(name, props)`: every prop, in a
    fixed order). A picture is a pure function of its props and the statuses of the images they
    name, and the renderer already re-bakes a picture when one settles, so props are enough;
    recording would run every drawing on every render and can't see branches a status hasn't
    taken. Adding a prop to an art's props keys it without listing it anywhere.
  - Carousel's `itemExtent` moved to `collectionGeometry.ts` and `placeTrack` into `Carousel.tsx`
    (they move the track; they aren't drawing). The GL views come with Phase 3.

- **Phase 3 (done, measured: no change from Phase 2).** Artwork, CollectionTile, MediaTile and Carousel are
  each a public component that picks one view from `useRenderMode()` (`'gl'` inside a GlSurface's
  parent, `'dom'` elsewhere), a shared hook (`useArtwork`, `useCollectionTile`, `useCarousel`:
  load and failure reports, held images, nav focus, ids, description, pointer lock, mounted
  range) and `*Dom.tsx`/`*Gl.tsx` views; the other view's hooks never run. MediaTile's views use
  CollectionTile's directly, and its DOM view `ArtworkDom`. ESLint keeps `*Dom.tsx` from importing
  `gl`, pictures or GL views. `GlSurface` loads the Pixi backend with `import()`
  (`preloadGlBackend`, started at startup when the GL rows are on): the web entry chunk went from
  1,502 KB to 1,093 KB (gzip 480 → 359 KB), Pixi is a 410 KB chunk the web never requests. Differences from the plan:
  - **The GL views aren't lazy.** They're small and lazy-loading each would suspend every tile;
    only Pixi (the backend) is its own chunk. The Tizen build inlines dynamic imports
    (`inlineDynamicImports`), so on the TV everything is one file and the preload resolves at once.
  - **Home waits for the backend as a whole** (`useGlBackendReady` inside a Suspense boundary):
    with the surface suspending on its own, Home committed first, its first focus found no rows
    and landed on the side menu (seen in Storybook, where nothing preloads).
  - **CategoryRow** keeps one component (its data logic is shared): its drawn title and state
    text are `CategoryRowTitleGl`, and the paging mode comes from `useRenderMode`. The ref the row
    wrote during render for the paint to read is gone.
  - `RenderMode` follows the GL parent context rather than a separate one, so a `GlParentScope`
    without a node also switches its children to DOM.

- **Phase 4 (done, measured: no change from Phase 3).** Home's hero and layout:
  - `pages/home/homeLayout.ts`: `HOME_VH` (the hero's height and padding, the rows' top,
    padding and fade, a row's title, gap and message) and `homeLayout(window, geometry)` /
    `homeRowLayout(windowHeight)` in px. `homePage.css.ts`, `categoryRow.css.ts`, the DOM hero,
    `HomePage` (the scroller's clip, content top and fade, the last row's room, the focus anchor's
    box), `CategoryRow` and the GL hero read them instead of repeating `windowHeight * 0.54 + …`.
  - `pages/home/hero/`: `heroDetailsModel(media, preparation, availability)` (title, metadata,
    rating, source status, genres, overview) used by the DOM details, the drawn ones and the
    reader's hidden header; `heroType.ts` (`HERO_TYPE`, `heroTypeCss(role)` for the CSS `clamp()`,
    `heroTypeScale(windowHeight)` in px, `HERO_DETAILS` spacing and boxes); `heroMotion.ts` (fade
    and rest timings); `heroDetails.art.ts` and `heroShade.art.ts` (the pictures), with the shade's
    stops and positions in `heroShade.metrics.ts`, which the DOM gradients use too.
  - `MediaHero` picks `MediaHeroDom` or `MediaHeroGl`; `useMediaHero` holds the selection, the
    resting details, the backdrop stack and its loading. `components/GlHero.tsx` is gone.
  - Differences from the plan: the details picture is drawn live, not baked (`heroDetailsArt`
    returns `texts()` and `draw()`; baking it ahead was planned for Phase 6 and dropped). The DOM status badge stays
    `SourcePreparationStatus` (shared with the details page), so the model's `status` mirrors its
    rules rather than replacing them.
  - Found on the way: an apostrophe in a CSS comment inside the DOM hero's `::before` made
    styled-components drop its `::after` rule, so the DOM hero never drew the band darkening the
    backdrop's bottom right (the GL hero did). Fixed.
- **Phase 5 (done, measured: held Right 42–47 fps, the rest as Phase 4).** Production requirements:
  - Pointer: `gl/core/hitTest.ts` hit-tests the scene (transforms, clips, fade edges); `GlSurface`
    takes the pointer and forwards `mousemove`/`click` to the node's `target` (`useGlTarget`),
    the tile's button. Home's hidden rows are out of the pointer's way.
  - Fallback: `ContextLossPolicy` (3 s to restore, or the third loss) → the surface renders DOM
    and `reportGlFailure()`; `useGlAvailable()` switches Home to its DOM rows for the session.
    Not done: a device blocklist (none needed yet) and the runtime override (Phase 8).
  - Reduced motion (`gl/core/motion.ts`): animations land at once, no fade-ins, spinners still.
  - Fonts (`FontEpoch`): each text waits for its face (`document.fonts.load`); one drawn in a
    fallback anyway re-keys texts and pictures when a font loads later. The first package re-keyed
    on every load: Home's first pictures were drawn before their weights loaded.
  - Text at the focused size: texts rasterize at the paint's resolution; `GlArt.scale` bakes the
    tile at `dpr × 1.03`.
  - GL forms: `ProgressSpinnerGl` (`spinner.art.ts`, `GlNode.spin`), the tile's badge
    (`badge.art.ts`, `CollectionTile.glBadge`), the failed row as a danger Message
    (`message.art.ts`, the icon's mdi path drawn with `Path2D`). Each has a `*.metrics.ts` its CSS
    reads too. The empty row stays plain text, as in the DOM.
  - Tested: unit tests for each pure part and picture snapshots; a Storybook test in Chromium for
    the pointer and the fallback (`MediaTile/WebGL`).

- **Phase 6 (done, measured: first pass 50 fps, back 52–55, held Right 30–44, 3×Down 41–48; the
  spike the same day 50–51, 54–55, 37–47, 39–45).** The targets above were the spike's best
  session; measured the same day the spike misses them too, and this build is level with it. What
  bounds the frame now is the TV's GPU and compositor, not the engine. Per-frame work cut where
  profiles showed it:
  - Text: the last line's ellipsis is found by binary search (about 8 measures, was one per
    character cut: up to 40 ms on the TV for a long synopsis).
  - Scene sync: a node whose inputs (box, parent transform, opacity) and paint are unchanged is
    skipped with its subtree; culled subtrees are left once (`near` flag) instead of visited every
    frame. Animations step through a set of moving nodes instead of walking the scene.
  - Bands redraw from the sources they copy, once per frame; a titled tile no longer asks for its
    label while its backdrop loads (one picture draw less per tile: 56 per run, was 72).
  - What's left is not JavaScript: a long-frame probe on the TV found frames of 35–85 ms whose own
    draw took 2–34 ms, with one long task (52 ms) in a run. Hiding the hero backdrop (the largest
    fill) moved the numbers within the noise (first pass 51–53 against 48–51). The GPU and
    compositor bound the frame; atlas bakes (28 bakes per run, none in the long frames) and the
    hero baked ahead are not expected to move these numbers and are dropped. So is the minimal
    semantic twin (React's per-move work isn't what drops frames).
  - Fill: with every layer hidden the TV ran 53–55 fps, with Pixi's render off 57–59, so presenting
    the canvas and filling it cost about 4 fps each. Home's baked hero layer was a full-screen
    texture for a 55vh hero; it now ends with the hero (0.9 screens less fill per frame, 3.6 MB
    less): first pass 50–52 (was 46–51). Home's canvas is also opaque (`GlSurface` `background`),
    which measured within the noise against a transparent one (`GlTuning.transparent`).
  - Texture budget per TV generation (`glTextureBudget` in `shared/config/tv-profile.ts`): 64 MB
    from 2020 (the TU8072 shows Home in about 50 MB), 40 MB for 2018–2019 TVs and unknown ones,
    dated by model code or else by the browser's version. At 40 MB on the TU8072: no errors, the
    first pass and 3×Down as at 64 MB, held Right lower (25 and 35 fps: more images fetched
    again).
  - `tv-bench.mjs` `{"stop": true, "settle": 800}` ends the recording 0.8 s after the last key the
    page received: 3×Down's window used to vary from 2.8 to 7.1 s with DevTools' delivery.

## Open decisions

- **GL stays TV-only?** The plan assumes yes: browsers composite the DOM rows on the GPU. If a web
  GL mode is ever wanted, the boundaries above allow it, but it isn't planned.
- **Text: baked at focused size, or an MSDF atlas?** Start with the first (cheap), switch only if
  the TV shows blur.
- **Recorded keys vs typed keys.** Decided in Phase 2: keys generated from typed props (see
  Progress).
- **The DOM tile bitmap.** Worth keeping only if it beats the layers it removes on the TV; the web
  probably doesn't need it.
