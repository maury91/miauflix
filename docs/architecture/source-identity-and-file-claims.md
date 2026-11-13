# Source identity, playback targets, and file claims

Miauflix separates a downloadable source from the movies or episodes it contains, the file a viewer plays, and the consumers that need that file. This separation lets several accounts play different episodes from one season pack without sharing a mutable file selection.

See [TV source architecture](tv-source-support.md) for episode discovery and continuation, and [System overview](system-overview.md) for service boundaries.

## Source and association records

| Record             | Identity and responsibility                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `ContentSource`    | One source per normalized torrent info hash; provider metadata, quality, codec, torrent metadata, and video verdict |
| `MovieSource`      | Unique movie/source association with a nullable main-video path                                                     |
| `EpisodeSource`    | Episode/source/file association with a `single` or `combined` match kind                                            |
| `Storage`          | Encrypted source storage, layout, verified pieces, allocation, and seeding state                                    |
| `StorageFile`      | A file's path, offset, length, and completion state within source storage                                           |
| `StorageFileClaim` | One consumer's live request for a file or byte range                                                                |
| `PlaybackGrant`    | Expiring authorization bound to a user, playable identity, and source                                               |

Info hashes are trimmed and lowercased before deterministic encryption. Database uniqueness and repository lookups therefore use one identity regardless of provider casing. Association rows allow one source to contain several movies or episodes without duplicating the source or its storage.

Sensitive file paths are encrypted. Deterministic encryption is used where equality and uniqueness checks require matching stored values. Raw SQL must use the encrypted stored representation and physical column names.

Implementation: [source entity](../../backend/src/entities/content-source.entity.ts), [movie association](../../backend/src/entities/movie-source.entity.ts), [episode association](../../backend/src/entities/episode-source.entity.ts), and [source repository](../../backend/src/repositories/content-source.repository.ts).

## Explicit playback targets

A `PlaybackTarget` names a source, file path, and match kind, with an optional probed duration. Downloading, warming, reading, audio inspection, and subtitle operations use this target. The encrypted layout describes the file table; it does not choose a globally active video.

For a movie, `PlaybackTargetService` uses the path saved on its movie/source association. If no path is saved, it resolves the source layout, selects the largest usable video, and persists the choice with first-writer-wins semantics. A source without usable video receives a failure verdict.

For an episode, resolution first checks the associated path exactly against the torrent layout. Otherwise it accepts a unique suffix match. Ambiguous and missing matches fail rather than selecting an arbitrary file. The canonical path is persisted. Association insertion and canonicalization share a serialized mutation boundary, including nullable-path cases; duplicate canonical associations merge safely.

Probe caches and subtitle candidate identities include the video file identity. Different episodes in one source therefore have distinct inspection and subtitle state. Subtitle sidecars are addressed as specific files of the same source.

Implementation: [target type](../../backend/src/services/playback/playback-target.ts), [target resolution](../../backend/src/services/playback/playback-target.service.ts), [episode association mutations](../../backend/src/repositories/episode-source.repository.ts), and [encrypted file reader](../../services/media-load/src/engine/encrypted-file-reader.ts).

## Claims and selection

A claim identifies storage, path, kind, owner key, optional byte range, and optional expiry. Uniqueness is `(storageId, path, kind, ownerKey)`. Range claims use `[rangeStart, rangeEnd)`; a null end requests the whole file. A file stays wanted while any consumer has a live claim.

| Kind        | Download piece priority | Reclamation protection rank   |
| ----------- | ----------------------- | ----------------------------- |
| `warmup`    | 1                       | 1                             |
| `watchlist` | 0                       | 2                             |
| `watched`   | 1                       | 3                             |
| `prefetch`  | 1                       | 4                             |
| `playback`  | 10                      | 5; protected from reclamation |

Download priority and retention protection are separate properties. Selection uses the union of live claims, applying the highest applicable priority to overlapping data. Releasing one owner does not release another owner's interest. Paused sources have no selected pieces until resumed. Matching subtitle sidecars copy the video's live claims.

Both run in the media-load service. `StorageService` owns claim persistence and storage admission. `DownloadService` owns WebTorrent selection and applies claim changes through per-source reconciliation. Admission records its claim with the admitted storage, preventing an unclaimed interval in which cleanup could remove a newly accepted request. Expiry cleanup releases expired claims and reconciles affected source selections; startup clears transient playback claims.

Implementation: [claim model and ranks](../../services/media-load/src/storage/types.ts), [claim and file repository](../../services/media-load/src/storage/storage-file.repository.ts), [storage service](../../services/media-load/src/storage/storage.service.ts), and [download selection](../../services/media-load/src/engine/download.service.ts). The backend's [storage hand-off](../../backend/src/services/media-load/storage-handoff.ts) moves storage recorded by older backends into the service.

## Completion and retention

A file is complete when all overlapping torrent pieces are verified. Completion is recorded per file, and a source's seeding clock reflects completion of the currently requested files. Claiming an incomplete file reopens that state.

After the configured seeding period, an idle torrent can detach while encrypted files and torrent metadata remain available. A later request for missing data can reattach it. Playback reads completed retained files directly when their verified data is available.

Storage accounting includes physical allocation and reservations. Reservations follow the requested files and torrent-piece boundaries, rather than assuming that one episode needs the entire season pack downloaded.

## Per-file reclamation and concurrency

Reclamation ranks each file by its strongest live claim. A file is eligible only when its protection is within the admission's allowed rank and it contains reclaimable data. Active streams block reclamation, and pieces overlapping a live playback claim are protected. The entire storage is removed only when no stronger claimed file remains and whole-storage removal is permitted.

A torrent piece can overlap adjacent files. Removing one file clears verification for the affected pieces, including shared boundary pieces. Kept neighbors that lose a boundary piece become incomplete and can fetch that piece again. A file that owns no independently reclaimable piece does not trigger a deletion that frees nothing.

Physical deletion, bitfield changes, and database completion/accounting updates run under the source lock. The encrypted chunk store coordinates removal with in-flight file reads and writes. If physical cleanup or its commit fails, affected verification and completion state is cleared conservatively rather than claiming potentially missing data is stored.

Reselection runs after the source lock and outside the admission queue. It can attach torrents and acquire source locks, so running it inside admission would create a lock-order hazard. Claimed files are reselected after either successful or failed cleanup.

Implementation: [reclamation](../../services/media-load/src/storage/storage.service.ts), [file repository](../../services/media-load/src/storage/storage-file.repository.ts), [encrypted chunk storage](../../services/media-load/src/chunk-stores/encrypted-chunk-store/encrypted-chunk-store.ts), and [piece geometry helpers](../../services/media-load/src/engine/download.utils.ts).

## Data preservation

Database initialization backs up the database before a schema change, applies the [schema migrations](../../backend/src/database/schema-upgrade.ts) (never TypeORM `synchronize()`), then runs the ordered data migrations before normal service work. Storage, claims and encrypted chunks are owned by the media-load service's own database. Entity changes require preservation of existing associations, encrypted records, storage data, and keys; deleting the database or downloads is not an initialization requirement.

See the append-only [data migration registry](../../backend/src/database/migrations/index.ts). Tests for targets, associations, claims, shared-pack reads, and reclamation live alongside their owning modules. Planned combined-episode boundaries and additional integration coverage are tracked in [ToDo.md](../../ToDo.md#tv-source-support).
