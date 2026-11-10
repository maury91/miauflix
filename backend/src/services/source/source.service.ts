import { logger } from '@logger';
import parseTorrent from 'parse-torrent';

import type { Database } from '@database/database';
import type { ContentSource } from '@entities/content-source.entity';
import type { EpisodeSource } from '@entities/episode-source.entity';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type {
  ContentSourceRepository,
  SourceProcessingResult,
} from '@repositories/content-source.repository';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import type { MovieRepository } from '@repositories/movie.repository';
import type { BackgroundJobService } from '@services/background-job/background-job.service';
import type { NotificationService } from '@services/notifications/notification.service';
import type { RequestService } from '@services/request/request.service';
import type { SourceMetadata } from '@services/sources/source-candidate';
import { fromCandidate } from '@services/sources/source-candidate';
import type { SourcesClientService } from '@services/sources/sources-client.service';
import { scheduleNextCheck } from '@utils/scheduling.util';
import { SingleFlight } from '@utils/singleflight.util';
import { sleep } from '@utils/time';
import { traced } from '@utils/tracing.util';
import { providerSourcesToEntities } from '@utils/transformers.util';

import { ErrorWithStatus } from './services/error-with-status.util';
import { matchEpisodeFile } from './episode-file-matcher';
import type { SourceAvailabilityService } from './source-availability.service';
import type { SourceMetadataFileService } from './source-metadata-file.service';

/** How long a source whose file list could not be fetched waits before another try. */
const UNRESOLVED_RETRY_MS = 60 * 60_000;
/**
 * Below this many seeders (or with unknown release languages), an episode's stored matches don't
 * stop another search.
 */
const WEAK_SWARM_BROADCASTERS = 10;
/** How long an episode whose matches are all weak waits before another search. */
const WEAK_RESEARCH_MS = 6 * 60 * 60_000;

interface TVRelease {
  metadata: SourceMetadata;
  source: ContentSource;
}

function mayContainEpisode(
  metadata: SourceMetadata,
  seasonNumber: number,
  episodeNumber: number
): boolean {
  if (
    metadata.season === seasonNumber &&
    (metadata.episode === undefined || metadata.episode === 0 || metadata.episode === episodeNumber)
  )
    return true;

  const releaseName = metadata.releaseName ?? '';
  const episodes = [...releaseName.matchAll(/s(\d{1,2})[ ._-]*e(\d{1,3})/gi)];
  if (
    episodes.some(match => Number(match[1]) === seasonNumber && Number(match[2]) === episodeNumber)
  ) {
    return true;
  }

  const namedSeasons = [...releaseName.matchAll(/s(\d{1,2})(?=\D|$)/gi)].map(match =>
    Number(match[1])
  );
  return (
    namedSeasons.includes(seasonNumber) &&
    (namedSeasons.length > 1 || /\b(?:complete|pack)\b|season\s*\d+/i.test(releaseName))
  );
}

function releaseQualityRank(value: string | null | undefined): number {
  const type = value?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
  if (type.includes('REMUX')) return 9;
  if (type.includes('BLURAY') || type.includes('BDRIP') || type.includes('BRRIP')) return 8;
  if (type.includes('WEBDL') || type === 'WEB') return 7;
  if (type.includes('WEBRIP')) return 6;
  if (type.includes('DVDSCR')) return 3;
  if (type.includes('HDTV')) return 4;
  if (type.includes('DVD')) return 5;
  if (type.includes('TELESYNC') || type === 'TS') return 2;
  if (type.includes('CAM')) return 1;
  return 0;
}

function releaseQualityName(rank: number): string {
  return (
    ['Unknown', 'CAM', 'TS', 'DVD screener', 'HDTV', 'DVD', 'WEB rip', 'WEB', 'Blu-ray', 'Remux'][
      rank
    ] ?? 'Unknown'
  );
}

/**
 * Service for searching and managing sources
 */
export class SourceService {
  private readonly pendingOnDemandSearches = new Map<number, Promise<unknown>>();
  private readonly movieRepository: MovieRepository;
  private readonly contentSourceRepository: ContentSourceRepository;
  private readonly episodeSourceRepository: EpisodeSourceRepository;
  /** When episodes whose stored matches were all weak were last searched again. */
  private readonly weakEpisodeSearches = new Map<number, number>();
  private readonly tvReleaseSearches = new Map<
    string,
    { expiresAt: number; promise: Promise<TVRelease[]> }
  >();
  private readonly searchLifetime = new AbortController();
  /** Sources whose file list could not be fetched, and when they may be tried again. */
  private readonly unresolvedUntil = new Map<number, number>();

  constructor(
    db: Database,
    /** media-load: reports whether its own connection is VPN-protected. */
    private readonly peers: { getStatus(): ServiceInstanceStatus },
    private readonly sourcesClient: SourcesClientService,
    private readonly magnetService: SourceMetadataFileService,
    _requestService: RequestService,
    private readonly config: ConfigService,
    private readonly backgroundJobs: BackgroundJobService,
    private readonly notifications: NotificationService,
    private readonly availability: SourceAvailabilityService
  ) {
    this.movieRepository = db.getMovieRepository();
    this.contentSourceRepository = db.getContentSourceRepository();
    this.episodeSourceRepository = db.getEpisodeSourceRepository();
    config.registerService('SOURCE', this);
  }

  async reload(): Promise<void> {}

  testable = false;
  getStatus(): ServiceInstanceStatus {
    return { status: 'ready' };
  }

  public async canRunSourceJobs(): Promise<boolean> {
    return this.sourcesClient.isReady();
  }

  public stop(): void {
    this.searchLifetime.abort();
  }

  /**
   * Whether jobs that reach trackers or peers through media-load may run. media-load refuses them
   * itself without a protected connection; this only keeps the jobs from failing one by one.
   */
  public async canRunPeerJobs(): Promise<boolean> {
    return this.peers.getStatus().vpn !== 'unprotected';
  }

  public async canRunMetadataJobs(): Promise<boolean> {
    return this.sourcesClient.isReady();
  }

  /**
   * Process movies that need source search
   * This method is designed to be run by the source background-job handler
   */
  @traced('SourceService')
  public async searchSourcesForMovies(): Promise<void> {
    // Find movies that haven't been searched at all
    const moviesToSearch = await this.movieRepository.findMoviesPendingSourceSearch(1);

    if (moviesToSearch.length === 0) {
      await sleep(500);
      return;
    }

    for (const movie of moviesToSearch) {
      await this.searchSourcesForMovie(movie, false, 10);
    }
  }

  /**
   * Search for sources for a specific movie
   */
  @SingleFlight(movie => movie.id + ':' + movie.contentDirectoriesSearched?.join(','))
  private async searchSourcesForMovie(
    movie: {
      id: number;
      mediaId: number;
      year?: number | null;
      releaseDate?: string | null;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched?: string[];
    },
    isOnDemand: boolean = false,
    priority = 20
  ): Promise<{ directory: string; sources: ContentSource[] } | void> {
    try {
      const previousSources = await this.contentSourceRepository.findByMovieId(movie.id);
      const previousBest = previousSources
        .map(source => ({ source, rank: releaseQualityRank(source.sourceType) }))
        .sort((left, right) => right.rank - left.rank)[0];
      const previousQuality = previousBest?.rank ?? 0;
      const createdSources: ContentSource[] = [];
      let pending: SourceMetadata[] = [];
      let write = Promise.resolve();
      let trailerSaved = false;
      const flush = (): Promise<void> => {
        const batch = pending;
        pending = [];
        if (batch.length) {
          write = write.then(async () => {
            const rows = providerSourcesToEntities(batch);
            createdSources.push(
              ...(await this.contentSourceRepository.upsertForMovie(movie.id, rows))
            );
          });
        }
        return write;
      };
      // Flush even if the provider pauses before emitting its next candidate.
      const timer = setInterval(() => {
        void flush().catch(() => undefined);
      }, 250);
      try {
        for await (const item of this.sourcesClient.search(
          {
            media: {
              kind: 'movie',
              releaseDate: movie.releaseDate,
              tmdbId: movie.mediaId,
              imdbId: movie.imdbId,
              title: movie.title,
              year:
                movie.year ?? (movie.releaseDate ? Number(movie.releaseDate.slice(0, 4)) : null),
            },
            purpose: isOnDemand ? 'interactive' : 'background',
            skipProviders: movie.contentDirectoriesSearched ?? [],
          },
          this.searchLifetime.signal
        )) {
          if (item.type === 'candidate') {
            pending.push(fromCandidate(item.candidate));
            if (!trailerSaved && item.candidate.trailerCode) {
              trailerSaved = true;
              await this.movieRepository.updateMovieTrailerIfDoesntExists(
                movie.id,
                item.candidate.trailerCode
              );
            }
          } else {
            await flush();
            await this.movieRepository.recordSourceSearch(
              movie.id,
              item.providersSearched,
              item.retryAfter,
              item.complete
            );
          }
        }
      } finally {
        clearInterval(timer);
        await flush();
      }
      const nextQualitySource = createdSources
        .map(source => ({ source, rank: releaseQualityRank(source.sourceType) }))
        .sort((left, right) => right.rank - left.rank)[0];
      const mediaId = movie.mediaId ?? (await this.movieRepository.findById(movie.id))?.mediaId;
      if (
        mediaId &&
        previousQuality > 0 &&
        nextQualitySource &&
        nextQualitySource.rank > previousQuality
      ) {
        const previousQualityName = releaseQualityName(previousQuality);
        const nextQualityName = releaseQualityName(nextQualitySource.rank);
        try {
          await this.notifications.movieQualityUpgrade({
            mediaId,
            title: movie.title,
            qualityKey: nextQualityName.toLowerCase(),
            previousQuality: previousQualityName,
            nextQuality: nextQualityName,
            source: {
              quality: nextQualitySource.source.quality,
              sourceType: nextQualitySource.source.sourceType,
            },
            previousSourceType: previousBest?.source.sourceType ?? null,
          });
        } catch (error) {
          logger.warn('SourceService', 'Movie quality notification could not be stored', error);
        }
      }
      this.backgroundJobs.bulkBestEffort(
        createdSources.flatMap(source => [
          {
            type: 'source.metadata' as const,
            dedupeKey: String(source.id),
            payload: { sourceId: source.id },
            options: { priority: Math.max(1, priority) },
          },
          {
            type: 'source.stats' as const,
            dedupeKey: String(source.id),
            payload: { sourceId: source.id },
            options: { priority: Math.max(1, priority - 20) },
          },
        ])
      );
      logger.debug('SourceService', `Saved ${createdSources.length} sources for movie ${movie.id}`);
      return { directory: 'sources', sources: createdSources };
    } catch (error) {
      await this.movieRepository.markSourceSearchAttempt(movie.id);
      logger.error('SourceService', `Error searching sources for movie ${movie.id}:`, error);
    }
  }

  public async processSourceDiscovery(
    movieId: number,
    priority = 20
  ): Promise<{ complete: boolean; sourceCount: number }> {
    const movie = await this.movieRepository.findById(movieId);
    if (!movie) return { complete: true, sourceCount: 0 };
    if (movie.nextSourceSearchAt && movie.nextSourceSearchAt > new Date()) {
      return { complete: true, sourceCount: 0 };
    }
    const result = await this.searchSourcesForMovie(movie, false, priority);
    const refreshed = await this.movieRepository.findById(movieId);
    return {
      complete: refreshed?.sourceSearchComplete ?? false,
      sourceCount: result?.sources.length ?? 0,
    };
  }

  public async processSourceDiscoveryByMediaId(movieMediaId: number, priority = 20): Promise<void> {
    const movie = await this.movieRepository.findByMediaId(movieMediaId);
    if (movie) await this.processSourceDiscovery(movie.id, priority);
  }

  /** Search once per show, then associate exact torrent files with catalog episodes. */
  public async getSourcesForEpisodeWithOnDemandSearch(episode: {
    episodeId: number;
    showMediaId?: number;
    showTitle?: string;
    showTmdbId?: number;
    showYear?: number | null;
    showImdbId: string | null;
    seasonNumber: number;
    episodeNumber: number;
    /** TMDB's numbering of an anime numbered by AniList entry; sources speak TMDB's. */
    providerSeasonNumber?: number | null;
    providerEpisodeNumber?: number | null;
    airDate?: string | null;
  }): Promise<EpisodeSource[]> {
    if (!this.isEpisodeWithinLeakTolerance(episode.airDate)) return [];
    const existing = await this.episodeSourceRepository.findByEpisodeId(episode.episodeId);
    const single = existing.filter(association => association.matchKind === 'single');
    // Matches with a live swarm are enough. Weak ones are searched again now and then: a provider
    // enabled since (or newer releases) may have a better copy. So are ones stored before release
    // languages were recorded: the search records them, and selection needs them.
    if (
      single.some(
        association =>
          (association.source?.broadcasters ?? 0) >= WEAK_SWARM_BROADCASTERS &&
          association.source?.languages !== null
      ) ||
      (single.length &&
        Date.now() - (this.weakEpisodeSearches.get(episode.episodeId) ?? 0) < WEAK_RESEARCH_MS)
    )
      return existing;
    if (single.length) {
      this.weakEpisodeSearches.set(episode.episodeId, Date.now());
      if (this.weakEpisodeSearches.size > 1000)
        this.weakEpisodeSearches.delete(this.weakEpisodeSearches.keys().next().value!);
    }
    const searched = {
      ...episode,
      seasonNumber: episode.providerSeasonNumber ?? episode.seasonNumber,
      episodeNumber: episode.providerEpisodeNumber ?? episode.episodeNumber,
    };
    const releases = await this.getTVReleases(searched);
    const associate = (allowCombined: boolean) =>
      releases.flatMap(release => {
        const match = matchEpisodeFile(
          release.metadata,
          searched.seasonNumber,
          searched.episodeNumber,
          allowCombined
        );
        return match ? [{ release, match }] : [];
      });
    let matches = associate(false);
    if (!matches.length) {
      const metadataCandidates = releases
        .filter(release =>
          mayContainEpisode(release.metadata, searched.seasonNumber, searched.episodeNumber)
        )
        .sort((left, right) => {
          const exact = (release: TVRelease) =>
            release.metadata.season === searched.seasonNumber &&
            release.metadata.episode === searched.episodeNumber
              ? 1
              : 0;
          return (
            exact(right) - exact(left) ||
            (right.metadata.broadcasters ?? 0) - (left.metadata.broadcasters ?? 0)
          );
        })
        .slice(0, 2);
      // Each lookup can wait out a slow swarm: run them side by side, not one after another.
      const resolveFiles = async (candidate: TVRelease): Promise<void> => {
        try {
          const source =
            (await this.contentSourceRepository.findById(candidate.source.id)) ?? candidate.source;
          let torrentFile: Buffer | undefined =
            source.file ??
            (await this.sourcesClient
              .torrentFile(source.hash, source.url ?? undefined)
              .catch(error => {
                logger.debug(
                  'SourceService',
                  `Sources lookup failed for TV source ${source.id}`,
                  error
                );
                return null;
              })) ??
            undefined;
          if (!torrentFile && source.magnetLink && (await this.canRunPeerJobs())) {
            torrentFile =
              (await this.magnetService.getPlaybackTorrentMetadataFile(
                source.magnetLink,
                source.hash
              )) ?? undefined;
          }
          if (!torrentFile) return;

          const parsed = await parseTorrent(torrentFile);
          if (parsed.infoHash?.toLowerCase() !== source.hash.toLowerCase()) {
            logger.warn(
              'SourceService',
              `Ignoring torrent metadata with a mismatched hash for TV source ${source.id}`
            );
            return;
          }
          const files = (parsed.files ?? []).map(file => file.path).filter(Boolean);
          if (!source.file) {
            await this.contentSourceRepository.updateSourceFile(source.id, torrentFile);
            source.file = torrentFile;
          }
          source.hasVideo =
            (await this.availability.recordTorrentFile(source.id, torrentFile)) ?? source.hasVideo;
          candidate.source = source;
          candidate.metadata.files = files;
        } catch (error) {
          logger.warn(
            'SourceService',
            `Unable to resolve torrent files for TV source ${candidate.source.id}`,
            error
          );
        }
      };
      await Promise.all(metadataCandidates.map(resolveFiles));
      matches = associate(false);
    }
    if (!matches.length) matches = associate(true);

    for (const { release, match } of matches) {
      await this.episodeSourceRepository.associate(
        episode.episodeId,
        release.source.id,
        match.videoFilePath,
        match.matchKind
      );
    }
    const associations = await this.episodeSourceRepository.findByEpisodeId(episode.episodeId);
    // Announce the episode only once a source is verified to hold real video; unverified
    // matches are checked in the background, which announces it when one proves real.
    const verified = associations.find(
      association => association.source?.hasVideo === true
    )?.source;
    if (!verified) this.requestSourceVerification(associations.map(({ source }) => source));
    if (verified && episode.showMediaId && episode.showTitle) {
      try {
        await this.notifications.episodeAvailable({
          showMediaId: episode.showMediaId,
          showTitle: episode.showTitle,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: episode.airDate ?? null,
          source: { quality: verified.quality, sourceType: verified.sourceType },
        });
      } catch (error) {
        logger.warn('SourceService', 'TV episode notification could not be stored', error);
      }
    }
    return associations;
  }

  /** Unknown air dates preserve on-demand behavior; known upcoming episodes wait for the configured window. */
  public isEpisodeWithinLeakTolerance(airDate?: string | null, now = Date.now()): boolean {
    if (!airDate) return true;
    const airTime = Date.parse(airDate);
    if (!Number.isFinite(airTime)) return true;
    return airTime <= now + (this.config.get('LEAK_TOLERANCE') ?? 0);
  }

  private async getTVReleases(episode: {
    showImdbId: string | null;
    showTmdbId?: number;
    showTitle?: string;
    showYear?: number | null;
    seasonNumber: number;
    episodeNumber: number;
    airDate?: string | null;
  }): Promise<TVRelease[]> {
    const key = `${episode.showImdbId ?? episode.showTmdbId}:${episode.seasonNumber}:${episode.episodeNumber}`;
    const cached = this.tvReleaseSearches.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = (async () => {
      const releases = new Map<string, TVRelease>();
      for await (const item of this.sourcesClient.search(
        {
          media: {
            kind: 'show',
            tmdbId: episode.showTmdbId ?? 0,
            imdbId: episode.showImdbId,
            title: episode.showTitle ?? '',
            year: episode.showYear,
          },
          season: episode.seasonNumber,
          episode: episode.episodeNumber,
          airDate: episode.airDate,
          purpose: 'interactive',
        },
        AbortSignal.any([this.searchLifetime.signal, AbortSignal.timeout(20_000)])
      )) {
        if (item.type !== 'candidate') continue;
        const metadata = fromCandidate(item.candidate);
        const row = providerSourcesToEntities([metadata])[0];
        const source = await this.contentSourceRepository.upsertByHash(row);
        releases.set(source.hash, { metadata, source });
        this.backgroundJobs.enqueueBestEffort({
          type: 'source.stats',
          dedupeKey: String(source.id),
          payload: { sourceId: source.id },
          options: { priority: 20 },
        });
      }
      return [...releases.values()];
    })();
    const cache = { expiresAt: Date.now() + 5 * 60_000, promise };
    this.tvReleaseSearches.set(key, cache);
    try {
      return await promise;
    } catch (error) {
      if (this.tvReleaseSearches.get(key) === cache) this.tvReleaseSearches.delete(key);
      throw error;
    }
  }

  public async seedSourceDiscoveryJobs(limit = 25): Promise<void> {
    const movies = await this.movieRepository.findMoviesPendingSourceSearch(limit);
    await this.backgroundJobs.enqueueBulk(
      movies.map(movie => ({
        type: 'source.discover',
        dedupeKey: String(movie.id),
        payload: { movieId: movie.id },
        options: { priority: 20 },
      }))
    );
  }

  public async seedSourceMetadataJobs(): Promise<void> {
    const sources = await this.contentSourceRepository.getNextSourcesToProcess(
      Math.max(2, this.magnetService.getAvailableConcurrency())
    );
    await this.backgroundJobs.enqueueBulk(
      sources.map(source => ({
        type: 'source.metadata',
        dedupeKey: String(source.id),
        payload: { sourceId: source.id },
        options: { priority: 40 },
      }))
    );
  }

  public async seedSourceStatsJobs(limit = 25): Promise<void> {
    const sources = await this.contentSourceRepository.findSourceThatNeedsStatsUpdate(limit);
    await this.backgroundJobs.enqueueBulk(
      sources.map(source => ({
        type: 'source.stats',
        dedupeKey: String(source.id),
        payload: { sourceId: source.id },
        options: { priority: 20 },
      }))
    );
  }

  public async processSourceMetadata(sourceId: number): Promise<void> {
    const source = await this.contentSourceRepository.findById(sourceId);
    if (!source?.file) {
      if (!source) return;
      await this.downloadSourceFileForSource(source as unknown as SourceProcessingResult);
      const updated = await this.contentSourceRepository.findById(sourceId);
      if (!updated?.file) throw new Error('Source metadata could not be resolved');
    }
  }

  public async processSourceStats(sourceId: number): Promise<Date> {
    const source = await this.contentSourceRepository.findById(sourceId);
    if (!source) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { broadcasters, watchers } = await this.magnetService.getStats(source.hash);
    const nextCheckTime = scheduleNextCheck(
      source.lastStatsCheck && source.nextStatsCheckAt
        ? source.nextStatsCheckAt.getTime() - source.lastStatsCheck.getTime()
        : undefined,
      { old: source.broadcasters ?? 0, new: broadcasters },
      { old: source.watchers ?? 0, new: watchers }
    );
    await this.contentSourceRepository.updateStats(source, broadcasters, watchers, nextCheckTime);
    return nextCheckTime;
  }

  /**
   * Find all sources for a specific movie
   */
  @traced('SourceService')
  public async getSourcesForMovie(movieId: number): Promise<ContentSource[]> {
    return this.contentSourceRepository.findByMovieId(movieId);
  }

  /**
   * Search for sources for a specific movie with timeout (for on-demand requests)
   * If the movie has no sources and hasn't been searched yet, search immediately
   * Returns sources within timeout, but continues search in background if needed
   */
  public async getSourcesForMovieWithOnDemandSearch(
    movie: {
      id: number;
      mediaId: number;
      releaseDate?: string | null;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched: string[];
    },
    timeoutMs: number = 1200
  ): Promise<ContentSource[]> {
    // First check if we already have sources
    const existingSources = await this.getSourcesForMovie(movie.id);
    if (existingSources.length > 0) {
      return existingSources;
    }

    // Concurrent callers join the in-flight search instead of returning before it has results.
    let search = this.pendingOnDemandSearches.get(movie.id);
    if (!search) {
      search = this.searchSourcesForMovie(movie, true).finally(() => {
        this.pendingOnDemandSearches.delete(movie.id);
      });
      this.pendingOnDemandSearches.set(movie.id, search);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        search,
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      // The stream continues to drain after the caller's deadline; each batch remains usable.
      return await this.getSourcesForMovie(movie.id);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Queue background checks of whether unverified sources hold real video. */
  public requestSourceVerification(
    sources: ReadonlyArray<Pick<ContentSource, 'hasVideo' | 'id'> | undefined>,
    priority = 30
  ): void {
    const unverified = sources.filter(
      (source): source is Pick<ContentSource, 'hasVideo' | 'id'> =>
        !!source && source.hasVideo === null
    );
    if (!unverified.length) return;
    this.backgroundJobs.bulkBestEffort(
      unverified.map(source => ({
        type: 'source.verify' as const,
        dedupeKey: `source:${source.id}`,
        payload: { sourceId: source.id },
        options: { priority },
      }))
    );
  }

  /** Queue a check of a movie's candidates until one proves real or all prove fake. */
  public requestMovieVerification(movieId: number, priority = 30): void {
    this.backgroundJobs.enqueueBestEffort({
      type: 'source.verify',
      dedupeKey: `movie:${movieId}`,
      payload: { movieId },
      options: { priority },
    });
  }

  /**
   * Learn whether a source holds real video by fetching its file list, without downloading
   * any payload. Uses the bounded playback metadata lane (one torrent at a time, with a
   * timeout), so background checks never pile up peer-discovery state.
   */
  public async verifySource(sourceId: number): Promise<boolean | null> {
    const source = await this.contentSourceRepository.findById(sourceId);
    if (!source) return null;
    if (source.hasVideo !== null) return source.hasVideo;
    let file = source.file ?? null;
    if (!file && source.magnetLink) {
      file = await this.magnetService
        .getPlaybackTorrentMetadataFile(source.magnetLink, source.hash)
        .catch(error => {
          logger.debug('SourceService', `File list of source ${sourceId} unavailable`, error);
          return null;
        });
      if (file) await this.contentSourceRepository.updateSourceFile(sourceId, file);
    }
    if (!file) return null;
    return await this.availability.recordTorrentFile(sourceId, file);
  }

  /**
   * Verify a movie's candidates, best first, until one proves real. Each check is bounded by
   * the metadata timeout, so a run touches at most a handful of sources.
   */
  public async verifyMovieSources(movieId: number, maxChecks = 6): Promise<void> {
    for (let check = 0; check < maxChecks; check++) {
      const sources = await this.contentSourceRepository.findByMovieId(movieId);
      if (sources.some(source => source.hasVideo === true)) return;
      const now = Date.now();
      const next = sources
        .filter(
          source => source.hasVideo === null && (this.unresolvedUntil.get(source.id) ?? 0) <= now
        )
        .sort((left, right) => (right.streamingScore ?? 0) - (left.streamingScore ?? 0))[0];
      if (!next) return;
      const verdict = await this.verifySource(next.id);
      // A file list that could not be fetched (no peers yet) is retried later, after the rest.
      if (verdict === null) this.unresolvedUntil.set(next.id, now + UNRESOLVED_RETRY_MS);
      else this.unresolvedUntil.delete(next.id);
      if (verdict === true) return;
    }
  }

  /** Whether an on-demand source search is still running after its caller timed out. */
  public isOnDemandSearchPending(movieId: number): boolean {
    return this.pendingOnDemandSearches.has(movieId);
  }

  /**
   * Find all sources with source metadata files for a specific movie
   */
  @traced('SourceService')
  public async getSourcesWithFilesForMovie(movieId: number): Promise<ContentSource[]> {
    const sources = await this.contentSourceRepository.findByMovieId(movieId);
    return sources.filter(source => source.file !== null);
  }

  @traced('SourceService')
  public async syncStatsForSources(): Promise<void> {
    if (!(await this.canRunPeerJobs())) {
      logger.warn('SourceService', `media-load is not behind a VPN, skipping stats sync`);
      await sleep(5000);
      return;
    }

    const sourcesToUpdate = await this.contentSourceRepository.findSourceThatNeedsStatsUpdate(5);
    if (sourcesToUpdate.length === 0) {
      return;
    }
    logger.debug('SourceService', `Updating stats for ${sourcesToUpdate.length} sources`);
    await Promise.all(
      sourcesToUpdate.map(async source => {
        try {
          const { broadcasters, watchers } = await this.magnetService.getStats(source.hash);
          const nextCheckTime = scheduleNextCheck(
            source.lastStatsCheck && source.nextStatsCheckAt
              ? source.nextStatsCheckAt.getTime() - source.lastStatsCheck.getTime()
              : undefined,
            { old: source.broadcasters ?? 0, new: broadcasters },
            { old: source.watchers ?? 0, new: watchers }
          );

          await this.contentSourceRepository.updateStats(
            source,
            broadcasters,
            watchers,
            nextCheckTime
          );
          logger.debug(
            'SourceService',
            `Updated stats for source ${source.id} (quality: ${source.quality})`
          );
        } catch (error) {
          if (error instanceof ErrorWithStatus && error.status === 'scrape_timeout') {
            logger.debug(
              'SourceService',
              `Stats scrape timed out for source ${source.id} (quality: ${source.quality})`
            );
          } else {
            logger.error(
              'SourceService',
              `Error updating stats for source ${source.id} (quality: ${source.quality}):`,
              error
            );
          }
        }
      })
    );
  }

  /**
   * Search and save source file for a specific source
   */
  private async downloadSourceFileForSource(source: SourceProcessingResult): Promise<void> {
    logger.debug(
      'SourceService',
      `Searching file for source ${source.id} (quality: ${source.quality})`
    );

    try {
      let file = await this.sourcesClient.torrentFile(source.hash, source.url ?? undefined);
      if (!file) {
        file = await this.magnetService.getSourceMetadataFile(source.magnetLink, source.hash);
      }

      if (!file) {
        logger.warn(
          'SourceService',
          `No file found for source ${source.id} (quality: ${source.quality})`
        );
        return;
      }

      // The source service resolves untrusted files; identity verification stays here.
      const parsed = await parseTorrent(file);
      if (parsed.infoHash?.toLowerCase() !== source.hash.toLowerCase()) {
        logger.warn(
          'SourceService',
          `Ignoring metadata with a mismatched hash for source ${source.id}`
        );
        return;
      }

      // Save the source file to the database
      await this.contentSourceRepository.updateSourceFile(source.id, file);
      await this.availability.recordTorrentFile(source.id, file);

      logger.debug(
        'SourceService',
        `Successfully saved file for source ${source.id} (quality: ${source.quality}, size: ${file.length} bytes)`
      );
    } catch (error) {
      logger.error(
        'SourceService',
        `Error searching file for source ${source.id} (quality: ${source.quality}):`,
        error
      );
    }
  }
}
