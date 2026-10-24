# Refactor plan: source identity, explicit file targets, file claims

Status: PRs 1–2 committed; PRs 3–4 implemented (uncommitted). Follows the architecture review of the `tv-show-discovery` branch.

Goal: replace three shortcuts from the TV work with a model that holds for movies and season packs alike.

| Today                                                                                     | Target                                                                             |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MovieSource` = torrent + movie link; TV rows use `movieId = null` + in-process hash lock | `ContentSource` (unique hash) + `MovieSource` / `EpisodeSource` association rows   |
| `EncryptedStorageLayout.video` = "last selected file", persisted and shared               | Layout holds only the file table; every read names its file via a `PlaybackTarget` |
| `Storage.selectedFiles` grows forever; `videoCompletedAt` / `retentionClass` per torrent  | `StorageFile` (per-file completion) + `StorageFileClaim` (per-consumer, expiring)  |

**No data migration.** The project runs on a single machine and the database can be wiped at any time. Schema changes rely on `synchronize()`. After each PR, delete `DATA_DIR/database.sqlite` and the downloads directory, then let the app rebuild them. Old schemas get no compatibility shims, no deprecated columns and no ID preservation.

Order: **1 → 2 → 3 → 4**, one PR each. Each PR leaves the app working.

---

## Constraints that still apply

- **Hash case.** YTS returns uppercase hashes, while TheRARBG/TV hashes are lowercased in `createTorrentSource`. The `ih` column is deterministically encrypted, so `ABC…` and `abc…` are different ciphertexts. A unique constraint on `ih` only works if the hash is lowercased at a single point of entry. Today the same torrent can end up as two rows. Both `Storage` rows then point at the same directory (`generateStoragePath(hash)`), so usage is counted twice and evicting one row deletes the other's files.
- **Selection is ours.** Torrents are added with `deselect: true`, which the Phase 3 reconciler requires.
- **Startup state.** `resetActiveStreams()` already clears in-flight state at boot. Phase 3 does the same for `playback` claims.

---

## PR 1: `ContentSource` + `MovieSource` (implemented)

**Naming rule:** a source is not necessarily a torrent. Today every source is one, but a source could later be a link to a streaming service. Entity, table, relation and foreign-key names therefore say "source", never "torrent". Torrent-specific data (`hash`, `magnetLink`, `file`) stays as columns of the source, and code that really drives WebTorrent keeps torrent names.

### Schema

| Entity          | Table            | Purpose                                                                                                                                |
| --------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentSource` | `content_source` | One row per provider source. `UNIQUE(hash)` (lowercase info hash); no `movieId`. `movies: MovieSource[]`, `episodes: EpisodeSource[]`. |
| `MovieSource`   | `movie_source`   | Link `(movieId, sourceId)` (unique), plus nullable `videoFilePath` that PR 2 fills in. Mirrors `EpisodeSource`.                        |
| `EpisodeSource` | `episode_source` | Unchanged role; relation `source`, column `sourceId`.                                                                                  |

Other renames:

- `Storage.movieSourceId` → `sourceId`; relation `Storage.contentSource`
- `PlaybackGrant.sourceId` keeps its name, now pointing at `ContentSource`
- `Movie.sources` is now `MovieSource[]` (links)
- Storage API and frontend: `movieSourceId` → `sourceId` (route `DELETE /api/storage/:sourceId`)

### What changed in code

- `ContentSourceRepository` ([content-source.repository.ts](../../backend/src/repositories/content-source.repository.ts)): `upsertByHash` (`ON CONFLICT DO NOTHING`, which on SQLite only covers uniqueness conflicts; read by hash; update only changed provider fields in place), `upsertForMovie`, `linkMovie`, `isLinkedToMovie`, `findByMovieId` through `movie_source`. The in-memory per-hash lock and `createTorrentSource` are gone, and so are the unused `getBestSource`, `save`, `findAll` and `MovieRepository.findMoviesWithoutSources`.
- `getNextSourcesToProcess` ranks through `movie_source`. A source shared by several movies is queued once; sources without a movie (TV-only) are skipped, as before.
- `normalizeInfoHash` (trim + lowercase) runs inside the `ih` column transformer, so every write and lookup by hash uses the canonical form. Lowercase hashes work with iTorrents and Torrage (see the recorded fixtures).
- The old `movieId` partial indexes were dropped and not replaced: no query filters or sorts on `file`/`streamingScore` in SQL.
- `StreamService.resolvePlaybackSource`: for movie grants it looks up the local movie by the grant's `mediaId`, checks `isLinkedToMovie`, and returns `movie`. `SubtitlesService` uses that movie and no longer depends on `MediaService`.
- New `MediaService.getLocalMovieByMediaId` (local mirror only, no catalog call).

### Known gaps

- The metadata queue still skips sources with unknown (`NULL`) quality, as before.
- TV-only storage rows have no linked movie, so the storage page shows `Download N`.
- In-memory `sourceId` names in the warm-up controller and job payloads were already neutral and are unchanged.

---

## PR 2: explicit file targets; remove `layout.video` (implemented)

`EncryptedStorageLayout` is now only the file table (`storeName`, `filenameSalt`, `pieceLength`, `files`). Every read, warmup, download, and subtitle operation names its file through a `PlaybackTarget` (`services/playback/playback-target.ts`):

```ts
export interface PlaybackTarget {
  source: ContentSource;
  filePath: string;
  matchKind: 'combined' | 'movie' | 'single';
}
```

### Resolving targets (`PlaybackTargetService`)

- **Episodes:** straight from the `EpisodeSource` match (`forEpisode`).
- **Movies:** `forMovie(movieId, source)` uses, in order, `MovieSource.videoFilePath`, the stored layout, the parsed `.torrent` file, and finally attaching the torrent with nothing selected to receive its metadata (`DownloadService.resolveLayout`). The largest video is chosen and stored first-writer-wins (`ContentSourceRepository.setMovieVideoFilePath`).
- Preparation resolves movie targets only when warming, which already attached the torrent before. `through: 'sources'` leaves movie targets null; the stream route resolves them from the grant later.

### `DownloadService`

- Public methods take a `PlaybackTarget`: `startDownload`, `warmSource`, `promoteSource`, `predownload` (replaces `predownloadSource` and `predownloadEpisode`), `getMediaFiles`, `prepareSubtitleFiles`, `streamFile`. `isEpisodeFileComplete` became `isFileComplete(sourceId, filePath)`; `getRangeProgress`/`isRangeVerified` take the file path.
- `startDownload` has one path: a stored file is read from disk; otherwise the file is selected, the torrent attached, and the reservation recomputed from the selected files. `forceAttach`, `selectLayoutVideo`, and the movie/episode branches are gone. Movies now also record their file in `selectedFiles`.
- "Stored" means the file's pieces are verified, or it is a requested file of a source already marked complete.
- `streamFile` serves any file of the source (video or sidecar subtitle) and names the response after the file.
- Bitfield helpers (`isPieceInBitfield`, `isByteRangeCompleteInBitfield`, `isFileCompleteInBitfield`) and `mainVideoPath` live in `download.utils.ts`.
- `EncryptedFileReader(location, layout, filePath, key)` validates the path against the layout.

### Other changes

- `TorrentWarmupController` slots record `filePath`; two files of one source are separate warmups.
- `StreamService.resolvePlaybackTarget(grant)` returns `{ target, movie }`; `movieTarget(movieId, source)` serves the legacy streaming-key route.
- `TorrentSubtitlesService` and `AudioPlaybackService` take targets; probe caches are keyed by source and file.
- Subtitle track ids include the video path. Previously, embedded tracks of two episodes in one pack shared ids, so cached subtitles could be served for the wrong episode.
- Storage inventory `fileName` is the first requested video's base name.

### Behavior changes to note

- Admission collects the sources to reselect and runs them after the admission queue is released, unawaited: reselect may attach a torrent and take source locks, which must not block or deadlock admission. Calling `reclaimFiles` directly still awaits it.
- The `verified` handler persists the bitfield under the source lock from a snapshot taken once it holds the lock, coalescing bursts, so a write queued before a reclaim cannot restore reclaimed bits.

- Movie reservations follow the requested files (video plus boundary pieces) instead of the whole torrent.
- Background movie predownload pauses for active playback only while that playback's file is incomplete (previously: whenever anything was streaming), the same rule episodes already used.
- A movie whose file list cannot be resolved while warming is returned cold without warmup; its grant is still issued, and the stream route resolves the file later.

### Tests

`download.service.pack.test.ts` writes a real encrypted two-episode pack and streams both episodes concurrently: correct bytes, per-episode ranges and file names, no layout writes, no WebTorrent attach. Also new: `playback-target.service.test.ts`, first-writer-wins path storage, controller warmups per file, per-video subtitle ids, unresolved movie preparation, and session grants without a resolved file.

---

## PR 3: `StorageFile` + `StorageFileClaim` (implemented)

### Schema

- `storage_file` (`StorageFile`): one row per file of a stored source, `UNIQUE(storageId, path)`, with `completedAt` set once every overlapping piece verifies. Rows are recorded whenever a source's layout becomes known.
- `storage_file_claim` (`StorageFileClaim`): one owner's request for one file, `UNIQUE(storageId, path, kind, ownerKey)`, with `rangeEnd` (prefix-only, warmups) and `expiresAt`.
- Removed from `Storage`: `selectedFiles`, `retentionClass`, `speculativeExpiresAt`.
- **Kept** `Storage.videoCompletedAt`, now meaning "every currently claimed file is complete". It is the seeding clock and is cleared whenever an incomplete file is claimed. Deriving it from `StorageFile.completedAt` would need the same timestamp; keeping the column avoids a query on every activity check.

### Claim kinds (`storage-file-claim.entity.ts`)

| Kind        | Owner key                                         | Piece priority | TTL                                         | Eviction rank |
| ----------- | ------------------------------------------------- | -------------- | ------------------------------------------- | ------------- |
| `warmup`    | warmup lease key                                  | 1, prefix only | 10 min (released when the warmup is paused) | 1             |
| `watchlist` | `watchlist:tv:{show}` / `watchlist:movie:{movie}` | 0              | TV 30 min, renewed by each scan; movie none | 2             |
| `watched`   | `user:{userId}:{playableKey}`                     | 1              | none                                        | 3             |
| `prefetch`  | `next:{userId}:{playableKey}`                     | 1              | 24 h                                        | 4             |
| `playback`  | `stream` (one per file)                           | 10             | 2 min, renewed by every range request       | 5 (never)     |

Subtitle sidecars copy the live claims of their video (`StorageService.copyClaims`).

### Where the logic lives

The plan's separate `FileClaimService` became two parts, matching who owns what:

- **Persistence** in `StorageService` (backed by `StorageFileRepository`): `claimFile`, `releaseClaims`, `getLiveClaims`, `getClaimedPaths`, `copyClaims`, `deleteClaims({ expiredAt | kind })`, `recordFiles`, `markFilesComplete`, `getSpeculativeSourceIds`. `createStorage` records the admission's claim in the same admission step, so a newly admitted row is never unclaimed (and evictable) before its owner records it.
- **Selection** in `DownloadService` (it owns the torrents): `reconcileSelection(sourceId)` clears file and piece selections and reapplies the union of live claims (whole files at their highest priority, prefixes as piece ranges). It runs serialized per source after every download request, pause/resume, warmup pause, and expiry sweep. Paused sources keep nothing selected until resumed.
- `startDownload(target, claim)` replaces `retentionClass`/`speculativeExpiresAt`; `promoteSource(target, ownerKey)`, `predownload(target, claim)`, `warmSource(target, bytes, leaseKey)`. `selectTorrentFile`, `reactivateTorrent`, `maybeMarkVideoComplete`, `warmupSelections`, and `reserveSpeculativeStorage` are gone.
- `recordCompletion` marks `StorageFile.completedAt` as pieces verify, then `videoCompletedAt` once every claimed file is complete.
- Expired claims are swept every 60 s and their sources reselected; `playback` claims are dropped at startup.
- `pauseSource` (warmup controller) now releases only the source's warmup claims, so other owners' downloads on the same source continue.

### Eviction

`StorageFileRepository.findEvictionCandidate(maxRank)` picks idle storage whose strongest live claim ranks at most `maxRank`, then least recently wanted. Storage with no live claim ranks 0.

- Periodic cleanup: rank 0 (unclaimed) only.
- Speculative admission (warmup, watchlist, prefetch): up to `watchlist` (2).
- Retained admission (watched, playback): up to `prefetch` (4), never live playback.

Eviction picks storage; since PR 4 it frees individual files of that storage (see below).

### Behavior changes to note

- Watched storage is now evictable by another viewer's admission (LRU), as the TV plan's storage priorities intended; before, only completed TV packs were.
- Warmups no longer use the 15-second `speculativeExpiresAt`; their claim lives 10 minutes or until the warmup is paused.
- Background pausing for playback applies to sources whose live claims are all speculative.
- The storage inventory's `fileName` comes from the first requested video (`requestedFiles`).

### Tests

Real-database tests for claim liveness and expiry, per-owner release, reopen-on-incomplete, sidecar claim copying, per-file completion, inventory requested files, speculative-source listing, eviction by rank (speculative admission cannot evict another user's prefetch; nothing evicts playback; least protected first), and atomic admission claims. Unit tests for selection: strongest priority wins, prefixes become piece ranges, a file stays selected while any owner claims it, paused sources stay empty, warmup pause releases only warmup claims, and expiry sweeps reselect.

---

## PR 4: per-file physical reclaim (implemented)

The encrypted chunk store keeps one encrypted file per torrent path, so a single path can be deleted. Then clear the bitfield bits of every piece overlapping that file. That includes **boundary pieces shared with a neighbor**, which the neighbor re-downloads; the bytes rewritten are identical. Delete the whole storage directory only when no `StorageFile` remains claimed or complete.

**Done when:** a pack with nine completed, unclaimed episodes and one claimed pending episode can reclaim the nine without disturbing the tenth.

### Schema

None. `StorageFile.completedAt` is reset and `Storage` columns are updated in place.

### What changed in code

- `EncryptedChunkStore.removeFiles(logicalPaths)`: closes the named files' handles, deletes their encrypted files and leaves the rest. Handles are now reset-able (replacing `thunky`), so the live store reopens a removed file when a shared piece is written again. Each file has a gate: a removal waits for in-flight reads and writes on it, closes, deletes, and clears the handle again; operations arriving meanwhile wait and then reopen a fresh file, so no write lands on a closed or unlinked handle. File descriptors carry the content `logicalPath`. A physical file that a kept path also maps to (same base name) is not deleted.
- `download.utils.ts`: `pieceRangeOf` and `clearPiecesInBitfield`.
- `StorageFileRepository.findIdleStorageIds` replaces `findEvictionCandidate`: idle storage, least protected first, with no rank filter (rank is decided per file). `clearFilesComplete` forgets completion of cleared files.
- `StorageService.reclaimFiles(sourceId, maxClaimRank, allowRemoval)` runs under the per-source lock (the one for torrent startup, expiry detach and `removeStorage`):
  - rejects storage with an active stream;
  - ranks each file by its strongest live claim (unclaimed is 0). Files above `maxClaimRank` are kept. A file at or below it that holds data is reclaimed; data that is only a boundary piece shared with a kept file does not count, so it is not reclaimed for that alone;
  - a file whose pieces overlap a file under a live `playback` claim is skipped;
  - a completed unclaimed file lying wholly inside a kept neighbor's pieces is not reclaimed either (it would free nothing); a claim on a path outside the known file table is ignored. Nothing kept: the whole storage goes (`removeStorageLocked`, as before). Something kept: weak claims on the reclaimed files are dropped, the download layer deletes the files and clears pieces, and the commit updates `Storage`.
- Commit: `downloadedPieces` with the reclaimed pieces cleared (boundary pieces included), `downloaded`, `verifiedBytes`, `logicalBytes` (kept files), `reservedBytes` (capped at the estimate for the kept files), then `reconcileAllocation` re-measures the directory. Reclaimed files and kept neighbors that lost a boundary piece get `completedAt = null`. A kept claimed file that is now incomplete clears `videoCompletedAt` and `localOnly`. The result reports the charge freed.
- `StorageService.cleanupWithinAdmission` walks `findIdleStorageIds` and calls `reclaimFiles` until a candidate frees something. Last-record protection applies only to whole removal; periodic cleanup still reclaims files of the last storage.
- `DownloadService` registers a `ReclaimHandler`:
  - `reclaim` (inside the lock): drops the files' selections, marks every cleared piece unverified in the attached torrent (`_markUnverified`, a fresh reservation list, `done = false`), and deletes the encrypted files through the live store, or a transient `EncryptedChunkStore` when nothing is attached. Returns the live bitfield, which the commit clears again so no concurrent verification is lost.
  - Failure after the unverify (`removeFiles` or the commit throws): the stored bitfield and `completedAt` of the planned files and their neighbors are cleared, so the database never claims data that may be gone; the result is `cleanup_failed`. The reselect runs whether the reclaim succeeds or fails.
  - `reselect` (after the lock): if a claimed file is not stored any more and no torrent is attached, the torrent is attached again from the cleared bitfield (seed timer dropped); then `reconcileSelection` and `recordCompletion` run, so a claimed neighbor refetches only its boundary piece.

### Behavior changes to note

- Admission and periodic cleanup no longer remove a storage because its strongest claim is too strong: a pack with a watched or prefetched episode keeps that episode and loses the unclaimed ones.
- Reclaiming a file whose pieces are shared makes a claimed complete neighbor incomplete until it refetches one piece (a source that was detached and `localOnly` is reattached for that).
- Free space after a partial reclaim comes from re-measuring the directory (`allocatedBytes`), so charge falls by the deleted files' blocks.

### Known limits

- A write racing a removal is serialized by the per-file gate, but the removed file's own pending write is discarded with it (the piece is unverified and refetched if still wanted).
- Before the file table is known, every claimed path counts as kept (admission claims precede the layout).
- Files that share a base name inside one source already map to one encrypted file; reclaim leaves that file in place while either path is kept.

### Tests

- `download.service.reclaim.test.ts` (real database, real encrypted store, real `StorageService` and `DownloadService`; only the WebTorrent attach is faked): the nine-of-ten scenario (storage row, directory, the tenth's claim and file stay; the nine files and their bits go; the whole directory goes once the tenth is released); a claimed neighbor stays readable for its own pieces and misses only the shared boundary piece; a neighbor under live playback blocks reclaim of the file it shares a piece with; active streams are refused; weak claims are reclaimed while stronger ones stay; admission and periodic cleanup reclaim files instead of removing the storage, and periodic cleanup never removes the last record.
- `download.service.pack.test.ts`: reclaim on the real encrypted pack, with and without an attached torrent (pieces unverified, bitfield returned, store reopens the removed file).
- `download.service.reclaim.test.ts` also covers: deletion failing partway (database made conservative, reselect still runs), a subtitle inside a kept neighbor's pieces, a claim on an unknown path, and admission finishing while a reselect is pending. `download.service.test.ts`: the verified handler writes a fresh snapshot under the source lock and coalesces. `encrypted-chunk-store.test.ts`: `removeFiles` deletes only named files, tolerates unwritten files, keeps shared physical files, and survives concurrent puts. `download.utils.test.ts`: piece range and bitfield clearing.

---

## Tests to add

| PR  | Test                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Upper and lowercase hash for one source produce one row and one storage directory; concurrent `upsertByHash` calls yield one row (no in-memory lock); a movie and an episode can share a source.                                            |
| 2   | Two episodes of one pack streamed concurrently: correct bytes for each, layout unchanged; subtitle sidecar matching uses the target's path; the movie's `videoFilePath` is resolved once under concurrency.                                 |
| 3   | Claim/release refcounting per path; TTL sweep; startup drops `playback` claims; the seed timer starts only after all claimed files complete; eviction ordering and per-user protection; a prefix warmup claim selects only its piece range. |
| 4   | Reclaiming one file clears the bitfield for its pieces, including shared boundary pieces; the neighbor file stays readable and re-fetches only its boundary piece. (Implemented; see PR 4.)                                                 |

## Open questions

1. Should `watched` claims for movies ever expire, or stay purely LRU-evictable as today? Recommendation: no TTL, LRU only (current behavior).
2. Does WebTorrent's `file.deselect()` reliably drop a selection created via `torrent.select(range)`? Verify early in PR 3. Otherwise the reconciler should only use `torrent.select`/`deselect` with explicit piece ranges.
