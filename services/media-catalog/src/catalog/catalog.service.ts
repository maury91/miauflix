import { ArtworkRepository } from '../db/artwork.repo';
import { BackdropFocusRepository } from '../db/backdrop-focus.repo';
import { LocalizationRepository } from '../db/localization.repo';
import { MovieRepository } from '../db/movie.repo';
import { SyncStateRepository } from '../db/sync-state.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { HttpError } from '../errors';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import { ArtworkSelectionService, type ArtworkUpdate } from '../services/artwork-selection.service';
import {
  BackdropFocusService,
  DEFAULT_BACKDROP_FOCUS_CONCURRENCY,
} from '../services/backdrop-focus.service';
import type { BatchResponse, MediaRef, MovieDetail, SeasonDetail, TVShowDetail } from '../types';
import type { BackdropFocus, MediaType } from '../types';
import { CatalogHydrator } from './catalog.hydrator';
import { CatalogLocalizer } from './catalog.localizer';
import { CatalogSynchronizer } from './catalog.syncer';

const SCOPE = 'CatalogService';
const BACKDROP_FOCUS_SCAN_PAGE_SIZE = 32;

export interface CatalogValues {
  /** Refresh details older than this (ms). */
  hydrationTtlMs: number;
  /** 'GREEDY' syncs every show's episodes, 'ON_DEMAND' only watching ones. */
  episodeSyncMode: 'GREEDY' | 'ON_DEMAND';
  /** Maximum number of concurrent backdrop image-model calculations. */
  backdropFocusConcurrency: number;
  /** Interval between low-priority database backdrop calculations (ms). */
  backdropFocusBackgroundIntervalMs: number;
}

/**
 * The catalog data plane: storage + freshness + localization over a provider.
 *
 * Every read is *ensured fresh* (repo-first, provider refresh when missing or stale)
 * so the main app's request path can treat this service exactly like the backend
 * used to treat its embedded TMDB service — one call, always-current data.
 */
export class CatalogService {
  private readonly hydrator: CatalogHydrator;
  private readonly localizer: CatalogLocalizer;
  private readonly synchronizer: CatalogSynchronizer;
  private readonly backdropFocusService: BackdropFocusService;
  private backdropFocusBackgroundTimer: ReturnType<typeof setInterval> | undefined;
  private artworkBackgroundTimer: ReturnType<typeof setInterval> | undefined;
  private backdropFocusScanOffset = 0;
  private movieArtworkScanOffset = 0;
  private tvArtworkScanOffset = 0;
  private readonly artworkMetadataRetry = new Map<string, number>();
  private readonly artworkService?: ArtworkSelectionService;

  constructor(
    private readonly movies: MovieRepository,
    private readonly tvShows: TVShowRepository,
    private readonly localization: LocalizationRepository,
    private readonly syncState: SyncStateRepository,
    private readonly provider: CatalogProvider,
    private readonly values: CatalogValues,
    backdropFocusRepository: BackdropFocusRepository,
    artworkRepository?: ArtworkRepository
  ) {
    this.hydrator = new CatalogHydrator(
      this.movies,
      this.tvShows,
      this.provider,
      this.values.hydrationTtlMs
    );
    this.localizer = new CatalogLocalizer(
      this.localization,
      this.tvShows,
      this.provider,
      backdropFocusRepository,
      artworkRepository
    );
    this.backdropFocusService = new BackdropFocusService(
      backdropFocusRepository,
      undefined,
      this.values.backdropFocusConcurrency ?? DEFAULT_BACKDROP_FOCUS_CONCURRENCY
    );
    if (artworkRepository) {
      this.artworkService = new ArtworkSelectionService(artworkRepository, this.provider);
    }
    this.synchronizer = new CatalogSynchronizer(
      this.movies,
      this.tvShows,
      this.syncState,
      this.provider,
      this.values.episodeSyncMode
    );
  }

  /* -------------------------------------------------------------------- movies */

  async getMovie(
    mediaId: number,
    language: string,
    artworkPriority = 60_000
  ): Promise<MovieDetail> {
    await this.hydrator.ensureMovieFresh(mediaId);
    const row = this.movies.getMovie(mediaId);
    if (!row) throw new HttpError(404, `Movie ${mediaId} not found`);
    this.artworkService?.enqueue({
      ref: { mediaType: 'movie', mediaId },
      row,
      priority: artworkPriority,
    });
    return this.localizer.localizeMovie(row, language);
  }

  /* ------------------------------------------------------------------ tv shows */

  async getTVShow(
    mediaId: number,
    language: string,
    artworkPriority = 60_000
  ): Promise<TVShowDetail> {
    await this.hydrator.ensureTVShowFresh(mediaId);
    const row = this.tvShows.getTVShow(mediaId);
    if (!row) throw new HttpError(404, `TV show ${mediaId} not found`);
    this.artworkService?.enqueue({
      ref: { mediaType: 'tv', mediaId },
      row,
      priority: artworkPriority,
    });
    return this.localizer.localizeTVShow(row, language);
  }

  /* ------------------------------------------------------------------- seasons */

  async getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language: string
  ): Promise<SeasonDetail> {
    await this.hydrator.ensureTVShowFresh(tvMediaId);
    const entry = await this.hydrator.ensureSeasonFresh(tvMediaId, seasonNumber);
    return this.localizer.localizeSeason(entry.season, entry.episodes, language);
  }

  /* --------------------------------------------------------------------- batch */

  async batch(
    items: MediaRef[],
    language: string,
    artworkPriority: 'returned' | 'background' | 'prefetch' = 'returned'
  ): Promise<BatchResponse> {
    const priority =
      artworkPriority === 'returned' ? 60_000 : artworkPriority === 'prefetch' ? 40_000 : 0;
    const resolved = await Promise.all(
      items.map(async (ref, index) => {
        try {
          const detail =
            ref.mediaType === 'movie'
              ? await this.getMovie(ref.mediaId, language, priority + items.length - index)
              : await this.getTVShow(ref.mediaId, language, priority + items.length - index);
          return { detail };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) return { ref };
          logger.error(SCOPE, `Batch item failed for ${ref.mediaType} ${ref.mediaId}`, error);
          return {
            error: { ref, message: 'catalog_batch_item_failed' },
          };
        }
      })
    );
    return {
      items: resolved.flatMap(entry => (entry.detail ? [entry.detail] : [])),
      missing: resolved.flatMap(entry => (entry.ref ? [entry.ref] : [])),
      errors: resolved.flatMap(entry =>
        entry.error ? [{ ref: entry.error.ref, error: entry.error.message }] : []
      ),
    };
  }

  queueArtwork(
    items: MediaRef[],
    priority: 'focused' | 'visible' | 'returned' | 'prefetch'
  ): number {
    if (!this.artworkService) return 0;
    const value =
      priority === 'focused'
        ? 100_000
        : priority === 'visible'
          ? 80_000
          : priority === 'returned'
            ? 60_000
            : 40_000;
    let accepted = 0;
    for (const item of items) {
      const row =
        item.mediaType === 'movie'
          ? this.movies.getMovie(item.mediaId)
          : this.tvShows.getTVShow(item.mediaId);
      if (!row) continue;
      this.artworkService.enqueue({ ref: item, row, priority: value });
      accepted++;
    }
    return accepted;
  }

  artworkSnapshot(items: MediaRef[]): ArtworkUpdate[] {
    return this.artworkService?.snapshot(items) ?? [];
  }

  onArtworkUpdate(listener: (update: ArtworkUpdate) => void): () => void {
    return this.artworkService?.subscribe(listener) ?? (() => undefined);
  }

  async resolveExternal(ref: {
    mediaType: 'movie' | 'tv';
    ids: { imdb?: string };
  }): Promise<MediaRef | null> {
    const mediaId = await this.provider.resolveExternal(ref);
    return mediaId === null ? null : { mediaType: ref.mediaType, mediaId };
  }

  /* -------------------------------------------------------------------- genres */

  async getGenres(language: string): Promise<Array<{ id: number; name: string }>> {
    const cached = this.localization.getCachedGenres(language);
    if (cached) return cached;
    const genres = await this.provider.getGenres(language);
    this.localization.upsertGenres(genres, language);
    return genres;
  }

  /**
   * Returns cached or newly computed normalized backdrop focus for an already stored media ID.
   * Does not hydrate missing media. Throws HttpError 404 for a missing row or 422 for an
   * unsupported backdrop; database, retry-delay, download, and analysis errors propagate.
   */
  async ensureBackdropFocus(mediaType: MediaType, mediaId: number): Promise<BackdropFocus> {
    const row =
      mediaType === 'movie' ? this.movies.getMovie(mediaId) : this.tvShows.getTVShow(mediaId);
    if (!row) throw new HttpError(404, `${mediaType} ${mediaId} not found`);
    const source = this.provider.getBackdropAnalysisSource(row.backdrop);
    if (!source) throw new HttpError(422, 'backdrop_not_available');
    return this.backdropFocusService.ensure(source, this.provider.name);
  }

  /** Enqueues displayed-list work without delaying the frontend request path. */
  enqueueBackdropFocus(items: MediaRef[]): number {
    let accepted = 0;
    for (const item of items) {
      const row =
        item.mediaType === 'movie'
          ? this.movies.getMovie(item.mediaId)
          : this.tvShows.getTVShow(item.mediaId);
      if (!row) continue;
      const source = this.provider.getBackdropAnalysisSource(row.backdrop);
      if (
        source &&
        this.backdropFocusService.enqueueBackground(source, this.provider.name, 'displayed')
      )
        accepted++;
    }
    return accepted;
  }

  startBackdropFocusBackground(): void {
    if (this.backdropFocusBackgroundTimer) return;
    this.artworkService?.start();
    this.backdropFocusBackgroundTimer = setInterval(() => {
      this.enqueueNextDatabaseBackdropFocus();
    }, this.values.backdropFocusBackgroundIntervalMs);
    this.artworkBackgroundTimer = setInterval(() => {
      void this.enqueueNextDatabaseArtwork();
    }, this.values.backdropFocusBackgroundIntervalMs);
    void this.enqueueNextDatabaseArtwork();
  }

  stopBackdropFocusBackground(): void {
    if (!this.backdropFocusBackgroundTimer) return;
    clearInterval(this.backdropFocusBackgroundTimer);
    this.backdropFocusBackgroundTimer = undefined;
    if (this.artworkBackgroundTimer) clearInterval(this.artworkBackgroundTimer);
    this.artworkBackgroundTimer = undefined;
  }

  async stopArtworkBackground(): Promise<void> {
    this.stopBackdropFocusBackground();
    await this.artworkService?.stop();
  }

  private async enqueueNextDatabaseArtwork(): Promise<void> {
    const pageSize = 32;
    const movies = this.movies.getArtworkCandidates(pageSize, this.movieArtworkScanOffset);
    const shows = this.tvShows.getArtworkCandidates(pageSize, this.tvArtworkScanOffset);
    if (!movies.length && !shows.length) {
      this.movieArtworkScanOffset = 0;
      this.tvArtworkScanOffset = 0;
      return;
    }
    this.movieArtworkScanOffset += pageSize;
    this.tvArtworkScanOffset += pageSize;
    for (const movie of movies) {
      if (movie.logoCandidates === null) {
        await this.refreshArtworkMetadata('movie', movie.mediaId);
        continue;
      }
      const row = this.movies.getMovie(movie.mediaId);
      if (row)
        this.artworkService?.enqueue({
          ref: { mediaType: 'movie', mediaId: movie.mediaId },
          row,
          priority: 0,
        });
    }
    for (const show of shows) {
      if (show.logoCandidates === null) {
        await this.refreshArtworkMetadata('tv', show.mediaId);
        continue;
      }
      const row = this.tvShows.getTVShow(show.mediaId);
      if (row)
        this.artworkService?.enqueue({
          ref: { mediaType: 'tv', mediaId: show.mediaId },
          row,
          priority: show.watching ? 20_000 : 0,
        });
    }
  }

  private async refreshArtworkMetadata(
    mediaType: MediaRef['mediaType'],
    mediaId: number
  ): Promise<void> {
    const key = `${mediaType}:${mediaId}`;
    if ((this.artworkMetadataRetry.get(key) ?? 0) > Date.now()) return;
    try {
      if (mediaType === 'movie') {
        const movie = await this.provider.getMovie(mediaId);
        if (movie) this.movies.upsertMovie(movie);
      } else {
        const show = await this.provider.getTVShow(mediaId);
        if (show) this.tvShows.upsertTVShow(show);
      }
      this.artworkMetadataRetry.delete(key);
    } catch (error) {
      this.artworkMetadataRetry.set(key, Date.now() + 60 * 60_000);
      logger.warn(SCOPE, `Artwork metadata refresh failed for ${mediaType} ${mediaId}`, error);
    }
  }

  private enqueueNextDatabaseBackdropFocus(): void {
    if (this.backdropFocusService.hasPendingBackground('database')) return;
    // Advance bounded pages so cached rows in the first page cannot starve later media.
    const offset = this.backdropFocusScanOffset;
    const candidates = [
      ...this.movies
        .getBackdropCandidates(BACKDROP_FOCUS_SCAN_PAGE_SIZE, offset)
        .map(row => ({ mediaType: 'movie' as const, ...row })),
      ...this.tvShows
        .getBackdropCandidates(BACKDROP_FOCUS_SCAN_PAGE_SIZE, offset)
        .map(row => ({ mediaType: 'tv' as const, ...row })),
    ];
    if (candidates.length === 0) {
      this.backdropFocusScanOffset = 0;
      return;
    }
    this.backdropFocusScanOffset += BACKDROP_FOCUS_SCAN_PAGE_SIZE;
    for (const candidate of candidates) {
      const source = this.provider.getBackdropAnalysisSource(candidate.backdrop);
      if (
        source &&
        this.backdropFocusService.enqueueBackground(source, this.provider.name, 'database')
      )
        return;
    }
  }

  /* -------------------------------------------------------------- change syncs */

  async syncMovies(): Promise<void> {
    await this.synchronizer.syncMovies();
  }

  async syncTVShows(): Promise<void> {
    await this.synchronizer.syncTVShows();
  }

  async syncIncompleteSeasons(tvMediaId?: number): Promise<void> {
    await this.synchronizer.syncIncompleteSeasons(tvMediaId);
  }
}
