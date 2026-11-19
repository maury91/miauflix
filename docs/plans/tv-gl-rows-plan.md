# Plan: Home rows drawn with WebGL on the TV

Status: spike (2026-11-17), behind `VITE_TV_GL_ROWS` (`MIAUFLIX_TV_GL_ROWS=true` with
`scripts/package-tizen.sh`), off by default. Not decided.
The plan to take it to production is [TV GL production plan](tv-gl-production-plan.md).

## Why

On the Samsung TV (Tizen 5.5, Chromium 69, software raster) Home's rows are limited by paint
layers, not by React: every frame of a move spends about 30 ms in `UpdateLayerTree` over about
1,000 layers. Cutting React work per move changed nothing
([benchmarks](../development/tv-benchmarks.md#2026-11-17-home-react-work-per-move)). Drawing the
rows in one WebGL canvas, with React still owning state and the DOM still owning focus, takes
holding Right from 14–17 to 33–40 fps and moving between rows from 27–35 to 47–51, and removes
most long frames from a first pass
([benchmarks](../development/tv-benchmarks.md#2026-11-17-home-rows-drawn-with-webgl-spike)).

## What the spike does

- `shared/design-system/gl/`: a retained scene (`GlNode`: translate, scale about the centre,
  opacity, clip, `z`, animations) and one WebGL 1 renderer. One shader draws every quad: a
  rounded-rectangle SDF (fill or ring) times a vertex colour (gradients) or one of 8 textures,
  clipped per row and faded at the top. Quads are rebuilt each frame and drawn in 2–3 calls.
  Frames run only while something animates, loads or changed. Images: `fetch` →
  `createImageBitmap` (off the main thread, scaled down if larger than drawn) → `texImage2D`, at
  most 2 uploads per frame, visible ones first, only for nodes within a margin of the screen, and
  a 64 MB least-recently-drawn budget. Text is drawn with canvas 2D into textures (2 per frame).
- `GlSurface` (the canvas and provider), `GlGroup`, `useGlNode`, `useGlPaint`,
  `useGlImageStatus`. Inside a surface, `Carousel`, `CollectionTile`, `MediaTile` (logo) and
  `Artwork` register nodes and paint them; outside one they render as before. Their DOM stays:
  the list, its items and the tile buttons with their text, unpositioned, in an `opacity: 0`
  container, so virtual focus, `data-focused`, `aria-*` and tests work unchanged. Geometry comes
  from `collectionGeometry` and Home's row height through each parent's box, never from layout.
- Home wraps its rows in a `GlSurface` when the flag is on; the surface runs the slide between
  rows (300 ms) and reports where the rows came to rest, as the TV's transform scroller did.

## Since then: PixiJS, the hero, and `.gl.ts` forms

- **Renderer on PixiJS 8.** The quad renderer redrew everything each frame; with the hero added
  that halved the frame rate (GPU fill). `gl/renderer.ts` now keeps a retained Pixi display tree:
  a node paints only when `useGlPaint`'s deps change, sprites batch, rounded shapes are geometry
  with MSAA, clips are stencil rectangles. Chromium 69 needs `gl/legacy.ts` (`matchAll`,
  `replaceAll`), pixels uploaded as `BufferImageSource` (a large canvas uploads empty), and Pixi's
  GPU garbage collector off (it re-uploads from bitmaps the renderer has closed).
- **The hero** (`GlHero`): backdrops live under a shade drawn once into a texture, details live
  over it; the rows' fade copies a band of the hero into a texture redrawn only when it changes.
- **A `.gl.ts` form per component.** It takes the component's props and returns a `GlArt`: a key,
  a size and a draw function, composing other components' forms (`MediaTile.gl.ts` draws
  `Artwork.gl.ts` and the logo inside `CollectionTile.gl.ts`'s frame, scrim, progress and text).
  The renderer draws it once everything it asks for is ready, bakes it into a texture (corners cut
  afterwards: render textures have no MSAA) and shows one sprite per tile, for every node with the
  same key. Only what focus changes stays live (outline, scale). `Carousel.gl.ts` is the row: item
  extents on the track's X axis, the track's animated X, the edge fades. Tiles within the prefetch
  margin are baked before they slide in.
- **Prime Video's pattern.** The focused card always rests in one place (`paging: 'anchor'`), so
  one outline (`GlFocusAnchor`, in the surface's `top` layer) never moves and cards slide under
  it; the hero clears its details during a burst, shows them after 400 ms of rest and changes
  its image after 800 ms. Held Right went from 29 to 48 fps.
- **Next, if it continues:** bake into atlas pages (a bake is about 7 ms on the TV, mostly the
  render-target switch), bake the hero's details per title ahead of the focus, and compare each
  `.gl.ts` form against its DOM component in Storybook so they don't drift.

## What productionizing would take

- **Text quality.** Canvas 2D text in textures is sharp at rest but resampled while the focused
  tile is scaled (1.03), and has no subpixel antialiasing. Options: render focused text at the
  scaled size, or move to an SDF/MSDF font atlas (Poppins, built at build time) for crisp text at
  any scale and fewer uploads. Text textures are cached by content, so many distinct titles mean
  many small textures: an atlas would batch them. About 2–3 days.
- **Accessibility.** Semantics stay in the DOM, so screen readers read the same tree. Missing: the
  DOM boxes no longer match what is drawn (screen-reader focus highlights and magnifiers point at
  the wrong place). Place the invisible DOM where the canvas draws (positioned, but without
  `will-change` and outside the hot path), or only on the TV, where Samsung's reader speaks the
  focused element and draws its own highlight. High-contrast and reduced motion need checking
  (the renderer ignores `prefers-reduced-motion`). About 1–2 days.
- **Pointer and touch.** The canvas has `pointer-events: none` and the invisible DOM isn't where
  the tiles are drawn, so the pointer (Samsung's Smart Remote, the web) doesn't focus or open
  cards. Hit-test the scene instead (a node box per tile is already there). About 1 day.
- **Web fallback.** The web build doesn't need it (browsers composite the DOM rows on the GPU);
  keep GL TV-only, with the DOM form as the fallback when WebGL is missing or the context is lost
  (the spike falls back only if the context can't be created; context loss isn't handled). About 1
  day, plus a Storybook/visual test of the GL form.
- **Components that would need GL forms.** Done in the spike: Carousel (viewport, track, edges),
  CollectionTile (frame, scrim, progress, overlay/below text, outline, scale), MediaTile (logo),
  Artwork (cover/contain, fallback title). Still DOM, so invisible today with the flag on: the
  row's loading spinner (drawn as nothing), `Badge` (Home has none), the error/empty messages
  (drawn as plain text), the page buttons (web only). The hero, rail and panels can stay DOM.
  Search's result grid and the details page's episode list would be the next candidates, with a
  `Grid`/list form. About 2–3 days for the remaining Home pieces, more per screen.
- **The rest of the per-move cost.** Holding Right is still about 15 fps short of the
  React-free spike: keydown handling and React (~600 ms over 2.5 s) and native style, layout and
  paint of what is still DOM (~1.5 s). Next steps: keep the invisible DOM minimal (no text layout
  per tile: one `aria-label`), check whether the hero's per-move updates can wait for the move to
  rest, and trace with `tv-bench.mjs`.
- **Hardening.** Context loss and restore, resize, fonts loading late (text is deferred until
  `document.fonts` is ready, but not re-rendered if a fallback font was used), memory pressure on
  2018 TVs (budget per model year), tests for the scene and renderer logic (culling, batching,
  LRU), and a lint-clean, documented API in the style guide.

Rough total for Home on the TV: 1.5–2 weeks, with the text and pointer work the largest
unknowns. Worth it if held keys and row changes matter more than keeping one rendering path; the
first pass along a row is already at 50–59 fps in the DOM build.
