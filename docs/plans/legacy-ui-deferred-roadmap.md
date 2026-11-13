# Legacy UI Restoration: Deferred Roadmap

## Status

Deferred. The active implementation scope is the legacy-style home browser and media details
experience. Session selection and a general application navigation foundation are intentionally
not part of the current work.

Future UI work must use Miauflix's deterministic in-house navigation model rather than
`@noriginmedia/norigin-spatial-navigation`. A focused region owns directional input while it can
handle it and returns an explicit escape direction only at a meaningful boundary. Navigation must
be derived from application state and known layout, not DOM geometry.

## Movie playback

Restore movie playback after the details experience is complete.

- Add a typed frontend mutation for `POST /api/movies/:mediaId/:quality`.
- Play `/api/stream/:token` with the installed `video.js` dependency.
- Support play, pause, seeking, Back, loading, expiry, and unavailable-stream states.
- Restore the legacy player overlay: dimmed background, red progress, elapsed and total time,
  paw-shaped position marker, and stream-recovery action where supported.
- Return to the originating details view without losing its logical navigation state.
- Make the player a navigation region that consumes media and directional controls without using
  spatial or geometric focus discovery.

## Playback progress and Continue Watching

The current progress routes are placeholders even though progress entities and a repository
already exist. Complete the existing responsible layer rather than adding a parallel system.

- Scope reads and writes to the authenticated user.
- Upsert movie and episode position, status, and update time.
- Save progress periodically and on pause, exit, and playback completion.
- Resume playback from the saved position.
- Return hydrated media data needed by the frontend.
- Add Continue Watching only when it contains items.
- Render progress on browse cards and episode cards.
- Define and test completion and replay thresholds.

## TV episode playback

Show and season metadata are available, but current streaming keys and stream resolution are
movie-only. Do not show an enabled episode Watch action until the backend path exists.

- Audit whether the current source infrastructure can resolve episode sources.
- If supported, add episode-aware source selection and streaming keys.
- Extend streaming authorization without weakening token ownership or expiry checks.
- Track episode identity and progress through playback.
- If sources cannot be supported yet, expose a clear unavailable state instead of a dead control.

## Authentication and configuration visual alignment

Keep current authentication, initial setup, QR login, and configuration behavior. Later, align
their presentation with the restored entertainment UI:

- black cinematic canvas;
- context-sensitive Miauflix logo placement;
- viewport-relative type and spacing;
- red deterministic focus treatment;
- clear keyboard and remote states;
- responsive stacking for smaller screens.

Do not reintroduce legacy authentication semantics as part of this styling work.

## Search and sidebar expansion

The legacy sidebar displayed Search, but the current backend has no catalog-search endpoint. Do
not restore a decorative Search action.

- Add sidebar destinations only when they perform a real action.
- Treat catalog search as its own backend-and-frontend vertical slice.
- Apply the same focused-region boundary protocol used by browse and details.

## Deferred verification

When each deferred slice is implemented, add:

- pure navigation transition tests, including every boundary escape;
- API and error-state tests;
- 1920x1080 visual snapshots;
- keyboard, remote, and pointer end-to-end paths;
- focus restoration checks across player, details, and browse;
- loading, empty, expired-session, unavailable-source, and playback-error coverage;
- TypeScript, lint, unit, build, frontend E2E, and visual-regression gates.

## Intended order

1. Movie playback.
2. Playback progress and Continue Watching.
3. TV episode streaming capability.
4. Authentication and configuration visual alignment.
5. Search/sidebar expansion when a real search API exists.
6. Final cross-surface polish and regression pass.
