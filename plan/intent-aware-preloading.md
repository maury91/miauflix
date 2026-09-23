# Intent-Aware Preloading Implementation Plan

## Audience and status

This is an implementation handoff for Luna. It is intentionally explicit about ownership, contracts, invariants, file locations, sequencing, and proof. Follow the repository `AGENTS.md` and `docs/ai/*` instructions while implementing.

Decisions already made by the product owner:

- Miauflix is pre-alpha. Existing development data may be discarded.
- Do not build compatibility migrations, dual reads, or legacy adapters.
- The media catalog and list service remain separate services.
- Only one **speculative payload warmup** may download pieces at a time.
- Active playback is not speculative warmup and must never be paused or evicted because another client changes focus.
- Storage is limited. Capacity must be enforced using physical filesystem allocation, not torrent progress alone.
- The frontend navigation graph is the source of truth for what is close to the user.
- Implement the simplest complete design; do not add generalized scheduling frameworks or speculative extension points.

## Goal

Make normal navigation lead to near-immediate playback while respecting provider rate limits, network bandwidth, disk capacity, multiple users/devices, and stale UI intent.

The complete path is:

```text
frontend focus
  -> image + RTK Query prefetch
  -> expiring backend intent lease
  -> catalog summary/detail preparation
  -> source discovery
  -> torrent metadata resolution
  -> exact source selection
  -> one-slot bounded payload warmup on details
  -> Watch promotes the same source into playback
```

Preloading is always an optimization. Watch must retain an inline cold fallback.

## Non-goals

- Offline playback.
- Downloading complete files merely because they were focused.
- Machine-learned ranking.
- A generic distributed workflow engine.
- Persisting transient focus/navigation state.
- Per-user physical copies of the same torrent.
- Supporting an episode torrent provider by fabricating results or calling real external APIs from tests.

## Current implementation facts to preserve or replace

- Focus changes converge in `frontend/src/pages/home/HomePage.tsx`.
- Every mounted `CategoryRow` currently requests current, previous, and next list pages.
- `MediaHero` requests an `original` backdrop on every focus change.
- RTK Query detail endpoints already exist in `frontend/src/features/media/api/media.api.ts`.
- Catalog reads currently block while ensuring fresh provider data.
- `ApiCache` deletes expired values and therefore cannot serve stale values.
- Catalog batch reads may fan out up to 50 full detail hydrations.
- List-service calls Trakt live for every list page request; it has no page cache.
- Source discovery, metadata extraction, and stats refresh already exist and are suitable internal building blocks.
- `MovieSource`, `Storage`, `StreamingKey`, and `StreamService` are movie-specific and must be replaced, not wrapped in legacy compatibility code.
- Progress entities exist but the HTTP routes are stubs.
- `EncryptedChunkStore` opens `random-access-file` without an explicit size. Positional writes can still create a large apparent file or consume the full allocation depending on offsets and filesystem behavior.

## Hard invariants

These are acceptance properties, not implementation suggestions.

1. At most one speculative torrent has selected payload pieces globally.
2. An active playback stream is never paused or evicted by preload arbitration.
3. Watch uses the exact source selected/warmed for that playable target.
4. Old intent sequences cannot override new intent sequences.
5. Intent expiry stops payload warming even if the client disappears without cleanup.
6. Catalog/source/torrent metadata results may be retained after interest disappears; payload downloading may not continue.
7. Disk admission occurs before opening/writing a speculative payload store.
8. Disk limits use physical allocated bytes plus outstanding reservations.
9. Client input describes navigation facts; the server derives priority.
10. Provider cache misses on the Watch path have a bounded inline fallback.
11. All external API tests use fixtures/mocks. Never call TMDB, Trakt, YTS, or torrent indexes live in tests.

---

# 1. Canonical contracts

## 1.1 Public navigation and playable references

Add runtime Zod schemas and inferred types in a new backend route contract module:

- `backend/src/routes/playable.types.ts`

Use catalog identities at HTTP boundaries, never local database IDs.

```ts
export const moviePlayableRefSchema = z.object({
  kind: z.literal('movie'),
  mediaId: z.number().int().positive(),
});

export const episodePlayableRefSchema = z.object({
  kind: z.literal('episode'),
  showMediaId: z.number().int().positive(),
  seasonNumber: z.number().int().nonnegative(),
  episodeNumber: z.number().int().positive(),
});

export const playableRefSchema = z.discriminatedUnion('kind', [
  moviePlayableRefSchema,
  episodePlayableRefSchema,
]);

export const mediaIntentRefSchema = z.discriminatedUnion('kind', [
  moviePlayableRefSchema,
  z.object({ kind: z.literal('show'), mediaId: z.number().int().positive() }),
  episodePlayableRefSchema,
]);
```

Canonical storage key:

```ts
movie   -> `m:${mediaId}`
episode -> `e:${showMediaId}:${seasonNumber}:${episodeNumber}`
```

Implement one helper that creates/parses this key and unit-test round trips. Do not duplicate string construction.

## 1.2 Frontend intent API

Add:

- `backend/src/routes/preload.routes.ts`
- `backend/src/routes/preload.types.ts`
- `frontend/src/features/preload/api/preload.api.ts`

Endpoints:

```http
PUT    /api/preload/intents/:clientId
DELETE /api/preload/intents/:clientId
```

Request:

```ts
interface PreloadIntentRequest {
  sequence: number;
  view: 'browse' | 'details' | 'player';
  focused: MediaIntentRef | null;
  reachable: Array<{
    target: MediaIntentRef;
    distance: 1 | 2;
    direction: 'left' | 'right' | 'up' | 'down' | 'season' | 'episode';
  }>;
}
```

Validation:

- Auth required.
- Bound `clientId` length and character set; frontend should use a UUID persisted per browser/device.
- `sequence` is a nonnegative safe integer.
- Maximum eight reachable entries.
- Deduplicate identical targets on the server.
- Rate-limit by authenticated user plus client ID.
- Ignore/reject `sequence <= lastAcceptedSequence` without mutating the lease.
- Do not accept client priority, dwell time, source ID, hash, magnet URL, or filesystem information.

Response:

```ts
interface PreloadIntentResponse {
  acceptedSequence: number;
  expiresAt: string;
}
```

Use ISO strings in JSON, not `Date` types.

Lease identity:

```ts
type IntentLeaseKey = `${userId}:${sessionId}:${clientId}`;
```

Lease behavior:

- Expire after 15 seconds.
- Details/player clients heartbeat every five seconds if intent has not otherwise changed.
- `DELETE` is opportunistic cleanup; expiry guarantees correctness.
- Store leases only in memory.

## 1.3 Generic playback API

Add:

- `backend/src/routes/playback.routes.ts`
- `backend/src/routes/playback.types.ts`
- `frontend/src/features/player/api/playback.api.ts`

Endpoint:

```http
POST /api/playback/sessions
```

Request:

```ts
interface CreatePlaybackSessionRequest {
  playable: PlayableRef;
  preferences: {
    quality: Quality | 'auto';
    allowHevc: boolean;
  };
}
```

Response:

```ts
interface CreatePlaybackSessionResponse {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  source: {
    id: number;
    quality: Quality | '3D' | null;
    size: number;
    videoCodec: VideoCodec | null;
    broadcasters: number | null;
    watchers: number | null;
  };
  preparation: {
    state: 'warm' | 'warming' | 'cold';
    verifiedBytes: number;
    allocatedBytes: number;
  };
  expiresAt: string;
}
```

Replace the movie-specific streaming-key creation path after the frontend migrates. No legacy adapter is required. The new grant must bind the exact `sourceId`; `/api/stream/:token` must not select a different source later.

## 1.4 Progress API

Replace the stub contract in:

- `backend/src/routes/progress.routes.ts`
- `backend/src/routes/progress.types.ts`

Use:

```ts
interface ProgressUpdateRequest {
  playable: PlayableRef;
  positionSeconds: number;
  durationSeconds: number;
  state: 'playing' | 'paused' | 'completed';
}

interface ProgressEntry extends ProgressUpdateRequest {
  updatedAt: string;
}
```

Do not store an ambiguous 0–1 versus 0–100 percentage. Derive percentage when presenting it.

Progress responsibilities:

- Determine the resume/current episode for a show.
- Mark storage as watched when a playback session begins.
- Update last interest while playing.
- Provide the next episode candidate.

---

# 2. Service contracts

## 2.1 Catalog v1

Modify:

- `packages/service-contracts/src/catalog/v1.ts`
- `packages/service-contracts/src/index.ts`
- `packages/service-contracts/src/contracts.test.ts`
- `backend/src/services/catalog/catalog-client.service.ts`
- `services/media-catalog/src/http/handlers/media.ts`
- `services/media-catalog/src/http/handlers/consts.ts`
- `services/media-catalog/src/http/handlers/system.ts`

Set:

```ts
CATALOG_CAPABILITY_VERSION = 1;
BASE_PATH = '/v1/catalog';
```

Read policy:

```ts
type CatalogReadMode = 'cache-only' | 'stale-while-revalidate' | 'require-fresh';
type CatalogWorkClass = 'interactive' | 'foreground' | 'maintenance';
```

Add a summary endpoint:

```http
POST /v1/catalog/media/summaries
```

Request:

```ts
interface MediaSummaryBatchRequest {
  items: MediaRef[]; // max 50
  language: string;
  mode: CatalogReadMode;
  workClass: CatalogWorkClass;
}
```

Response:

```ts
interface BrowseMediaSummary {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  title: string;
  overview: string;
  poster: string;
  backdrop: string;
  logo: string;
  genres: LocalizedGenre[];
  releaseDate: string;
  runtime?: number;
  popularity: number;
  rating: number;
  detailsSyncedAt: string | null;
}

interface MediaSummaryBatchResponse {
  items: BrowseMediaSummary[];
  pending: MediaRef[];
  missing: MediaRef[];
  errors: BatchError[];
}
```

Meanings:

- `pending`: no cached value and the selected read mode did not permit blocking hydration.
- `missing`: provider authoritatively returned not found.
- `errors`: provider/service failed.

All detail and season endpoints accept the same `mode` and `workClass` as query parameters. `CatalogClientService` methods accept an options object containing those fields plus `AbortSignal`.

Call policy:

| Caller                | Mode                   | Work class  |
| --------------------- | ---------------------- | ----------- |
| Focused homepage card | stale-while-revalidate | interactive |
| One-key neighbor      | cache-only             | foreground  |
| Active homepage page  | stale-while-revalidate | foreground  |
| Details page          | stale-while-revalidate | interactive |
| Watch                 | stale-while-revalidate | interactive |
| Scheduled sync        | require-fresh          | maintenance |

Catalog GET single-flight keys must include language and read mode. A cache-only request must not be shared with a request that promises hydration.

## 2.2 Catalog cache behavior

Change `services/media-catalog/src/utils/api-cache.ts` to return cache state rather than deleting expired entries immediately:

```ts
type CacheLookup<T> =
  | { state: 'fresh'; value: T; expiresAt: number }
  | { state: 'stale'; value: T; expiresAt: number }
  | { state: 'missing' };
```

Rules:

- Fresh: return immediately.
- Stale + stale-while-revalidate: return stale and trigger one background refresh.
- Stale + require-fresh: wait for refresh; serve stale if refresh fails.
- Missing + cache-only: return pending.
- Missing + interactive/foreground: fetch inline.
- Cleanup deletes only values beyond a separate stale-retention window.

Update `CatalogHydrator` so queued single-flight work can be promoted from maintenance to interactive before it starts. Once a request is executing, callers join it.

## 2.3 TMDB request scheduler

Own prioritization inside `services/media-catalog/src/provider/tmdb/client.ts`, where all TMDB calls converge.

Use one scheduler, not separate independent rate limiters:

- Bounded concurrency.
- Token bucket matching current provider allowance.
- Reserved ability for interactive work to enter promptly.
- Foreground work after interactive.
- Maintenance uses remaining capacity.
- Parse `429`, `Retry-After`, and available rate-limit headers.
- Shared cooldown after rate limiting.
- Abort queued requests when their signal is cancelled.
- Deduplicate provider operations by cache key.
- Permit queued maintenance work to be promoted.

Do not let caller-provided numeric priority flow into this scheduler. Map the three work classes internally.

## 2.4 List-service remains v1

The list-service wire contract does not need to change. It correctly represents membership, ordering, and account scope.

Change implementation in:

- `services/list-service/src/index.ts`
- `services/list-service/src/trakt-client.ts`

Add a persistent page cache keyed by:

```text
subjectId + listId + page
```

Requirements:

- Public pages have a longer TTL than personal pages.
- Serve stale pages when Trakt fails.
- Single-flight identical page requests.
- Respect `429`, `Retry-After`, and provider headers.
- Keep account token refresh separate from page caching.
- Encrypt user-associated cached data consistently with existing association storage.

Backend startup policy:

- Serve an existing active local generation immediately.
- If no generation exists, fetch/stage page 1 and activate a bootstrap generation.
- Stage remaining pages as maintenance after bootstrap.
- Do not launch six pages of every list simultaneously at process start.

## 2.5 Background jobs

Do not put focus leases or payload warmup in Bunqueue.

Replace the old movie-specific source jobs with:

```ts
interface PlayableBackgroundJobPayloads {
  'playable.source.discover': { playable: PlayableRef };
  'playable.source.metadata': { sourceId: number };
  'playable.source.stats': { sourceId: number };
}
```

Use new queue names and reset the broker. These jobs are only durable background enrichment. Interactive preparation calls services directly with cancellation and generation checks.

Catalog recurring job contracts may remain unchanged. Their provider calls must use `maintenance` work class.

---

# 3. Clean persistence model

Delete/replace the movie-specific source, storage, streaming-key, and percentage-progress schema. Reset local databases after the change.

## 3.1 ContentSource

Replace `backend/src/entities/movie-source.entity.ts` with a generic source entity, preferably `backend/src/entities/content-source.entity.ts`.

```ts
@Entity()
@Unique(['playableKind', 'playableKey', 'hash'])
class ContentSource {
  id: number;
  playableKind: 'movie' | 'episode';
  playableKey: string;

  movieId: number | null;
  episodeId: number | null;

  hash: string;
  magnetLink: string;
  url?: string;
  file?: Buffer;

  quality: Quality | '3D' | null;
  size: number;
  videoCodec: VideoCodec | null;
  broadcasters?: number;
  watchers?: number;
  provider: string;
  sourceType: Source | null;
  sourceUploadedAt?: Date;
  streamingScore: number;
  lastStatsCheck?: Date;
  nextStatsCheckAt: Date;
}
```

Enforce in service validation and tests:

```text
movie   -> movieId present, episodeId null
episode -> movieId null, episodeId present
```

Rename repository/service concepts accordingly:

- `movie-source.repository.ts` -> `content-source.repository.ts`
- movie-specific transformer helpers -> playable-aware helpers
- selection utilities accept `ContentSource`

Preserve existing encryption at the repository/entity boundary for hashes, magnets, URLs, and torrent metadata files.

## 3.2 ContentStorage

Replace `backend/src/entities/storage.entity.ts` with:

```ts
@Entity()
class ContentStorage {
  id: number;
  sourceId: number;
  source: ContentSource;

  logicalBytes: number;
  verifiedBytes: number;
  allocatedBytes: number;
  reservedBytes: number;

  downloadedPieces: Uint8Array;
  totalPieces: number;
  pieceLength: number;
  location: string;

  retentionClass: 'speculative' | 'watched';
  lastInterestAt: Date | null;
  speculativeExpiresAt: Date | null;

  createdAt: Date;
  updatedAt: Date;
}
```

Meanings:

- `logicalBytes`: total selected playable-file length.
- `verifiedBytes`: valid downloaded bytes according to the bitfield.
- `allocatedBytes`: physical filesystem blocks charged to the storage.
- `reservedBytes`: admission reservation while allocation is not yet measured.

Application charge:

```ts
chargedBytes = Math.max(allocatedBytes, reservedBytes);
```

Never enforce the disk threshold using `verifiedBytes` alone.

## 3.3 PlaybackGrant

Replace `StreamingKey` with:

```ts
@Entity()
class PlaybackGrant {
  id: number;
  keyHash: string;
  userId: string;
  sourceId: number;
  playableKind: 'movie' | 'episode';
  playableKey: string;
  expiresAt: Date;
  createdAt: Date;
}
```

The stream token resolves to a precise source. Verify source/playable consistency before streaming.

## 3.4 Progress

Use one progress table keyed by user plus playable key unless TypeORM ownership strongly favors two concrete tables. Store position/duration seconds and state. Add indexes for:

- user + playable key uniqueness;
- user + updated time;
- episode progress lookup by show.

---

# 4. Source provider abstraction

Replace movie-only discovery with:

```ts
interface SourceQuery {
  playable: PlayableRef;
  imdbId?: string;
  title: string;
  showTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

interface ContentDirectory {
  readonly supportedKinds: ReadonlySet<'movie' | 'episode'>;

  search(
    query: SourceQuery,
    options: {
      workClass: 'interactive' | 'background';
      signal?: AbortSignal;
    }
  ): Promise<SourceMetadata[]>;
}
```

YTS declares movie-only support. Do not send episode queries to it.

Before implementing episode discovery, inspect existing TheRARBG fixtures and provider response shapes for TV/episode support. Use the existing metadata extractor's season/episode parsing. Do not make a real provider request. If no installed provider or fixture can return episode torrents, stop that milestone and report the external-source blocker rather than fabricating an implementation. All other contracts should still support episodes cleanly.

---

# 5. Backend services and state machines

## 5.1 PlayablePreparationService

Add:

- `backend/src/services/preload/playable-preparation.service.ts`

API:

```ts
prepare(
  playable: PlayableRef,
  options: {
    through: 'catalog' | 'sources' | 'metadata' | 'warm';
    preferences: PlaybackPreferences;
    workClass: 'interactive' | 'background';
    signal?: AbortSignal;
  }
): Promise<PreparedPlayable>;
```

Pipeline:

1. Resolve catalog identity and local entity.
2. Discover sources if missing/stale.
3. Resolve torrent metadata for at most the best two plausible sources.
4. Re-score and select exactly one source.
5. If requested, submit the selected source to the warmup controller.

This is the single implementation used by:

- stable homepage focus;
- details entry;
- selected episode focus;
- Watch;
- cold stream fallback.

After every awaited operation, check the caller's generation/signal before starting the next side effect. Completed catalog/source/metadata work stays cached even after cancellation.

## 5.2 PreloadIntentService

Add:

- `backend/src/services/preload/preload-intent.service.ts`

Responsibilities:

- Store expiring intent leases.
- Reject stale sequences.
- Derive deterministic work tiers.
- Start/cancel preparation using `AbortController`.
- Aggregate identical targets across users.
- Notify the warmup arbiter when the winning details target changes.
- Expire leases without depending on frontend unload behavior.

Priority tiers:

| Tier | State                          | Work                                                             |
| ---- | ------------------------------ | ---------------------------------------------------------------- |
| P0   | Watch/playback creation        | inline through source selection; promote warmed source           |
| P1   | Details primary playable       | catalog + sources + metadata + payload warm                      |
| P2   | Stable homepage focus          | catalog + sources + torrent metadata; no payload                 |
| P2   | Stable alternate episode focus | catalog + sources + metadata; payload only after stability delay |
| P3   | One-key reachable              | image/browser work plus cache-only catalog summary               |
| P4   | Distance two                   | browser lazy loading/background only                             |
| P5   | Maintenance                    | provider background queues                                       |

Do not implement a floating score. Compare tiers first, then explicitness, then fairness age.

## 5.3 TorrentWarmupController

Add:

- `backend/src/services/preload/torrent-warmup.controller.ts`

State machine:

```text
IDLE
  -> RESOLVING_STORE
  -> ADDING_TORRENT
  -> WARMING
  -> READY
  -> PAUSED
  -> EVICTED

Any state -> FAILED
Any speculative active state -> PAUSED when replaced or expired
```

Protect transitions with one mutex. The mutex covers pause-old/reserve/start-new, not the entire download duration.

State:

```ts
interface WarmSlot {
  generation: number;
  leaseKey: string;
  playableKey: string;
  sourceId: number;
  state: WarmState;
  targetVerifiedBytes: number;
  verifiedBytesAtStart: number;
  startedAt: number;
}
```

Rules:

- Exactly one speculative source has selected payload pieces.
- A Watch call for the same playable/source promotes the slot without restarting it.
- A Watch call for another source pauses the speculative slot before starting playback work.
- Any active stream suspends speculative payload warming. Catalog/source/metadata preparation may continue.
- Multiple active playback streams may coexist; they are not preload slots.

## 5.4 DownloadService responsibilities

Refactor `backend/src/services/download/download.service.ts` so it owns torrent mechanics, not preload policy.

It should expose operations approximately equivalent to:

```ts
addSource(source, storage): Promise<TorrentHandle>
selectWarmRange(sourceId, range): Promise<void>
pauseSource(sourceId): Promise<void>
promoteToPlayback(sourceId): Promise<void>
streamSource(sourceId, rangeHeader): Promise<Response>
removeSource(sourceId, { destroyStore: true }): Promise<void>
```

It must not choose which user's intent wins.

Do not use `file.select()` for speculative warmup because that selects the complete file. Convert the desired byte range to piece indices and select only that bounded range, with earlier pieces given higher priority.

---

# 6. Storage allocation and admission

## 6.1 Measure three different byte counts

For every storage directory:

- Logical bytes: sum of file `stat.size` or torrent metadata lengths.
- Allocated bytes: sum of `stat.blocks * 512` where supported.
- Verified bytes: calculate from verified pieces, adjusting the final piece length.

On platforms without block counts, conservatively treat logical size as allocated.

Also use `fs.statfs` on the configured download filesystem to read real available capacity.

## 6.2 Detect allocation mode on the actual download filesystem

At storage-service initialization, perform a recoverable probe inside `DOWNLOAD_PATH`:

1. Create a uniquely named temporary file.
2. Give it a large logical length.
3. Write a small block at the beginning and near the end.
4. Compare logical size with allocated blocks.
5. Delete the probe in `finally`.

Classify:

```ts
type AllocationMode = 'sparse' | 'full' | 'unknown';
```

Probe failure means `unknown`, which follows full-allocation safety rules.

## 6.3 Backing-file behavior

For a sparse-capable filesystem:

- Construct `random-access-file` with known size and `sparse: true`.
- Reserve the bounded warm target plus piece/alignment margin.
- Confirm physical allocation after opening and after warm completion.

For full/unknown allocation:

- Use progressive files for speculative sequential prefix writes where possible.
- Do not prefetch a tail range speculatively.
- Before any operation that may create a high-offset/full allocation, reserve the selected file's full logical size.
- If that reservation cannot fit, keep metadata ready but skip payload warmup.

This makes payload preloading optional on unsuitable filesystems while preserving immediate metadata/source readiness.

## 6.4 Admission transaction

Before adding/selecting speculative payload pieces:

```text
resolve selected file and warm range
  -> estimate reservation from allocation mode
  -> acquire storage admission mutex
  -> sum charged bytes
  -> read filesystem available bytes
  -> evict until both limits fit
  -> persist reservation
  -> release mutex
  -> open/write store
  -> measure allocation
  -> replace reservation with measured allocation
```

Existing `STORAGE_THRESHOLD` remains the application limit. Add one operational configuration value for minimum filesystem free-space reserve only if the current configuration system has no equivalent. Do not add tunables for every dwell time or warm constant.

## 6.5 Warm range

Calculate target bytes from source bitrate and a fixed initial playback duration, clamped by fixed minimum and maximum byte bounds. Keep these values as code constants initially.

Select:

- the startup prefix;
- only required container metadata;
- only the chosen playable file, except unavoidable piece overlap.

MP4 tail metadata:

- On sparse storage, include the minimum required tail pieces.
- On full/unknown storage, skip speculative tail fetch unless full-file reservation fits.

Stop warming when the target range is verified, then deselect it while retaining data.

## 6.6 Eviction

Order:

1. Expired speculative storage.
2. Unleased speculative storage with the highest allocation amplification.
3. Never-played partial storage.
4. Watched partial storage by oldest interest.
5. Completed watched storage by oldest interest.
6. Never active playback.

Useful telemetry:

```text
allocation amplification = allocatedBytes / max(verifiedBytes, 1)
```

Centralize deletion in one storage operation:

```text
lock record
  -> reject if active stream
  -> deselect/stop torrent
  -> destroy torrent store
  -> delete any remaining backing path
  -> verify physical removal
  -> delete database row last
  -> report physically released bytes
```

If physical deletion fails, keep the database row and report failure. Do not lose the record that identifies leaked data.

---

# 7. Frontend implementation

## 7.1 Navigation graph

Update:

- `frontend/src/pages/home/HomePage.tsx`
- `frontend/src/pages/home/components/CategoryRow.tsx`
- `frontend/src/pages/home/components/MediaDetails.tsx`
- `frontend/src/pages/home/homeNavigation.ts`

`CategoryRowHandle` should expose enough state to obtain:

- focused media;
- left/right destinations;
- the selected destination used when entering that row vertically.

`HomePage` combines active row information with the row above/below to create the actual one-key reachable set. Do not derive priority from pixels or intersection ratio.

Details behavior:

- Movie: primary target is the movie.
- Show: primary target comes from progress/resume state; otherwise the first valid episode of the selected/default season.
- Moving across episodes immediately preloads artwork/details.
- Source/torrent preparation begins after a short stability delay.
- A stable selected episode replaces the warm target.
- Confirm/Watch bypasses delays.
- Back sends browse intent immediately; backend pauses details warmup.

## 7.2 Data-query policy

Update:

- `frontend/src/features/media/api/media.api.ts`
- `frontend/src/features/media/api/lists.api.ts`

Use RTK Query `util.prefetch` with `ifOlderThan`; do not force refetch on focus changes.

Mount/query policy:

- Active row: current page and at most one movement-direction page.
- Row above/below: enough data for their selected destination.
- Other rows: no page query until near activation.
- Focused target: detail prefetch.
- One-key target: summary/image only.
- Two-key target: browser lazy loading only.

Do not let every category mount current, previous, and next page queries on startup.

## 7.3 Image policy

Update:

- `frontend/src/pages/home/components/MediaCard.tsx`
- `frontend/src/pages/home/components/MediaHero.tsx`
- `frontend/src/pages/home/components/MediaDetails.tsx`
- `frontend/src/pages/home/media.utils.ts`

Use real `<img>`/`<picture>` elements rather than CSS backgrounds where practical so the browser controls decoding, responsive sizing, fetch priority, and lazy loading.

- Focused hero: responsive size around `w1280`, high fetch priority.
- Card artwork: size appropriate to rendered width, normally no larger than `w500`.
- One-key targets: eager normal-priority image request.
- Further items: lazy.
- Keep the previous hero until the next image decodes, then cross-fade.
- Do not request `original` on every homepage focus.
- Reuse the same detail-sized image between stable focus and details entry.

Use the browser HTTP cache; do not add a custom blob/Cache API layer.

---

# 8. Multi-tenant arbitration

Transient interest is per user/session/client. Physical data is shared by source hash.

Arbitration:

1. Explicit Watch always wins and becomes active playback.
2. Details primary playables compete for the speculative slot.
3. Stable selected alternate episodes compete after their dwell delay.
4. Homepage targets never receive payload bandwidth.

Tie-breaking between equal details intents:

1. If the current warm source satisfies multiple leases, keep it.
2. Otherwise choose the oldest waiting equal-priority lease.
3. Rotate after a bounded warm target is completed or the lease disappears.
4. Rapid focus updates do not reset fairness age indefinitely.

When one user leaves:

- Remove only that lease.
- Continue if another lease wants the same source.
- Never evict if another user is streaming it.

The first implementation should suspend speculative payload warming whenever any active stream exists. This is conservative and avoids adding player buffer telemetry. Catalog/source/metadata preparation may continue.

---

# 9. Failure behavior

- Catalog unavailable: serve cached summary/detail if available; Watch reports structured service-unavailable if no cache.
- Trakt unavailable: serve cached list page/generation.
- VPN unavailable: source preparation reports unavailable/degraded without retry loops tied to focus.
- No source: details remains usable; Watch returns a stable `no_source` error code.
- Torrent metadata timeout: try at most the next best candidate within the preparation budget, then stop.
- Insufficient disk: metadata remains ready; payload warm state becomes `cold` with an internal reason.
- Sparse probe failure: assume full allocation.
- Intent client disappears: lease expiry aborts future stages and pauses payload.
- Broker unavailable: interactive preparation still works inline; only durable follow-up is delayed.

Use domain error types. Do not expose hashes, magnets, storage paths, or provider secrets in API responses/logs.

---

# 10. Observability

Add metrics/spans for:

```text
focus -> detail cache ready
focus -> source candidates ready
focus -> torrent metadata ready
details entry -> warm target reached
Watch -> playback session created
Watch -> first stream byte

provider requests by service/work class/status
provider queue wait by work class
preload hit/miss
verified speculative bytes
allocated speculative bytes
allocation amplification
bytes later consumed by playback
bytes evicted unused
eviction reason and released bytes
warm-slot owner changes
stale intent rejections
```

Never include user secrets, tokens, magnet links, or hashes in metric labels.

---

# 11. Ordered implementation milestones

Each milestone must pass its proof before beginning the next one. Keep commits/reviews scoped by milestone.

## Milestone 0 — Baseline and contract tests

1. Measure current cold/warm navigation and Watch paths.
2. Add canonical playable/intent schemas and schema tests.
3. Add catalog v1 summary contract schemas and package tests.
4. Record current provider call count for a cold homepage start.

Proof:

- `npm test --workspace packages/service-contracts`
- Relevant backend contract/unit tests.
- No runtime behavior change yet.

## Milestone 1 — Clean data model and generic playback

1. Replace movie-only source/storage/key models.
2. Reset development DB and broker data using exact verified paths.
3. Implement generic source repository.
4. Implement playback grants pinned to source ID.
5. Implement progress persistence.
6. Migrate movie playback to the new endpoint.

Proof:

- Movie playback E2E still streams and range requests work.
- Grant for source A cannot stream source B.
- Progress persists and returns after restart.
- Source secrets remain encrypted.

## Milestone 2 — Episode-capable domain

1. Resolve episode local entities from `PlayableRef`.
2. Add provider capability dispatch.
3. Inspect fixtures for a real episode-capable provider.
4. Implement episode source discovery only against supported fixture-backed provider behavior.
5. Stream episode through the generic playback endpoint.

Stop/report condition:

- If no configured provider or fixture can return episode torrents, report that blocker. Do not invent network behavior. Movie work may continue, but the overall feature is not complete until an episode provider exists.

Proof:

- Fixture-backed episode source discovery.
- Correct SxxExx filtering.
- Current/resume episode streams through a pinned source.

## Milestone 3 — Catalog v1 and upstream scheduling

1. Implement summary endpoint.
2. Implement cache states and stale-while-revalidate.
3. Add abortable priority scheduler.
4. Route maintenance through maintenance work class.
5. Add list-service persistent page cache and rate-limit handling.
6. Change backend list bootstrap behavior.

Proof:

- Interactive catalog work starts ahead of queued maintenance.
- Repeated identical hydration makes one provider call.
- Stale data is served during provider failure.
- Cold homepage makes materially fewer provider calls than baseline.
- All tests use fixtures.

## Milestone 4 — Frontend query and image efficiency

1. Build navigation-context output.
2. Stop inactive rows from issuing page queries.
3. Add RTK Query prefetch.
4. Replace oversized background-image loads.
5. Decode-before-swap hero behavior.

Proof:

- Frontend E2E shows only active/neighbor data requests.
- Rapid arrows do not request `original` artwork per focus.
- Enter uses cached details after stable focus.
- Visual regression suite passes or snapshots are intentionally updated and reviewed.

## Milestone 5 — Intent service and metadata preparation

1. Add intent routes/service.
2. Add sequence and expiry handling.
3. Add preparation pipeline through torrent metadata.
4. Aggregate identical targets.
5. Keep Watch cold fallback.

Proof:

- Stale sequence cannot restart old work.
- Fast focus movement does not run metadata for every traversed item.
- Focused movie has selected torrent metadata before details entry in the warm case.
- Lease expiry stops future stages.

## Milestone 6 — Allocation-aware storage

1. Add allocation probe.
2. Add logical/verified/allocated/reserved accounting.
3. Add admission mutex/reservations.
4. Add centralized physical eviction.
5. Add reconciliation after warm/pause/delete.

Proof:

- Sparse probe classifies a supported fixture/temp filesystem.
- High-offset write test distinguishes logical from allocated bytes.
- Two simultaneous admissions cannot overcommit.
- Failed physical delete keeps the database record.
- Active stream eviction is rejected.

## Milestone 7 — One-slot payload warming

1. Implement bounded sequential piece selection.
2. Add warmup state machine and mutex.
3. Connect details intents.
4. Promote same source on Watch.
5. Suspend speculative payload while any stream is active.

Proof:

- Exactly one speculative torrent has selected pieces under races.
- Leaving details pauses within a bounded time.
- Returning during grace resumes existing pieces.
- Watch of warmed source does not re-add/reselect a different torrent.
- Disk charge remains below threshold and filesystem reserve.

## Milestone 8 — Multi-tenant and end-to-end proof

1. Add equal-priority fairness.
2. Test shared source interest.
3. Test one user leaving while another remains.
4. Test simultaneous playback plus focus changes.
5. Tune fixed dwell/warm constants from telemetry.

Proof:

- One user cannot monopolize warmup with focus spam.
- User A leaving does not pause user B.
- No active playback is evicted.
- Preload hit ratio and unused allocated bytes are visible.

---

# 12. Required test matrix

## Contract

- Invalid playable discriminants and IDs rejected.
- Intent candidate maximum enforced.
- Dates serialize as ISO strings.
- Catalog v1 request/response schemas cover pending/missing/errors.
- Service manifest advertises catalog v1 and backend rejects mismatched catalog versions.

## Intent/concurrency

- Newer sequence wins.
- Expired lease removed.
- Cancellation between every preparation stage.
- Old asynchronous result cannot take the warm slot.
- Watch promotion wins a focus race.
- Identical user targets share preparation.

## Storage

- Sequential prefix writes.
- Random high-offset writes.
- MP4 tail-range reservation behavior.
- Multi-file piece overlap.
- Sparse and full allocation modes.
- Physical block fallback to logical size.
- Reservation rollback on torrent-add failure.
- Deletion verification.
- Storage pressure eviction order.

## Provider/cache

- Fresh hit.
- Stale-while-revalidate.
- Require-fresh with stale fallback.
- Cache-only pending response.
- Single-flight promotion.
- 429 shared cooldown.
- Abort before dispatch.
- Trakt public/personal cache separation.

## Frontend E2E

- First homepage load.
- Horizontal traversal.
- Vertical traversal.
- Enter during pending dwell.
- Details Back.
- Episode traversal and selection.
- Warm Watch.
- Cold Watch.
- Reduced-motion behavior.
- Image decode failure fallback.

## Multi-tenant

- Same source, two users.
- Different details targets, two users.
- One active player plus one details browser.
- Client disappears without DELETE.
- Same user on two client IDs.

---

# 13. Final acceptance criteria

The implementation is complete only when all are true:

1. Homepage navigation no longer mounts/query-prefetches every category/page.
2. Focused media detail and torrent metadata are normally ready before Enter completes the details transition.
3. Payload warming begins only for the details primary target or stable selected episode.
4. Watch uses the exact warmed source.
5. At most one speculative payload torrent is active globally.
6. Active playback is never paused/evicted by preload activity.
7. Storage limits use measured physical allocation plus reservations.
8. Unsupported/non-sparse storage degrades safely to metadata-only preloading when full reservation cannot fit.
9. Startup/background provider work cannot starve interactive work.
10. Trakt/TMDB rate limiting and failures serve cached data when possible.
11. Intent expiry and stale sequence handling are proven under races.
12. Multi-tenant shared interest is respected.
13. Movie playback works end to end.
14. Episode playback works end to end with a real fixture-backed source provider; otherwise the external provider blocker is explicitly reported and the feature is not declared complete.
15. Relevant unit, contract, backend E2E, frontend E2E, and visual tests pass.

## Suggested verification commands

Run from the repository root and choose the smallest sufficient subset during each milestone:

```bash
npm test --workspace packages/service-contracts
npm test --workspace backend
npm run check:ts
npm run build:frontend
npm run test:backend:e2e
npm run test:frontend:e2e
npm run test:frontend:visual
```

Do not install dependencies inside workspace subdirectories. Do not make live provider calls in tests.

## Stop condition

Stop when the acceptance criteria are proven. Do not add adaptive ML ranking, per-provider plugins, offline downloads, buffer telemetry, or configurable knobs beyond what correctness and storage safety require.
