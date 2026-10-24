# TV source support plan

Status: core implementation is in place. Remaining edge cases and broader integration coverage are listed in [ToDo.md](../../ToDo.md).

## Confirmed behavior

- Discover sources for individual episodes and season packs using the existing provider, source, queue, and playback infrastructure.
- Keep one torrent per info hash, with episode-to-video-file associations. Select files explicitly rather than selecting the largest video.
- Combine file selections across active playback, prefetch, and retained download consumers. Releasing one consumer must not deselect another consumer's files.
- Bind streaming keys to an episode and its resolved source file. The same key permits embedded subtitles and associated episode sidecars, but cannot access another episode or arbitrary pack files.
- Prefer exact single-episode files. Multi-episode videos are a last resort when no usable exact source exists; do not claim episode-accurate boundaries. See root ToDo.md.
- After all currently requested files finish, seed until the configured timeout (`CONTENT_SEED_DURATION_SECONDS`), then detach when active reads permit. Preserve metadata and downloaded pieces. A newly requested incomplete episode cancels the old deadline; start a fresh configured window after requested files finish. Completed files remain playable from storage. Pack detachment allows later reattachment for another episode rather than permanently making the entire pack local-only.

## Search and download ahead

- While an episode is playing, discover sources for the next episode in catalog order, including season transitions. This source-only preparation does not warm the episode file before the 70% threshold.
- At 70% playback progress, send an authorized prefetch request for the next available episode. The current file has higher piece priority within a shared torrent. For a separate torrent, pause the selected episode while any active playback file is incomplete, then resume it when the active file is fully buffered. If the current file is already complete, prefetch can proceed immediately.
- Deduplicate progress-triggered jobs across repeated events and concurrent clients. A seek past 70% should trigger the same idempotent request. The exact bandwidth policy remains to be defined.
- For watchlisted shows, periodically discover newly released episodes and download them when capacity permits. Release dates alone do not establish source availability; retry empty searches with bounded backoff.
- Start acquisition at the episode following the user's latest watched episode in catalog order: progress through S01E07 makes S01E08 the next target. Reuse existing watched/progress semantics and handle season transitions. With no viewing history, default to the first regular episode; specials require explicit interest.
- Under storage pressure, prioritize active playback and the current show’s next episode. Watchlist acquisition jobs are weighted by owner count and recent progress. Admission first evicts the least recently interested speculative storage, then an idle completed TV torrent if needed; active playback is protected. Pack eviction removes the shared torrent’s stored files as a unit while preserving source and episode associations for later reacquisition.

## Credits detection and next-episode autoplay

Research performed on 2026-10-11: detecting credits is feasible, but not universally reliable. There is no verified general credits-timestamp service established for this project by this research.

- [Intro Skipper's own documentation](https://github.com/intro-skipper/intro-skipper/wiki/) describes named chapter detection, recurring audio matching with Chromaprint, and visual black-frame analysis. Named chapters are the simplest first path; audio matching benefits from multiple episodes sharing closing music; dark-frame evidence alone is insufficient to identify credits confidently. The Jellyfin plugin is a reference, not a drop-in backend dependency.
- [Its visual detection documentation](https://github.com/intro-skipper/intro-skipper/wiki/Settings-%E2%80%90-Black-Frame) also describes uniform low-saturation credit cards and boundary refinement. Credits over live action or colorful animation remain important validation cases.
- [Plex documents file-specific credit markers](https://support.plex.tv/articles/credits-detection/), local analysis, and its own cloud marker lookup. [Plex's engineering explanation](https://www.plex.tv/blog/let-the-next-episode-roll/) describes combining text detection and black frames with machine learning. This demonstrates feasibility, not availability of a public marker API for Miauflix.

Implemented first pass: inspect end-credit chapter titles through existing media probing. When a usable marker is present, the player offers a five-second cancelable transition; otherwise it offers the final-90-second countdown. Bounded background tail analysis remains future work. Before enabling it, compare detections against representative offline fixtures and cache markers by exact torrent/video file identity and analysis version on the original media clock. Missing tail pieces, uncertain detections, unavailable analysis, or failure must use the fallback and never block playback. Analysis must respect playback priority and storage admission rather than downloading an entire pack.

### Required player behavior

- With a reliable credits-start marker, show `Play next episode (5s)` at that marker, decrement the countdown, and invoke the same next-episode action as a click when it reaches zero.
- Without a reliable marker, show `Play next episode (90s)` at 90 seconds before the episode ends. Count down using remaining media time so it reaches zero at the end, rather than jumping immediately after five seconds. If entering this window late, display actual remaining time.
- Only offer the transition when a next episode exists and has a usable source; if preparation is still pending, show that state without an automatic transition into an unavailable episode.
- Clicking starts the next episode immediately. Provide a keyboard-accessible cancel/stay action. Freeze automatic countdowns while paused or buffering; clear stale timers on seeks, source changes, navigation, and session teardown. A dismissed countdown stays dismissed for that playback session. Dispatch at most one transition even if click, timer, and ended events coincide.
- Short episodes use their actual remaining duration rather than displaying an impossible 90-second countdown. Unknown or non-finite duration cannot use the timed fallback. Combined-episode fallback files have no reliable per-episode end: suppress timed autoplay until episode boundaries are known.
- Mid/post-credit story scenes are a known limitation of credits-start autoplay. Preserve the requested five-second behavior and allow cancellation; record future scene-aware improvements in ToDo.md rather than assuming credits mean no remaining story.

## Storage priorities and eviction

1. Protect active playback and its buffering needs.
2. Prioritize the next episode of the show currently playing.
3. Allocate remaining capacity to next unwatched episodes of watchlisted shows, prioritizing current and near-future interest using recent viewing activity. A stale watchlist entry must not displace active viewing needs.
4. Download additional released episodes only after higher-priority requests fit.

Watched episodes may be evicted automatically to make room, preferring older episodes and shows with less recent interest. Protect active playback, its required subtitles, and explicitly retained downloads. Eviction must account for every consumer of shared storage, including other accounts: one user's watched status must not remove files needed by another active or higher-priority consumer. Reclaim only bytes no remaining consumer needs, and keep torrent metadata and episode associations for later reacquisition.

Reserve estimated bytes before admitting concurrent downloads; reconcile against torrent file metadata and actual stored bytes. Count shared torrent pieces once. Do not assume whole-pack size is required for one selected episode. Failed capacity admission must remain retryable. The exact ranking weights are implementation details to settle against existing progress and storage behavior; they must preserve the priorities above.

## Notifications

- Movies: notify both users who watchlisted the movie and users who previously started watching it, including incomplete viewing, when a discovered source improves release quality (for example CAM to WEB). A user who stopped because of CAM quality remains eligible. Deduplicate users belonging to both audiences. Define release-quality improvement separately from resolution or seed count.
- TV: notify interested users when a newly released episode first gains a usable source. Metadata release and source discovery are separate events.
- Persist per-user notifications and deduplicate repeated scans/provider results. Avoid generating a historical backlog when initially adding a show to a watchlist.
- Place the notification control at the top of the sidebar. Clicking it opens a compact overlay menu over Home, with unread state, keyboard navigation, dismissal, and focus restoration.
- Decide click destination and whether later movie upgrades each warrant a new notification before implementation.

## Implemented sequence

1. Trace existing torrent/storage ownership, playback keys, progress, watchlist jobs, and sidebar behavior.
2. Preserve TV identity and coverage in provider metadata and implement conservative episode/file matching.
3. Add episode associations and shared torrent ownership, retaining existing movie IDs, encrypted metadata, and stored downloads.
4. Add episode discovery, watchlist jobs, episode-scoped playback/subtitle authorization, per-file selection, completion, and reattachment.
5. Add next-episode discovery and prefetch, watchlist release scans, storage admission/eviction, and persistent notifications.
6. Add the sidebar notification overlay and chapter-marker/fallback player countdown.

## Acceptance proof

Current proof includes backend and frontend TypeScript checks, exact/combined matcher tests, storage admission and eviction-candidate tests, and offline source-matcher coverage. Broader integration tests still need to cover cross-episode authorization, embedded and sidecar subtitles, concurrent users of one pack, late reattachment, season transitions, S01E07-to-S01E08 watchlist acquisition, notification deduplication, and keyboard focus behavior. See [ToDo.md](../../ToDo.md).

## Current scope notes

- Clicking the sidebar control opens the overlay. Clicking a notification marks it read; notifications do not deep-link to title details yet.
- Storage eviction removes an idle completed TV torrent as a unit. It does not reclaim individual files from a retained pack.
- Combined videos remain a last resort and do not get episode-boundary autoplay until trustworthy boundaries are available.
