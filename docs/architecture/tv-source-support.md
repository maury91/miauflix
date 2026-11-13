# TV source and episode playback architecture

TV playback combines catalog episode identity, source discovery, explicit video-file associations, per-file storage claims, and user-bound streaming grants. A season pack is shared storage containing independently selectable episode files.

See [source identity and file claims](source-identity-and-file-claims.md) for the data model and [System overview](system-overview.md) for service ownership.

## Catalog identity and source matching

The catalog service supplies shows, seasons, episode numbers, runtimes, and air dates. The backend mirrors the records needed for source associations and playback. Catalog presence and an air date do not establish that a video is available.

The sources service searches providers by supported identifiers and title/season/episode variants. Searches can return single episodes or season packs. The backend persists normalized sources, resolves torrent metadata, verifies usable video, and associates episodes with video paths.

Exact single-episode matches are preferred. A combined-episode video is a fallback and carries `matchKind: combined`; the application does not infer accurate episode boundaries by dividing its duration. A provider-relative path must resolve to an exact or unique suffix match in the actual torrent layout. Canonicalized paths persist on the association.

Implementation: [source planner](../../services/sources/src/planner/planner.ts), [episode matcher](../../backend/src/services/source/episode-file-matcher.ts), [target resolution](../../backend/src/services/playback/playback-target.service.ts), and [episode associations](../../backend/src/repositories/episode-source.repository.ts).

## Episode authorization and delivery

A playback session selects a source for a movie or episode and creates an expiring grant bound to that user, playable identity, and source. Stream requests validate the grant and resolve its associated file. One episode's grant does not authorize arbitrary files elsewhere in the pack.

Supported local subtitle tracks belong to the selected video or its matching sidecars. Audio and subtitle probes are keyed by source and video path. Per-account choices and timing remain independent when viewers share torrent data.

Completed probes determine device-specific delivery immediately. An unknown file can start direct playback with `deliveryPending` while a background probe supplies delivery information. Native playback, remuxing, and conversion depend on the client's capabilities. The player receives session-scoped delivery updates.

Implementation: [playback sessions](../../backend/src/services/playback/playback-session.service.ts), [stream routes](../../backend/src/routes/stream.routes.ts), [stream authorization](../../backend/src/services/playback/stream.service.ts), and [local subtitles](../../backend/src/services/subtitles/source-subtitles.service.ts).

## Next-episode preparation

The player prepares the next episode's source in catalog order, including season transitions. It can request the selected next episode's download through its authorized `/api/stream/:token/prefetch` route. The request is best-effort and uses a `prefetch` claim; a movie grant is rejected by this route.

Playback claims have higher piece priority than prefetch claims. File selections combine all live consumers, so preparing one episode does not deselect another viewer's file. Speculative downloads yield to active playback that still needs data according to the download layer's pause/resume policy.

The player deduplicates its next-download request by episode identity. Seeking or repeated progress reports do not require a separate copy of the same episode.

Implementation: [player preparation](../../frontend/src/features/player/ui/PlayerView.tsx), [prefetch authorization](../../backend/src/routes/stream.routes.ts), and [download ownership](../../services/media-load/src/engine/download.service.ts) in the media-load service.

## Credits and automatic continuation

Media inspection reads named end-credit chapters when available. The player can offer a five-second transition from a usable credits marker. Without one, its fallback counts down the remaining playback time during the final 90 seconds. A next episode must be prepared before an automatic transition is offered.

Controls allow the viewer to play next immediately or cancel. Playback state, seeks, navigation, and session teardown govern the countdown; a combined-episode fallback has no reliable per-episode boundary for timed continuation. Named credits do not establish that no story scene follows them.

Implementation: [chapter inspection](../../backend/src/services/playback/audio-playback.service.ts), [player](../../frontend/src/features/player/ui/PlayerView.tsx), and [player controls](../../frontend/src/features/player/ui/PlayerControls.tsx).

## Watchlist acquisition

Recurring backend jobs gather local TV-watchlist interest and viewing progress. Owner count and recency influence acquisition priority. Acquisition uses the owners' most recent progress: an unfinished episode remains the immediate target, while a completed episode advances the target in catalog order. Regular episodes are the starting point for a show without history.

Acquisition searches for playable sources and attempts downloads within storage capacity. Empty or pending source results remain distinguishable from verified availability. Admission failure does not turn a catalog episode into a permanently unavailable title.

Implementation: [background job handlers](../../backend/src/services/background-job/background-job.handlers.ts), [list scheduling](../../backend/src/services/media/list.schedule.ts), and [source availability](../../backend/src/services/source/source-availability.service.ts).

## Shared storage and retention

A single normalized source owns torrent data for all associated episodes. Storage reservations and completion follow selected files and piece boundaries. All consumers' live claims contribute to selection and retention, including other accounts and subtitle sidecars.

The configured seeding window starts when currently requested files are complete. An incomplete request reopens completion state. Detaching an idle completed torrent retains encrypted data, and a later episode request can attach it again for missing pieces.

Cleanup can reclaim individual eligible files from a retained pack. It protects active playback and stronger claims, and accounts for shared boundary pieces. Source records and episode associations remain available for reacquisition. See [file reclamation](source-identity-and-file-claims.md#per-file-reclamation-and-concurrency).

## Notifications and navigation

Movie quality-upgrade notifications target users with local watchlist or viewing interest. Episode notifications target interested accounts when a recent episode gains a verified source. Availability requests support notification when the requested playable becomes available. Notifications persist per user and are deduplicated.

The Home sidebar opens the notification menu. Users can view unread or read items, mark one or all items read, and open the related playable or show details. Notification actions preserve remote/keyboard navigation behavior; they are not limited to dismissing a message.

Implementation: [notification service](../../backend/src/services/notifications/notification.service.ts), [Home actions](../../frontend/src/pages/home/HomePage.tsx), and [notification targets](../../frontend/src/features/notifications/lib/notification-copy.ts).

## Scope and verification

Accurate boundaries for combined-episode videos and scene-aware credits analysis are not implemented. [ToDo.md](../../ToDo.md#tv-source-support) tracks these features and additional integration coverage. Implementation and test files beside the owning modules define the supported behaviors; documentation does not establish a passing result for a particular checkout.
