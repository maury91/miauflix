# TV performance plan: every component, Home movement first

Status: plan. Measured on the Samsung TV (UE55TU8072UXXH, Tizen 5.5, Chromium 69, software
rasterization on two tile workers) over DevTools, with the build of `cad67322`.

This plan covers the JavaScript side: store traffic, re-renders and per-move effects. The CSS side
(styled-components inserting rules, paint properties that re-resolve) is covered by
[css-architecture.md](css-architecture.md) and its migration order. Each phase below says where
the two meet.

## Where Home stands

Four `ArrowRight` presses along an ordinary row, 600 ms apart:

| Metric                        | Value                                                    |
| ----------------------------- | -------------------------------------------------------- |
| Frame rate                    | 21 fps (median frame 17 ms, p90 180 ms, worst 283 ms)    |
| Frames over 50 ms             | 19                                                       |
| Main-thread tasks             | 2.9 s for 4 moves                                        |
| Store notifications           | 461, so every `useSelector` in the tree re-ran 461 times |
| `artwork/received` dispatches | 351, one per title, about 90 per move                    |
| Realtime interest dispatches  | 34 `publishFocusRequested` + 34 `publishMapRequested`    |
| DOM nodes                     | 324 at rest on Continue watching, 1,416 after the moves  |

A CPU profile of six moves (about 640 ms of busy main thread per key) puts the time in:

| Cost                                                            | Per key |
| --------------------------------------------------------------- | ------: |
| Memoized selector checks (reselect, `useSyncExternalStore`)     |  281 ms |
| Garbage collection                                              |  300 ms |
| styled-components render and `generateAndInjectStyles`          |  230 ms |
| immer copies of state (`shallowCopy`)                           |  225 ms |
| RTK `createReducer` matchers (every action through every slice) |  125 ms |
| RTK Query status selectors (`{...state, ...statusFlags}`)       |   91 ms |
| `artworkUrl`                                                    |   73 ms |
| `getInterestWindow`                                             |   47 ms |

(The profile rows overlap, since a selector check can trigger GC, so they add up to more than
640 ms.)

So one move costs more in store traffic than in rendering or painting. The cards themselves are
already memoized (`RowCard`), and the hero and backdrops are on their own layers.

## The cascade one move sets off

Stack traces taken inside the store's subscriber pin it down:

1. The selection moves. `homeNavigation` changes (1 dispatch) and the hero's title changes.
2. The hero's metadata query starts and settles (`mediaApi` changes three times: subscriptions,
   then queries, then queries and provided tags).
3. `useHomeFeed` selects **the whole `state.mediaApi` slice**
   (`frontend/src/pages/home/hooks/useHomeFeed.ts:100`). Any query anywhere changes it, so
   `continueMedia` is rebuilt: a new array of new objects from `mediaFromProgress`.
4. The new `continueMedia`:
   - re-renders HomePage;
   - is passed as the Continue watching row's `mediaOverride`, which rebuilds that row's
     `mediaByIndex` and re-renders every one of its cards (the media objects are new, so
     `RowCard`'s `memo` doesn't hold);
   - re-runs the row's `onMediaLoaded` effect (`CategoryRow.tsx:422`), which dispatches
     `artwork/received` **once per title** (`useHomeArtwork.ts:57`);
   - re-runs `useHomeArtwork`'s Continue watching and hero effect (`useHomeArtwork.ts:107`), which
     dispatches once per title again.
5. `artwork.received` stores the update whenever the revision is **equal or newer**
   (`store/slices/artwork.ts:19`). Re-sending the same artwork therefore replaces the entry with a
   new object every time. Each of the roughly 90 dispatches per move gives a new state, an immer
   copy and a notification.
6. Every `MediaCard` selects its entry (`MediaCard.tsx:50`). Each re-sent entry is a new object,
   so every mounted card whose title was re-sent re-renders, through styled-components.
7. In parallel, the row's `onScroll={onInterest}` (`CategoryRow.tsx` → `HomePage.tsx:212`)
   publishes the realtime interest on **every scroll event** of the smooth scroll: two dispatches
   per animation frame. Each one rebuilds `getInterestWindow` for every mounted row, runs through
   every reducer, and notifies every subscriber, even though nothing in the state changes. Those
   are the 98 notifications with no change.

Steps 3–7 are why Home is still lagging. None of them is needed to move the selection.

## Phase 1: stop the store storm (Home movement)

The biggest win for the least code. Do these first, in this order, and measure after each one.

### 1.1 Artwork: no-op updates must not change state

- `artwork.received`: keep the existing entry when the incoming one has the same revision and the
  same fields (`backdrop`, `logo`, `heroLogo`, both statuses). Accept it only when the revision is
  newer, or the same revision with different fields. Immer then returns the previous state, and
  `useSelector` callers see the same reference.
- Add `artwork.receivedMany(updates: ArtworkUpdate[])`, so a row or the hero sends one action
  instead of one per title. Use it in `useHomeArtwork` (`onMediaLoaded` and the Continue/hero
  effect), and batch realtime pushes in `realtime.middleware.ts:87` the same way. Push them within
  one frame through `receivedMany` instead of one dispatch per update.
- Tests: an equal update keeps `state.artwork` identical (`toBe`); `receivedMany` applies only
  newer revisions.

Expected: about 90 dispatches per move drop to 0 (nothing new), and the cards stop re-rendering
through the artwork selector.

### 1.2 `useHomeFeed`: select only the Continue watching titles

- Replace `useSelector(state => state.mediaApi)` with a memoized selector built from the
  `continueHydrationKeys` (`createSelector` over `mediaApi.endpoints.getMovie.select(id)` /
  `getShow.select(id)` for exactly those titles). It returns the same array while those entries
  are unchanged.
- Keep `continueMedia` referentially stable: reuse the previous `MediaDto` object for a title
  whose cached data didn't change (a small `useRef` cache keyed by `movie:id`/`show:id`), so the
  Continue row's `mediaOverride`, `mediaByIndex` and cards stay put.
- Test: a hero query settling does not change `continueMedia`'s identity.

Expected: HomePage no longer re-renders on every RTK Query change, and the Continue watching row
stops re-rendering on moves in other rows.

### 1.3 Realtime interest: publish on settle, not per scroll frame

- Remove `onScroll={onInterest}` from the row. Publish when the selection settles instead: when
  `alignRequest`/the selection changes, and on the smooth scroller's rest (add an `onRest`
  callback to `createSmoothScroller`). Debounce it to about 150 ms, so a held key publishes once.
- `useRealtimeInterest`: skip the dispatch when the focus and map are equal to the last published
  ones (compare a small key string), so a re-render with the same selection sends nothing.
- Optionally move the publish out of Redux entirely. `realtimeRuntimeActions` only feed the
  middleware; the realtime client can expose `publishFocus`/`publishMap` directly. That removes
  them from every reducer and subscriber.

Expected: 68 dispatches over 4 moves drop to at most 4, and `getInterestWindow` runs once per
settle instead of once per frame for every row.

### 1.4 Per-move mutations and preloads

- `promoteListMedia` (viewport tier) is already debounced. Make it skip when the viewport items are
  the same as the last call's.
- `queueBackdropFocus` runs when `mediaByIndex` changes. With 1.2 that only happens when a page
  loads, which is correct. Check it stays so.
- The NEARBY backdrop preload effect re-runs on every move. Fine on its own, but it allocates a
  URL list per move: memoize `artworkUrl` (see 2.3).
- RTK Query mutations dispatch `pending`/`fulfilled` into `mediaApi`/`listsApi`, which notifies
  every subscriber. Where the result isn't used (promotion, backdrop focus), call the endpoints
  with `fixedCacheKey`, or as a plain `fetch` through the base query, so they don't add
  mutation entries to the store.

### 1.5 Home navigation state

- `homeNavigation/setActiveCategory` was dispatched 15 times for 4 horizontal moves. Make the
  callers (`useHomeNavigation.ts:76`, `:118`) skip it when the category doesn't change, and make
  the reducer return early when the value is equal.
- The per-row selection (`selectedByCategory`) lives in HomePage state. Keep it there, out of
  Redux, as it is now.

### 1.6 Verify

- On the TV, repeat the four-move measurement (`tv-perf.mjs "ArrowRight*4" 600`) with the store
  subscriber that counts notifications. Target: at most 10 notifications per move, no
  `artwork/received` without new artwork, and median frames of 17 ms with a p90 under 34 ms.
- Re-run the CPU profile. The selector, immer and GC rows should fall by at least half.

## Phase 2: components (render cost per move)

Once Phase 1 has removed the needless renders, what's left is the cost of the renders that are
needed: the cards whose selection changes, the hero, and the rows mounted as you move down.

### 2.1 `CategoryRow`

- **Static CSS** (css-architecture.md, phase 2.2). Its 25 prop interpolations: `$gap`,
  `$peekWidth`, `$contentWidth` and `$side` become inline styles or `data-side`. A row mounting
  with a new peek width currently inserts rules.
- **Card window.** `rowRenderRadius` renders up to `min(10, mediaPerPage + 4)` cards on each side,
  about 19 per row, for every mounted row. Lower it on Tizen to `mediaPerPage + 2`, enough for
  the spring scroll to never show an empty slot, and measure.
- **Scrolling.** The row scrolls through `scrollLeft`, which on Chromium 69 with software raster
  re-rasterizes newly exposed tiles of the row's layer each frame. Try a `transform:
translate3d()` track inside an `overflow: hidden` viewport (as the legacy app did): the track is
  one composited layer moved by the compositor, and the cards rasterize once. This is measurable
  on its own; keep whichever is faster on the TV.
- **Handlers.** `RowCard` creates three inline closures and a ref callback per render. With one
  delegated `onFocus`/`onClick` on the scroller, reading `data-index`, the cards need no
  per-instance handlers, and `memo` compares fewer props.
- **`getInterestWindow`.** It builds two arrays and reads `scrollLeft`, a forced layout when the
  row moved. With 1.3 it runs only on settle; compute the visible range from the selection and
  `step` instead of `scrollLeft`.
- **Effects.** Nine effects re-check on every selection change. Group the ones that only care
  about the loaded pages (`onMediaLoaded`, `onDataReady`, `queueBackdropFocus`, the idle preload)
  so they depend on the pages, not on `selectedIndex`.

### 2.2 `MediaCard` / `ArtworkCard` (shared/ui/media-card)

- Already on vanilla-extract: its classes don't change with width, focus or progress.
- Select the artwork with a selector that returns only what the card renders (backdrop and logo
  path) and compare it with `shallowEqual`, so a status-only artwork change doesn't re-render it.
- Compute `progressForMedia` once per row, not per card: a `Map` from title to progress built in
  `HomePage`, passed down instead of the full `progress` array. Today every card scans the whole
  array, and a progress poll gives a new array that re-renders every card.

### 2.3 `media.utils.ts` (`artworkUrl`)

- 73 ms per key, on a pure function. Memoize it by `(path, kind, width)` with a bounded `Map` (a
  few thousand entries). The width is bucketed to the TMDB size first, so the key is the bucket.

### 2.4 `MediaHero`

- Already done: layers on Tizen, inline backdrop, fixed-pixel shade.
- Left to do: static CSS (css-architecture.md, phase 2.3; 19 interpolations in 10 components).
- Swapping the title re-renders the hero's text block (title, ratings, metadata, logo). Split it
  into a memoized `HeroDetails` keyed by the title, so the backdrop crossfade and the details
  don't re-render each other.
- The preparation status (`useHomePreparation`) updates the hero while the source prepares.
  Render it in its own memoized child, so status ticks don't re-render the hero.

### 2.5 `HomePage`

- Subscribes to `homeNavigation`, auth, admin and (through `useHomeFeed`) `mediaApi`. After 1.2,
  check with React's profiler which subscriptions still re-render it on a horizontal move. The
  row selection must stay the only HomePage change.
- `rowLoadState.visible.has(index)` and the `callbacksForRow` lookups are fine. The inline
  `onHover`/`onEnterNotifications` arrows for `HomeSidebar` re-render the sidebar on every
  HomePage render: make them stable callbacks.
- Static CSS for `Content`, `Rows` and `RowSlot` (6 interpolations; `$margin` becomes inline).

### 2.6 `HomeSidebar` and `NotificationsMenu`

- The sidebar is always on screen. Memoize it and pass it stable callbacks (2.5), so a row move
  doesn't render it.
- `NotificationsMenu` (13 interpolations in 14 components) only renders when it's open. Migrate
  its CSS in phase 2.4 of css-architecture.md; nothing per-move.

### 2.7 DOM size

- Nodes grew from 324 to 1,416 as the rows below became active. This is the mounted rows times
  about 19 cards each, so it's expected, not a leak. To confirm, go back and forth for a minute
  and check the count stays flat. Lowering the card window (2.1) and `MOUNTED_ROWS_BELOW` on Tizen
  reduces style and layout cost on every move in proportion.

## Phase 3: startup and the intro

- Done: the intro's layers, the settle wait before the logo, the waiting pulse's transform
  fallback, and idle preloading after the intro.
- `IntroAnimation`, `AppShell`, `Logo`: static CSS (css-architecture.md, phase 1.6 and 2.1); the
  logo's placement changes during the intro insert rules today.
- The few 64–95 ms frames late in the expansion (letters at 10×) come from rasterizing large
  glyph layers. Try animating a pre-rasterized SVG (one `<img>`) instead of the letters for the
  last part of the expansion.
- Defer the code not needed on Home (details, player, search, settings) with `React.lazy`, so
  the TV parses less script before the first frame. Measure the parse time first: if it's under
  200 ms, skip this.

## Phase 4: details

- `MediaDetails` (30 interpolations in 17 components, 955 lines): migrate to static CSS
  (css-architecture.md, phase 3). It's the biggest remaining inserter.
- `EpisodesSection`: each season change re-renders the episode list. Memoize the episode cards
  like `RowCard`, and window the list on Tizen if seasons exceed about 20 episodes.
- `SourcePreparationStatus`: renders on every preparation tick. Keep it a leaf that selects only
  its own status.

## Phase 5: player

- `PlayerView` (1,220 lines), `PlayerControls`, `SubtitleTiming`, `SubtitleMenu`: static CSS
  (css-architecture.md, phase 4).
- The playback position updates the UI several times a second. Make sure only the progress bar
  and time label re-render: hold the position in a ref and a small subscribed component, not in
  `PlayerView` state.
- Hide the controls with `opacity`/`transform` on their own layer, not by unmounting, so showing
  them on a key press doesn't rasterize them again.
- Subtitles: render each cue with a `textContent` update on one element, not a React re-render
  of the overlay.

## Phase 6: search, settings and sign-in

- These run less often; migrate their CSS in css-architecture.md's order.
- `OnScreenKeyboard`: memoize the keys and move focus without re-rendering the keyboard (one
  `data-focused` attribute set directly).

## Cross-cutting

- **Store shape.** Every action runs every reducer's matchers (125 ms per key in the profile),
  and every notification runs every selector. Phase 1 cuts the action count. After it, if
  `createReducer` matchers still show up, check that the RTK Query `extraReducers` matchers
  (`isAnyOf` over all endpoints) are not over-broad.
- **GC.** Most of the 300 ms per key is short-lived arrays and objects: `mediaFromProgress`
  results, interest windows, artwork updates, selector results. Phases 1 and 2 remove most of
  them; re-profile afterwards.
- **Measurement.** Keep the TV scripts (frame stats, store-notification counter, CPU profile)
  next to this plan under `scripts/tv-perf/` so each change is measured the same way. Without
  the store counter, regressions in Phase 1 are invisible.
- **Guard rails.** Add a unit test that renders Home with the real store, moves the selection
  once, and asserts the number of store notifications and `MediaCard` renders. That keeps the
  cascade from coming back.

## Order of work

1. Phase 1 (1.1 → 1.6), measured on the TV after each step.
2. 2.3 `artworkUrl` memoization and 2.2 per-row progress map: small, independent.
3. 2.1 `CategoryRow`: card window, then the transform track experiment, then static CSS.
4. 2.4–2.6 hero, HomePage and sidebar.
5. Phases 3–6, following css-architecture.md's migration order for the CSS parts.
