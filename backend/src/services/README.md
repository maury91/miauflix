# Backend services

Each folder owns one area. Folders named after a remote service (`catalog/`, `list/`, `media-load/`,
`sources-client/`) hold the client for that service and its configuration.

## Sources

- `source/` — source domain logic in this backend: which sources a title has, their availability
  and health, their file list, and which file is the video (`video-files.ts`).
- `sources-client/` — the HTTP client for the sources service, which discovers sources.
- `media-load/` — the client for the media-load service, which downloads and stores source data.
- `storage/` — what media-load keeps on disk, joined with the titles of its sources, for the admin
  storage screen.

## Playing a title

Three folders take part, in this order:

1. `preload/` — before playback. It picks the source for a title, and warms its first bytes while
   the user browses or opens details (`preload-intent`, `source-warmup`, `playable-preparation`).
2. `playback/` — during playback. It turns a playback grant into the file to serve (`stream.service`),
   opens the playback session, decides audio delivery and conversion, and reports downloaded pieces.
3. `subtitles/` — the subtitle tracks for a playback, from the source files and from providers.

`preload/` uses `playback/` for the target types and the source filters. A playback session calls
`preload/` to prepare its source, so a source warmed during browsing is reused when the user
presses Watch.

## Layering

Routes call services; services never import from `routes/`. Types that both sides use (playable
refs, progress, preload snapshots, search messages, ratings, storage views, `UserDto`, the API
error body) live in `src/types/` and are imported as `@mytypes/...`; ESLint rejects `@routes/...`
imports outside `routes/`. Routes do not call repositories directly: account ratings go through
`ratings/`, storage through `storage/`.

Routes report failures by throwing `HttpError` (`@errors/http.error`) or a typed service error;
the app's error handler (`@middleware/error-handler.middleware`) turns them into the standard error
body. Logs go through `@logger`, never `console`.

Services with many dependencies take one options object rather than positional arguments, for
example `new PlaybackSessionService({ db, preparation, config, ... })`.
