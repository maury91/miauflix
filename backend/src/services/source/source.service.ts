import { logger } from '@logger';
import parseTorrent from 'parse-torrent';

import type { SourceMetadata } from '@content-directories/content-directory.abstract';
import type { Database } from '@database/database';
import type { EpisodeSource } from '@entities/episode-source.entity';
import type { MovieSource } from '@entities/movie-source.entity';
import { SourceError } from '@errors/source.errors';
import type { ConfigService, ServiceInstanceStatus } from '@mytypes/configuration';
import type { EpisodeSourceRepository } from '@repositories/episode-source.repository';
import type { MovieRepository } from '@repositories/movie.repository';
import type {
  MovieSourceRepository,
  SourceProcessingResult,
} from '@repositories/movie-source.repository';
import type { BackgroundJobService } from '@services/background-job/background-job.service';
import type { NotificationService } from '@services/notifications/notification.service';
import type { RequestService } from '@services/request/request.service';
import type { VpnDetectionService } from '@services/security/vpn.service';
import type { ContentDirectoryService } from '@services/source-metadata/content-directory.service';
import { adaptiveLog } from '@utils/adaptive-logging.util';
import { RateLimiter } from '@utils/rateLimiter';
import { scheduleNextCheck } from '@utils/scheduling.util';
import { SingleFlight } from '@utils/singleflight.util';
import { sleep } from '@utils/time';
import { traced } from '@utils/tracing.util';
import { providerSourcesToEntities } from '@utils/transformers.util';
import { validateContentFileResponse } from '@utils/validation.util';

import { ErrorWithStatus } from './services/error-with-status.util';
import { matchEpisodeFile } from './episode-file-matcher';
import type { SourceMetadataFileService } from './source-metadata-file.service';

interface TVRelease {
  metadata: SourceMetadata;
  source: MovieSource;
}

function mayContainEpisode(
  metadata: SourceMetadata,
  seasonNumber: number,
  episodeNumber: number
): boolean {
  if (
    metadata.season === seasonNumber &&
    (metadata.episode === 0 || metadata.episode === episodeNumber)
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
  private readonly pendingOnDemandSearches = new Set<number>();
  private readonly movieRepository: MovieRepository;
  private readonly movieSourceRepository: MovieSourceRepository;
  private readonly episodeSourceRepository: EpisodeSourceRepository;
  private readonly tvReleaseSearches = new Map<
    string,
    { expiresAt: number; promise: Promise<TVRelease[]> }
  >();
  private readonly sourceRateLimiters = new Map<string, RateLimiter>();

  private vpnConnected = false;
  private searchOnlyBehindVpn: boolean;
  private startPromise: Promise<void>;
  private startError: unknown = null;
  private startResolved = false;
  private startStartedAt = 0;
  private vpnProbeVersion = 0;
  private readonly config: ConfigService;
  private readonly vpnService: VpnDetectionService;
  private readonly backgroundJobs?: BackgroundJobService;
  private vpnUnsubscribers: Array<() => void> = [];

  constructor(
    db: Database,
    vpnService: VpnDetectionService,
    private readonly contentDirectoryService: ContentDirectoryService,
    private readonly magnetService: SourceMetadataFileService,
    private readonly requestService: RequestService,
    config: ConfigService,
    backgroundJobs?: BackgroundJobService,
    private readonly notifications?: NotificationService
  ) {
    this.config = config;
    this.vpnService = vpnService;
    this.searchOnlyBehindVpn = !config.getOrThrow('DISABLE_VPN_CHECK');
    this.movieRepository = db.getMovieRepository();
    this.movieSourceRepository = db.getMovieSourceRepository();
    this.episodeSourceRepository = db.getEpisodeSourceRepository();
    this.backgroundJobs = backgroundJobs;
    config.registerService('SOURCE', this);
    if (this.searchOnlyBehindVpn) {
      this.startPromise = this.trackStartPromise(this.refreshVpnState());
      this.vpnUnsubscribers = [
        vpnService.on('connect', () => {
          this.vpnConnected = true;
        }),
        vpnService.on('disconnect', () => {
          this.vpnConnected = false;
        }),
      ];
    } else {
      this.vpnConnected = true; // If not searching only behind VPN, assume connected
      this.startResolved = true;
      this.startPromise = Promise.resolve();
    }
  }

  private trackStartPromise(promise: Promise<void>): Promise<void> {
    this.startResolved = false;
    this.startError = null;
    this.startStartedAt = Date.now();
    promise.then(
      () => {
        this.startResolved = true;
      },
      (err: unknown) => {
        this.startError = err;
      }
    );
    return promise;
  }

  private refreshVpnState(): Promise<void> {
    const version = ++this.vpnProbeVersion;
    return this.vpnService.isVpnActive().then(connected => {
      if (version === this.vpnProbeVersion && this.searchOnlyBehindVpn) {
        this.vpnConnected = connected;
      }
    });
  }

  async reload(): Promise<void> {
    this.searchOnlyBehindVpn = !this.config.getOrThrow('DISABLE_VPN_CHECK');
    if (!this.searchOnlyBehindVpn) {
      this.vpnConnected = true;
      this.startResolved = true;
      this.startPromise = Promise.resolve();
      this.startError = null;
      for (const unsub of this.vpnUnsubscribers) unsub();
      this.vpnUnsubscribers = [];
    } else {
      for (const unsub of this.vpnUnsubscribers) unsub();
      this.startPromise = this.trackStartPromise(this.refreshVpnState());
      this.vpnUnsubscribers = [
        this.vpnService.on('connect', () => {
          this.vpnConnected = true;
        }),
        this.vpnService.on('disconnect', () => {
          this.vpnConnected = false;
        }),
      ];
    }
  }

  testable = false;
  getStatus(): ServiceInstanceStatus {
    if (!this.searchOnlyBehindVpn) {
      return { status: 'ready' };
    }
    if (this.startError !== null) {
      const msg =
        this.startError instanceof Error ? this.startError.message : String(this.startError);
      return { status: 'error', errorMessage: msg, error: this.startError };
    }
    if (!this.startResolved) {
      return {
        status: 'initializing',
        details: 'Checking VPN connection',
        startedAt: this.startStartedAt,
      };
    }
    if (!this.vpnConnected) {
      return { status: 'degraded', reason: 'vpn-disconnected' };
    }
    return { status: 'ready' };
  }

  private async checkForVpnConnection(action: string): Promise<boolean> {
    if (this.searchOnlyBehindVpn) {
      await this.startPromise;
      if (!this.vpnConnected) {
        logger.warn('SourceService', `VPN is not connected, skipping ${action}`);
        await sleep(2000);
        return false;
      }
      return this.vpnConnected;
    }
    return true;
  }

  public async canRunSourceJobs(): Promise<boolean> {
    await this.startPromise;
    return this.vpnConnected || !this.searchOnlyBehindVpn;
  }

  public async canRunMetadataJobs(): Promise<boolean> {
    return this.magnetService.isEnabled() && (await this.canRunSourceJobs());
  }

  /**
   * Process movies that need source search
   * This method is designed to be run by the source background-job handler
   */
  @traced('SourceService')
  public async searchSourcesForMovies(): Promise<void> {
    if (!(await this.checkForVpnConnection('searchSourcesForMovies'))) {
      return;
    }

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
      mediaId?: number;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched?: string[];
    },
    isOnDemand: boolean = false,
    priority = 20
  ): Promise<{ directory: string; sources: MovieSource[] } | void> {
    if (!(await this.checkForVpnConnection('searchSourcesForMovie'))) {
      return;
    }

    if (!movie.imdbId) {
      logger.warn(
        'SourceService',
        `Movie ${movie.id} (${movie.title}) has no IMDb ID, skipping source search`
      );
      return;
    }

    logger.debug(
      'SourceService',
      `Searching sources for movie ${movie.id} (${movie.title}) with IMDb ID ${movie.imdbId}`
    );

    try {
      const previousSources = await this.movieSourceRepository.findByMovieId(movie.id);
      const previousQuality = previousSources.reduce(
        (best, source) => Math.max(best, releaseQualityRank(source.sourceType)),
        0
      );
      // Search for sources using the content directory service
      const movieWithSources = await this.contentDirectoryService.searchSourcesForMovie(
        movie.imdbId,
        isOnDemand,
        movie.contentDirectoriesSearched || [],
        true
      );

      for (const directory of movieWithSources?.searched ?? [movieWithSources?.source ?? '']) {
        if (!directory) continue;
        await this.movieRepository.markSourceSearched(movie.id, directory);
      }
      if (!movieWithSources?.sources?.length) {
        logger.debug('SourceService', `No sources found for movie ${movie.id} (${movie.title})`);
        await this.movieRepository.markSourceSearchAttempt(movie.id);
        return;
      }

      logger.debug(
        'SourceService',
        `Found ${movieWithSources.sources.length} sources for movie ${movie.id} (${movie.title}) using ${movieWithSources.source}`
      );

      if (movieWithSources.trailerCode) {
        // If the movie has a trailer, update the movie record
        await this.movieRepository.updateMovieTrailerIfDoesntExists(
          movie.id,
          movieWithSources.trailerCode
        );
      }

      // Convert sources to MovieSource objects and save them
      const sources = providerSourcesToEntities(
        movieWithSources.sources,
        movie.id,
        movieWithSources.source
      );

      const createdSources = await this.movieSourceRepository.createMany(sources);
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
          await this.notifications?.movieQualityUpgrade({
            mediaId,
            title: movie.title,
            qualityKey: nextQualityName.toLowerCase(),
            previousQuality: previousQualityName,
            nextQuality: nextQualityName,
          });
        } catch (error) {
          logger.warn('SourceService', 'Movie quality notification could not be stored', error);
        }
      }
      this.backgroundJobs?.bulkBestEffort(
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
      logger.debug(
        'SourceService',
        `Saved ${sources.length} sources for movie ${movie.id} (${movie.title})`
      );
      return { directory: movieWithSources.source, sources: createdSources };
    } catch (error) {
      logger.error(
        'SourceService',
        `Error searching sources for movie ${movie.id} (${movie.title}):`,
        error
      );
    }
  }

  public async processSourceDiscovery(
    movieId: number,
    priority = 20
  ): Promise<{ complete: boolean; sourceCount: number }> {
    let movie = await this.movieRepository.findById(movieId);
    if (!movie?.imdbId) return { complete: true, sourceCount: 0 };
    const providerNames = this.contentDirectoryService.getMovieDirectoryNames();
    if (providerNames.every(name => movie?.contentDirectoriesSearched.includes(name))) {
      if (movie.nextSourceSearchAt && movie.nextSourceSearchAt > new Date()) {
        return { complete: true, sourceCount: 0 };
      }
      await this.movieRepository.resetSourceSearchState(movieId);
      movie = await this.movieRepository.findById(movieId);
      if (!movie?.imdbId) return { complete: true, sourceCount: 0 };
    }
    const result = await this.searchSourcesForMovie(movie, false, priority);
    const refreshed = await this.movieRepository.findById(movieId);
    const complete = providerNames.every(name =>
      refreshed?.contentDirectoriesSearched.includes(name)
    );
    return { complete, sourceCount: result?.sources.length ?? 0 };
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
    showImdbId: string | null;
    seasonNumber: number;
    episodeNumber: number;
    airDate?: string | null;
  }): Promise<EpisodeSource[]> {
    if (!this.isEpisodeWithinLeakTolerance(episode.airDate)) return [];
    const existing = await this.episodeSourceRepository.findByEpisodeId(episode.episodeId);
    if (existing.some(association => association.matchKind === 'single')) return existing;
    if (!episode.showImdbId || !(await this.checkForVpnConnection('TV source search')))
      return existing;

    const releases = await this.getTVReleases(episode.showImdbId);
    const associate = (allowCombined: boolean) =>
      releases.flatMap(release => {
        const match = matchEpisodeFile(
          release.metadata,
          episode.seasonNumber,
          episode.episodeNumber,
          allowCombined
        );
        return match ? [{ release, match }] : [];
      });
    let matches = associate(false);
    if (!matches.length) {
      const metadataCandidates = releases
        .filter(release =>
          mayContainEpisode(release.metadata, episode.seasonNumber, episode.episodeNumber)
        )
        .sort((left, right) => {
          const exact = (release: TVRelease) =>
            release.metadata.season === episode.seasonNumber &&
            release.metadata.episode === episode.episodeNumber
              ? 1
              : 0;
          return (
            exact(right) - exact(left) ||
            (right.metadata.broadcasters ?? 0) - (left.metadata.broadcasters ?? 0)
          );
        })
        .slice(0, 2);
      for (const candidate of metadataCandidates) {
        try {
          const source =
            (await this.movieSourceRepository.findById(candidate.source.id)) ?? candidate.source;
          let torrentFile = source.file;
          if (!torrentFile && source.magnetLink) {
            torrentFile =
              (await this.magnetService.getPlaybackTorrentMetadataFile(
                source.magnetLink,
                source.hash
              )) ?? undefined;
          }
          if (!torrentFile) continue;

          const parsed = await parseTorrent(torrentFile);
          if (parsed.infoHash?.toLowerCase() !== source.hash.toLowerCase()) {
            logger.warn(
              'SourceService',
              `Ignoring torrent metadata with a mismatched hash for TV source ${source.id}`
            );
            continue;
          }
          const files = (parsed.files ?? []).map(file => file.path).filter(Boolean);
          if (!source.file) {
            await this.movieSourceRepository.updateSourceFile(source.id, torrentFile);
            source.file = torrentFile;
          }
          candidate.source = source;
          candidate.metadata.files = files;
        } catch (error) {
          logger.warn(
            'SourceService',
            `Unable to resolve torrent files for TV source ${candidate.source.id}`,
            error
          );
        }
      }
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
    if (associations.length && episode.showMediaId && episode.showTitle) {
      try {
        await this.notifications?.episodeAvailable({
          showMediaId: episode.showMediaId,
          showTitle: episode.showTitle,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: episode.airDate ?? null,
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

  private async getTVReleases(imdbId: string): Promise<TVRelease[]> {
    const cached = this.tvReleaseSearches.get(imdbId);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;

    const promise = (async () => {
      const result = await this.contentDirectoryService.searchSourcesForTVShow(imdbId, true);
      if (!result?.sources.length) return [];
      const releases: TVRelease[] = [];
      for (const metadata of result.sources) {
        const row = providerSourcesToEntities([metadata], null, result.source)[0];
        const source = await this.movieSourceRepository.createTorrentSource(row);
        releases.push({ metadata, source });
        this.backgroundJobs?.enqueueBestEffort({
          type: 'source.stats',
          dedupeKey: String(source.id),
          payload: { sourceId: source.id },
          options: { priority: 20 },
        });
      }
      return releases;
    })();
    const cache = { expiresAt: Date.now() + 5 * 60_000, promise };
    this.tvReleaseSearches.set(imdbId, cache);
    try {
      return await promise;
    } catch (error) {
      if (this.tvReleaseSearches.get(imdbId) === cache)
        this.tvReleaseSearches.set(imdbId, {
          expiresAt: Date.now() + 30_000,
          promise: Promise.resolve([]),
        });
      throw error;
    }
  }

  public async seedSourceDiscoveryJobs(limit = 25): Promise<void> {
    const movies = await this.movieRepository.findMoviesPendingSourceSearch(limit);
    await this.backgroundJobs?.enqueueBulk(
      movies.map(movie => ({
        type: 'source.discover',
        dedupeKey: String(movie.id),
        payload: { movieId: movie.id },
        options: { priority: 20 },
      }))
    );
  }

  public async seedSourceMetadataJobs(): Promise<void> {
    const sources = await this.movieSourceRepository.getNextSourcesToProcess(
      Math.max(2, this.magnetService.getAvailableConcurrency())
    );
    await this.backgroundJobs?.enqueueBulk(
      sources.map(source => ({
        type: 'source.metadata',
        dedupeKey: String(source.id),
        payload: { sourceId: source.id },
        options: { priority: 40 },
      }))
    );
  }

  public async seedSourceStatsJobs(limit = 25): Promise<void> {
    const sources = await this.movieSourceRepository.findSourceThatNeedsStatsUpdate(limit);
    await this.backgroundJobs?.enqueueBulk(
      sources.map(source => ({
        type: 'source.stats',
        dedupeKey: String(source.id),
        payload: { sourceId: source.id },
        options: { priority: 20 },
      }))
    );
  }

  public async processSourceMetadata(sourceId: number): Promise<void> {
    const source = await this.movieSourceRepository.findById(sourceId);
    if (!source?.file) {
      if (!source) return;
      await this.downloadSourceFileForSource(source as unknown as SourceProcessingResult);
      const updated = await this.movieSourceRepository.findById(sourceId);
      if (!updated?.file) throw new Error('Source metadata could not be resolved');
    }
  }

  public async processSourceStats(sourceId: number): Promise<Date> {
    const source = await this.movieSourceRepository.findById(sourceId);
    if (!source) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const { broadcasters, watchers } = await this.magnetService.getStats(source.hash);
    const nextCheckTime = scheduleNextCheck(
      source.lastStatsCheck && source.nextStatsCheckAt
        ? source.nextStatsCheckAt.getTime() - source.lastStatsCheck.getTime()
        : undefined,
      { old: source.broadcasters ?? 0, new: broadcasters },
      { old: source.watchers ?? 0, new: watchers }
    );
    await this.movieSourceRepository.updateStats(source.id, broadcasters, watchers, nextCheckTime);
    return nextCheckTime;
  }

  /**
   * Find all sources for a specific movie
   */
  @traced('SourceService')
  public async getSourcesForMovie(movieId: number): Promise<MovieSource[]> {
    return this.movieSourceRepository.findByMovieId(movieId);
  }

  /**
   * Search for sources for a specific movie with timeout (for on-demand requests)
   * If the movie has no sources and hasn't been searched yet, search immediately
   * Returns sources within timeout, but continues search in background if needed
   */
  public async getSourcesForMovieWithOnDemandSearch(
    movie: {
      id: number;
      imdbId: string | null;
      title: string;
      contentDirectoriesSearched: string[];
    },
    timeoutMs: number = 1200
  ): Promise<MovieSource[]> {
    // First check if we already have sources
    const existingSources = await this.getSourcesForMovie(movie.id);
    if (existingSources.length > 0) {
      return existingSources;
    }

    // ImdbId is required for searching sources
    if (movie.imdbId) {
      logger.info(
        'SourceService',
        `On-demand source search triggered for movie ${movie.id} (${movie.title})`
      );
      let status: 'pending' | 'success' | 'timeout' = 'pending';
      const searchPromise = (async () => {
        const sources = await this.searchSourcesForMovie(movie, true);
        if (sources) {
          if (status === 'pending') {
            status = 'success';
          } else {
            logger.debug(
              'SourceService',
              `Background search completed for movie ${movie.id} (${movie.title})`
            );
          }
          return sources.sources;
        }
        return [];
      })();
      this.pendingOnDemandSearches.add(movie.id);
      void searchPromise.then(
        () => this.pendingOnDemandSearches.delete(movie.id),
        () => this.pendingOnDemandSearches.delete(movie.id)
      );
      const timeoutPromise = (async () => {
        await sleep(timeoutMs);
        if (status === 'pending') {
          status = 'timeout';
          logger.debug(
            'SourceService',
            `On-demand search timed out for movie ${movie.id}, continuing in background`
          );
        }
      })();
      try {
        // Wait for search with timeout
        return (await Promise.race([searchPromise, timeoutPromise])) || [];
      } catch (error) {
        logger.error('SourceService', `On-demand search failed for movie ${movie.id}:`, error);
      }
    }

    // Movie has been searched but no sources found, or no IMDb ID
    return [];
  }

  /** Whether an on-demand source search is still running after its caller timed out. */
  public isOnDemandSearchPending(movieId: number): boolean {
    return this.pendingOnDemandSearches.has(movieId);
  }

  /**
   * Find all sources with source metadata files for a specific movie
   */
  @traced('SourceService')
  public async getSourcesWithFilesForMovie(movieId: number): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.findByMovieId(movieId);
    return sources.filter(source => source.file !== null);
  }

  @traced('SourceService')
  public async syncStatsForSources(): Promise<void> {
    await this.startPromise;

    if (!this.vpnConnected) {
      logger.warn('SourceService', `VPN is not connected, skipping stats sync`);
      await sleep(5000);
      return;
    }

    const sourcesToUpdate = await this.movieSourceRepository.findSourceThatNeedsStatsUpdate(5);
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

          await this.movieSourceRepository.updateStats(
            source.id,
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
   * Find and download data files for sources that don't have them yet
   * This method prioritizes by movie popularity and ensures fair distribution
   */
  @traced('SourceService')
  public async syncMissingSourceFiles(): Promise<void> {
    await this.startPromise;

    if (!this.magnetService.isEnabled()) {
      adaptiveLog('SourceService', 'Background source metadata resolution is disabled');
      return;
    }

    if (!this.vpnConnected && this.searchOnlyBehindVpn) {
      logger.warn('SourceService', 'VPN is not connected, skipping data file search');
      await sleep(2000);
      return;
    }

    // 1. Find movies without sources ordered by popularity
    // 2. Count how many sources each movie has
    // 3. Prioritize by movie popularity and ensure fair distribution
    // 4. Get a group of 50 sources that need data files

    const batchSize = Math.max(2, this.magnetService.getAvailableConcurrency());
    const sourcesToProcess = await this.movieSourceRepository.getNextSourcesToProcess(batchSize);

    // Early exit if no movies need processing - avoid log spam with exponential backoff
    if (sourcesToProcess.length === 0) {
      adaptiveLog('SourceService', 'No sources requiring source files found');
      return;
    }

    if (this.backgroundJobs) {
      for (const source of sourcesToProcess) {
        await this.backgroundJobs.enqueue('source.metadata', String(source.id), {
          sourceId: source.id,
        });
      }
      return;
    }

    logger.debug('SourceService', 'Searching source files for sources without them');

    const processSource = async (source: SourceProcessingResult) => {
      logger.debug(
        'SourceService',
        `Processing source ${source.id} with quality ${source.quality}`
      );
      await this.downloadSourceFileForSource(source);
      const potentialNextSource = sourcesToProcess[0];
      if (
        potentialNextSource &&
        ((potentialNextSource.url && this.canMakeSourceRequest(potentialNextSource.source)) ||
          this.magnetService.isIdle())
      ) {
        // If the magnet service is idle, we can process the next batch
        const nextSource = sourcesToProcess.shift();
        if (nextSource) {
          processSource(nextSource);
        }
      }
    };

    await Promise.all(sourcesToProcess.splice(0, batchSize).map(processSource));
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
      let file: Buffer | null = null;

      if (source.url && this.canMakeSourceRequest(source.source)) {
        file = await this.downloadSourceMetadataFileFromUrl(source.url, source.source);

        if (file) {
          logger.debug(
            'SourceService',
            `Successfully downloaded source file via direct URL for source ${source.id}`
          );
        } else {
          logger.debug(
            'SourceService',
            `Direct URL download failed for source ${source.id}, falling back to magnet service`
          );
        }
      } else if (source.url) {
        logger.debug(
          'SourceService',
          `Rate limit reached for ${source.source}, using magnet service for source ${source.id}`
        );
      }

      // Fall back to magnet service if direct download failed or wasn't available
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

      // Save the source file to the database
      await this.movieSourceRepository.updateSourceFile(source.id, file);

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

  /**
   * Get or create a rate limiter for a specific source
   */
  private getSourceRateLimiter(source: string): RateLimiter {
    if (!this.sourceRateLimiters.has(source)) {
      // Set rate limits per source (requests per second)
      const rateLimit = source === 'YTS' ? 0.5 : 0.2; // YTS: 30 req/min, others: 12 req/min
      this.sourceRateLimiters.set(source, new RateLimiter(rateLimit, `SourceService:${source}`));
    }
    return this.sourceRateLimiters.get(source)!;
  }

  /**
   * Check if we can make a request to a source without rate limiting
   */
  private canMakeSourceRequest(source: string): boolean {
    const rateLimiter = this.getSourceRateLimiter(source);
    return !rateLimiter.shouldReject();
  }

  /**
   * Download source file from direct URL
   */
  private async downloadSourceMetadataFileFromUrl(
    url: string,
    source: string
  ): Promise<Buffer | null> {
    try {
      logger.debug('SourceService', `Downloading from URL (source: ${source})`);

      // Throttle the request
      const rateLimiter = this.getSourceRateLimiter(source);
      await rateLimiter.throttle();

      const response = await this.requestService.request(url, {
        asBuffer: true,
      });

      const validation = validateContentFileResponse(response);
      if (!validation.isValid) {
        logger.warn('SourceService', `Download validation failed: ${validation.error}`);
        return null;
      }

      // Convert response body to Buffer
      if (response.body instanceof ArrayBuffer) {
        return Buffer.from(response.body);
      }
      if (typeof response.body === 'string') {
        return Buffer.from(response.body, 'binary');
      }
      throw new SourceError('Invalid response body', 'invalid_response_body');
    } catch (error) {
      logger.error('SourceService', `Error downloading from URL: ${url}`, error);
      return null;
    }
  }
}
