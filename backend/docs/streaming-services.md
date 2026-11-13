# Streaming services

Playback sessions, preloading, seeking, audio conversion, subtitles, and resume playback are implemented. This page describes their ownership and current API; it does not claim continuous adaptive-bitrate streaming or universal codec compatibility. See [Watching](../../docs/features/watching.md) and [Audio and subtitles](../../docs/features/audio-subtitles.md) for plain-language explanations.

## Source discovery and selection

The standalone sources service owns indexer requests. The backend stores candidates, retrieves torrent metadata, verifies video files, associates episodes, and selects a playback target. The backend does not fetch indexer web pages directly.

Selection prefers suitable completed local downloads, then considers quality, device codec support, and bitrate preferences. The client may exclude source IDs that already failed. Source availability and actual media verification are separate from indexer search success.

`preferences.maxBitrateKbps` influences source ordering rather than providing a strict network-speed limit. Movies use file size and runtime estimates; episodes use their own file size rather than a whole season pack. The Samsung player requests an 8 Mbit/s preference. A user-facing Watch Now quality picker remains planned.

## Sessions and streaming grants

`POST /api/playback/sessions` accepts a movie or episode reference and client playback preferences. It authenticates the user, selects a source, and returns preparation status, delivery information, an expiring streaming key, and a stream URL. Modern grants are bound to a user, playable item, and selected source; the stream route must not silently rerank them to another source.

The direct `GET /api/stream/:token` path validates the grant and serves the selected video with HTTP byte-range support. The frontend/session preparation can request another source when a source is unusable; this is different from changing the target of an already-issued grant.

## Preparation and download buffering

Preload intents are scoped to account, session, and client. They support sequence-aware updates and cleanup, and share preparation work with subsequent playback. Browse focus can warm the file prefix and container tail and begin audio/subtitle inspection. During playback, the download layer fetches video ahead of the reader. Episode grants also support best-effort next-episode prefetch.

Preloading uses `/api/preload/intents/:clientId` and `/api/list/priorities`, with corresponding realtime operations.

## Audio and video delivery

Clients report native and MediaSource codec support, preferred audio languages, native audio-track selection, HEVC containers, and optional bitrate preferences. FFprobe inspection is shared, but delivery decisions are made for each client's capabilities. Sessions consult completed probes without waiting for an unknown file to finish inspection: they can return direct delivery with `deliveryPending` while a background probe produces session-scoped delivery updates.

- Compatible media can play directly.
- FFmpeg can remux to fragmented MP4 while copying supported audio and video.
- An unsupported selected audio track is converted to stereo AAC.
- Compatible HEVC can be copied into fragmented MP4 with an `hvc1` codec tag.
- `CONVERT_H265_TO_H264`, disabled by default, permits CPU-bounded H.264 conversion up to 1080p/30 fps when required. Compatible clients retain original video.
- When HEVC cannot be delivered and conversion is disabled, source selection can fall back to H.264.

The audio stream endpoint accepts a start time and selected track; seeking or switching tracks can restart converted delivery at the requested position. FFmpeg reads verified decrypted ranges through a private loopback endpoint rather than requiring a plaintext video file on disk. The Tizen frontend can instead use Samsung AVPlay for native playback, with conversion/browser playback for unsupported audio.

## Subtitles

Local subtitle discovery covers embedded text tracks and matching SRT/VTT/ASS/SSA files in the torrent. WebVTT remains the default delivery format. Candidates mark local ASS/SSA tracks as `styled`; requesting `format=ass` preserves headers, styles, and Dialogue events, dropping event comments and embedded Fonts/Graphics sections. Embedded delivery uses overlapping two-minute windows, aligned to minute boundaries on the original media clock and refreshed during playback and after seeks. Sidecars are delivered whole. Subtitle selection and timing are per account/title.

The browser loads JASSUB on demand for styled tracks when workers, WebAssembly, and transferable OffscreenCanvas are available. Renderer failure falls back to WebVTT. The Tizen build excludes JASSUB. Plain browser and AVPlay captions share `SubtitleCaption`, moving above open controls; styled rendering fits the subtitle picture between the header and control bar without changing the video.

Embedded ASS/SSA candidates expose `embeddedFonts` when the video has font attachments. `/font` selects the dialogue style's matching attached font for plain captions; `/fonts` lists `{ fonts: [{ id, names }] }`, and `/fonts/:fontId` serves an attachment for styled rendering. Only parsed TrueType/OpenType fonts are served. Extraction is bounded to 32 MiB per font and 96 MiB per styled font set; the in-memory font-set cache is also bounded to 96 MiB. Partial sets expire after 30 seconds so a transient read can be retried. Separate torrent font files are not loaded. The browser renders immediately with bundled Liberation Sans while fonts arrive; it does not request local font access or remote font lookups.

Track and font requests revalidate the candidate against a live streaming grant for the same source, user, and title, including cache hits. Responses use private, no-store caching. Track delivery is limited to 5 requests per second, dialogue-font and font-list requests to 1 each, and individual styled-font requests to 10.

OpenSubtitles is optional and requires its configured API key. Search currently applies to movies with an IMDb ID; episodes can use local subtitle tracks. Image-based PGS/VobSub conversion is not implemented.

## Storage and playback progress

Torrent pieces are stored encrypted. Downloads can keep seeding for a configured period, then detach while retaining local files. Storage budgets and file claims control reclamation; active playback is protected. Administrators can inspect storage and remove inactive downloads.

Per-account progress supports resume and Continue watching. Episode playback can prefetch and advance to the next episode, using named credits chapters (including anime ED/Ending/Outro in the second half) or a final-90-second countdown. Delivery exposes `creditsStartSeconds` and, when a later content chapter exists, `creditsEndSeconds`. Preview, eyecatch, logo, sponsor, and end-card chapters do not count as that content. With a post-credits target the player offers a five-second Skip credits countdown and a Watch credits cancellation; next-episode continuation starts no earlier than that target.

Opening chapters expose `introStartSeconds` and `introEndSeconds` for a manual Skip intro prompt. They must start in the first half, end at a following non-opening chapter before the video ends, and last at most five minutes. Skip actions share the player's seek path, including restarting converted delivery. These are chapter-based decisions; combined multi-episode videos and scene-aware credits/post-credit analysis remain in [ToDo.md](../../ToDo.md).

Audio inspection lists streams without dumping attachment data, then reads only the first video's extradata separately. This avoids attached fonts overflowing the probe output cap and losing audio, duration, and chapter information.

## Route summary

Paths below are mounted under `/api`. Stream grants authorize media delivery separately from API JWT authentication.

| Method and path                                                       | Purpose                                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST /api/playback/sessions`                                         | Authenticated playback preparation/session creation                             |
| `PUT /api/preload/intents/:clientId`                                  | Authenticated preload-intent update                                             |
| `DELETE /api/preload/intents/:clientId`                               | Authenticated preload-intent cleanup                                            |
| `GET /api/stream/:token`                                              | Direct video delivery with byte ranges                                          |
| `GET /api/stream/:token/audio`                                        | Remuxed/converted delivery, with validated start/track options                  |
| `POST /api/stream/:token/prefetch`                                    | Best-effort next-episode prefetch for an episode grant                          |
| `POST /api/subtitles/search`                                          | Authenticated subtitle lookup for the user's streaming key                      |
| `GET /api/subtitles/tracks/:candidateId?streamingKey=&start=&format=` | Authorized track/window delivery (`vtt` default; `ass` for styled local tracks) |
| `GET /api/subtitles/tracks/:candidateId/font?streamingKey=`           | Matching attached dialogue font, or 404                                         |
| `GET /api/subtitles/tracks/:candidateId/fonts?streamingKey=`          | Attached font IDs and names for styled rendering                                |
| `GET /api/subtitles/tracks/:candidateId/fonts/:fontId?streamingKey=`  | One attached font by listed ID                                                  |

See the [playback request schema](../src/routes/playback.types.ts) and [route registration](../src/routes/index.ts) for exact contracts. Rate-limit values passed to the factory are requests per second; do not interpret `rateLimitGuard(60)` as 60 requests per minute.

## Configuration and implementation references

Use the administrator configuration editor for download, storage, subtitle, and source-service settings. Download settings include `CONTENT_DOWNLOAD_LIMIT`, `CONTENT_UPLOAD_LIMIT`, `CONTENT_SEED_DURATION_SECONDS`, `DISABLE_DISCOVERY`, `PRELOAD_WARM_TARGET`, and `CONVERT_H265_TO_H264`. Their configuration schemas define the units, transforms, and defaults. Source-service provider settings are published by the remote service and managed through the backend.

- [Session creation](../src/services/playback/playback-session.service.ts)
- [Preload routes](../src/routes/preload.routes.ts)
- [Stream routes](../src/routes/stream.routes.ts)
- [Audio inspection and FFmpeg delivery](../src/services/playback/audio-playback.service.ts)
- [Download configuration](../src/services/playback/playback.configuration.ts)
- [Download layer](../src/services/download/download.service.ts)
- [Storage ownership](../src/services/storage/storage.service.ts)
- [Local subtitle extraction](../src/services/subtitles/source-subtitles.service.ts)
- [Subtitle provider and delivery](../src/services/subtitles/subtitles.service.ts)
- [Sources service](../../services/sources/README.md)
