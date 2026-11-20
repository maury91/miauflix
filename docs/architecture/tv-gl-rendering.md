# GL rendering on the TV

On the Samsung TV build, Home's rows and hero are drawn with WebGL (PixiJS) in one canvas. The DOM
stays under it for focus, semantics and the pointer; it is also the web form, and the fallback
when WebGL isn't there or fails. How it got here, and its measurements, are in the
[production plan](../plans/tv-gl-production-plan.md) and the
[benchmarks](../development/tv-benchmarks.md).

Why: on Tizen 5.5 (Chromium 69, software raster) Home's DOM rows spend most of each frame
updating about 1,000 paint layers, whatever React does. A canvas is one layer.

## When GL is on

`glRowsEnabled` (`frontend/src/shared/config/constants.ts`, `resolveGlRows`) decides it once at
start:

| Build                                  | Default | `localStorage['miauflix:gl-rows']` |
| -------------------------------------- | ------- | ---------------------------------- |
| Tizen (`scripts/package-tizen.sh`)     | on      | `'0'` forces the DOM rows          |
| Tizen with `MIAUFLIX_TV_GL_ROWS=false` | off     | `'1'` turns GL on                  |
| Web, production                        | off     | ignored (`'0'` is a no-op)         |
| Web, development (`npm run dev`)       | off     | `'1'` turns GL on (keys only)      |

Then, at runtime:

- **No WebGL** (`glSurfaceSupported()`): Home renders its DOM rows.
- **The backend can't start, or the context is lost for good** (`ContextLossPolicy`: not
  restored within 3 s, or the third loss): the surface renders its children as DOM and calls
  `reportGlFailure()`; `useGlAvailable()` turns Home's GL rows off for the session. Home's state
  is in Redux, so focus survives the remount.

Debugging on the TV: `localStorage['miauflix:gl-tuning']` as JSON overrides the engine's
defaults (`textureBudget`, `antialias`, `frameBudgetMs`, `preserveDrawingBuffer`,
`transparent`), read when the surface starts, on the Tizen and development builds only. While
it's set, the surface's backend (stats, last error) is `window.__glRows`; in development always.

## The pieces

```
component props ─► *.art.ts ─► Painter ─┬─► PixiPainter       GL: baked into a texture
       │             ▲                   └─► RecordingPainter  tests: a list of draw calls
       │        *.metrics.ts ──► *.css.ts ──► DOM view
       ▼
public component ─ useRenderMode() ─┬─► *Dom.tsx   (web, and the fallback)
       │                            └─► *Gl.tsx    (inside a GlSurface)
       └─ shared hook (use*.ts): focus, ids, aria, pointer, load reports
```

### A component with a GL form

Each one is split by concern (`design-system/collection-tile/` is the reference):

| File                        | What                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `CollectionTile.tsx`        | The public component: renders `*Gl` when `useRenderMode()` is `'gl'`, `*Dom` otherwise. Nothing else.                         |
| `useCollectionTile.ts`      | What both views need: nav focus, ids, aria, description, pointer.                                                             |
| `CollectionTileDom.tsx`     | The DOM view. Imports nothing from `gl`, pictures or GL views (lint).                                                         |
| `CollectionTileGl.tsx`      | The GL view: registers nodes (`useGlNode`), paints them (`useGlPaint`), and renders the **semantic twin**.                    |
| `collectionTile.art.ts`     | The picture: a pure function from props to draw calls on a `Painter`.                                                         |
| `collectionTile.metrics.ts` | The numbers both forms use (ratios, insets, focus scale). The CSS imports them; vanilla-extract evaluates them at build time. |
| `collectionTile.css.ts`     | The DOM styles, and the twin's (hidden, unpositioned).                                                                        |

The **semantic twin** is the GL view's DOM: a button with the label and description as text,
unpositioned and invisible. It owns focus, `data-focused`, `aria-*` and activation, so GL never
reimplements behaviour. The surface hit-tests the pointer against the scene and forwards moves
and clicks to the node's `target` (`useGlTarget`), the twin.

Components with a GL form: `Artwork`, `CollectionTile`, `Carousel`, `MediaTile`, `Badge` (in a
tile), `ProgressSpinner`, `Message` (Home's failed row), `CategoryRow`'s title, and Home's hero
(`pages/home/hero/`: `MediaHeroDom`/`MediaHeroGl`, `heroDetailsModel`, `heroDetails.art.ts`,
`heroShade.art.ts`).

Behaviour both forms need lives in pure models, not in either view: `resolveMediaTileVisual`
(MediaTile's fallbacks), `heroDetailsModel` (the hero's texts), `heroTypeScale` and
`homeLayout` (Home's geometry in px, from the same `vh` numbers the CSS uses).

### Pictures

A `GlArt` (`gl/paint/painter.ts`) is `{ key, width, height, draw(painter), scale?, corners?,
placeholder?, holdKey? }`. The renderer runs `draw` once everything it asks for (images, texts)
is ready or failed, bakes it into a texture, and every node showing that key draws one sprite.

- **Keys come from the props**: `artKey(name, props)` hashes every prop in a fixed order. Add a
  prop to the art's props type and it's in the key; don't hand-write keys.
- **Images and texts are two-phase**: `painter.image()` and `painter.text()` ask for what they
  need and return a status (or null); the picture is drawn again when one settles. Branch on the
  status for fallbacks (`ImageStatus` is `loading | ready | failed`).
- **Focusable pictures bake at the focused size** (`scale: dpr × focusScale`) so their text stays
  sharp under the focus scale.
- **Fonts**: a text waits for its face (`document.fonts.load`); if one was drawn in a fallback,
  the font epoch re-keys texts and pictures when the face arrives.
- `*.art.ts` and `*.metrics.ts` import the engine only from `gl/art` (lint): no React, Pixi,
  styled-components or CSS files. That keeps them runnable in unit tests and drawable by any
  painter.

### The engine

`frontend/src/shared/design-system/gl/`:

| Folder       | What                                                                                                                                                                                       | Imports             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `core/`      | The retained scene (`GlNode`), hit-testing, the frame scheduler (one 8 ms budget per frame for uploads, text and bakes), context-loss policy, reduced motion, easing                       | nothing             |
| `paint/`     | `Painter`, `GlArt`, `artKey`, text layout and rasterizing, the font epoch, `RecordingPainter`                                                                                              | `core`              |
| `resources/` | Image fetch and decode priorities, the texture budget (LRU by bytes)                                                                                                                       | `core`              |
| `bake/`      | The bakery: pictures waiting for their resources, baked within the frame budget                                                                                                            | `core`, `paint`     |
| `pixi/`      | The only place that imports `pixi.js`: backend (init, frame, context loss, stats), textures, `PixiPainter`, scene sync (culling, clips, baked layers, fade bands), Chromium 69 workarounds | everything above    |
| `react/`     | `GlSurface`, `GlLayer`, `GlScroller`, `GlGroup`, the hooks, `glSupport`                                                                                                                    | not `pixi` directly |

- **Pixi is its own chunk.** `GlSurface` loads `pixi/backend` with `import()`; startup preloads it
  when GL is on (`preloadGlBackend`). The web build never requests it. The Tizen build inlines
  dynamic imports, so there it's in the one bundle. Home waits for it in a Suspense boundary
  (`useGlBackendReady`) so its first focus finds the rows.
- **Nothing Home-specific in the engine.** Home declares its layers
  (`pages/home/homeGlLayers.ts`): the hero's backdrops (live), the hero's shade (a baked
  `GlLayer`), the rows in a `GlScroller` whose fade edge copies the hero layers under it, and the
  focus layer. `useGlLayer(name)` lets a component draw into a layer declared elsewhere.
- **Texture budget** per TV generation (`glTextureBudget` in `shared/config/tv-profile.ts`): 64 MB
  from 2020, 40 MB for older or unknown TVs.
- **The static focus outline**: in a row, `GlFocusAnchor` draws one outline where keys bring the
  focused tile to rest (`paging: 'anchor'`); tiles slide under it.

## Testing

| What                                                                                         | Where                                                                                   |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Scene, hit-testing, scheduler, budget, text layout, context loss, font epoch, models, layout | `gl/**/*.test.ts`, `*Visual.test.ts`, `heroDetailsModel.test.ts`, … (vitest `unit`)     |
| Each picture's variants                                                                      | `*.art.test.ts`: `RecordingPainter.record(art)` snapshots, and key checks               |
| The engine with WebGL: pointer, fallback                                                     | `MediaTileGl.stories.tsx` (vitest `storybook`, Chromium)                                |
| TV performance                                                                               | `scripts/tv-bench.mjs`, recorded in [tv-benchmarks.md](../development/tv-benchmarks.md) |

Not automated yet: a DOM/GL parity comparison per component. Changing a metric reaches both forms
by construction; changing a DOM view's markup without its picture (or the reverse) is caught only
by the picture's snapshot and by looking.

## Known limits

- GL is TV-only. Browsers composite the DOM rows on the GPU, so the web keeps them.
- Home only. Search's grid and the details page's episode list are DOM on the TV too; a GL form
  for them is a `Grid`/list GL view plus their pictures.
- The semantic twins are unpositioned: Samsung's reader speaks the focused element and draws its
  own highlight, which is acceptable on the TV and the reason GL isn't offered on the web.
- The empty row is plain text in both forms.
