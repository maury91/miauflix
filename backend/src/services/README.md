# Backend services

Each folder owns one area. Folders named after a remote service (`catalog/`, `list/`, `media-load/`,
`sources-client/`) hold the client for that service and its configuration.

## Sources

- `source/` — source domain logic in this backend: which sources a title has, their availability
  and health, their file list, and which file is the video (`video-files.ts`).
- `sources-client/` — the HTTP client for the sources service, which discovers sources.
- `media-load/` — the client for the media-load service, which downloads and stores source data.

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
