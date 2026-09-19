import { SYNC_STATE_MOVIES, SYNC_STATE_TV_SHOWS } from '../db/catalog-db.types';
import { MovieRepository } from '../db/movie.repo';
import { SyncStateRepository } from '../db/sync-state.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { logger } from '../logger';
import type { CatalogProvider, ProviderChangesPage } from '../provider/provider';

const SCOPE = 'CatalogSynchronizer';
const oneHourMs = 36e5;
const dayMs = 24 * oneHourMs;
/** Provider rate-limit courtesy between change-feed pages (port of the backend sync). */
const PAGE_SLEEP_MS = 1000;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Runs background catalog change feeds and episode synchronization. */
export class CatalogSynchronizer {
  constructor(
    private readonly movies: MovieRepository,
    private readonly tvShows: TVShowRepository,
    private readonly syncState: SyncStateRepository,
    private readonly provider: CatalogProvider,
    private readonly episodeSyncMode: 'GREEDY' | 'ON_DEMAND'
  ) {}

  async syncMovies(): Promise<void> {
    await this.runChangeSync(
      SYNC_STATE_MOVIES,
      () => this.movies.hasKnownMovies(),
      (start, end) => this.provider.changedMovies(start, end),
      async mediaId => {
        const movie = await this.provider.getMovie(mediaId);
        if (movie) this.movies.upsertMovie(movie);
      }
    );
  }

  async syncTVShows(): Promise<void> {
    await this.runChangeSync(
      SYNC_STATE_TV_SHOWS,
      () => this.tvShows.hasKnownTVShows(),
      (start, end) => this.provider.changedTVShows(start, end),
      async mediaId => {
        const show = await this.provider.getTVShow(mediaId);
        if (show) {
          this.tvShows.upsertTVShow(show);
          await this.syncSeasonOpenings(mediaId);
        }
      }
    );
  }

  /** Re-opens or creates seasons the provider reports as changed. */
  private async syncSeasonOpenings(tvMediaId: number): Promise<void> {
    for (const seasonNumber of await this.provider.seasonChanges(tvMediaId)) {
      const existing = this.tvShows.getSeasonRow(tvMediaId, seasonNumber);
      if (existing) {
        this.tvShows.markSeasonUnsynced(tvMediaId, seasonNumber);
      } else {
        const season = await this.provider.getSeason(tvMediaId, seasonNumber);
        if (season) this.tvShows.upsertSeasonWithEpisodes(season);
      }
    }
  }

  async syncIncompleteSeasons(): Promise<void> {
    const watchingOnly = this.episodeSyncMode !== 'GREEDY';
    const incomplete = this.tvShows.findIncompleteSeason(watchingOnly);
    if (!incomplete) return;
    const season = await this.provider.getSeason(incomplete.tv_media_id, incomplete.season_number);
    if (!season) {
      logger.warn(
        SCOPE,
        `Incomplete season ${incomplete.season_number} of show ${incomplete.tv_media_id} not found upstream`
      );
      return;
    }
    this.tvShows.upsertSeasonWithEpisodes(season);
  }

  private async runChangeSync(
    syncName: string,
    hasKnownMedia: () => boolean,
    changes: (start: Date, end: Date) => AsyncGenerator<ProviderChangesPage>,
    refresh: (mediaId: number) => Promise<void>
  ): Promise<void> {
    const now = new Date();
    if (!hasKnownMedia()) {
      this.syncState.setLastSync(syncName, now);
      logger.debug(SCOPE, `No known ${syncName} media. Advancing the sync watermark.`);
      return;
    }

    const chunks = this.buildSyncChunks(this.syncState.getLastSync(syncName), now);
    if (chunks.length === 0) {
      logger.debug(SCOPE, `Last ${syncName} sync was less than 1 hour ago. Skipping.`);
      return;
    }

    for (const [index, chunk] of chunks.entries()) {
      for await (const page of changes(chunk.start, chunk.end)) {
        logger.debug(
          SCOPE,
          `${syncName} sync chunk ${index + 1}/${chunks.length} - page ${page.page}/${page.totalPages}`
        );
        const known =
          syncName === SYNC_STATE_MOVIES
            ? this.movies.knownMovieIds(page.items)
            : this.tvShows.knownTVShowIds(page.items);
        // The change feed covers the whole catalog; only locally-known media needs refreshing.
        for (const mediaId of page.items) {
          if (!known.has(mediaId)) continue;
          try {
            await refresh(mediaId);
          } catch (error) {
            logger.error(SCOPE, `Error refreshing ${syncName} media ${mediaId}:`, error);
          }
        }
        await sleep(PAGE_SLEEP_MS);
      }
      this.syncState.setLastSync(syncName, chunk.watermark);
    }
  }

  /**
   * Day-chunked sync windows with a 1 hour minimum interval and a 14 day backstop
   * (port of the backend's syncMovies/syncTVShows chunking).
   */
  private buildSyncChunks(
    lastSync: Date | null,
    now: Date
  ): Array<{ start: Date; end: Date; watermark: Date }> {
    const earliest = lastSync ?? new Date(now.getTime() - dayMs);
    if (now.getTime() - earliest.getTime() < oneHourMs) return [];

    const backstop = new Date(now.getTime() - 14 * dayMs);
    const start = new Date(Math.max(earliest.getTime(), backstop.getTime()));
    start.setUTCHours(0, 0, 0, 0);

    const chunks: Array<{ start: Date; end: Date; watermark: Date }> = [];
    let cursor = new Date(start.getTime());
    while (cursor.getTime() < now.getTime()) {
      const nextMidnight = new Date(cursor.getTime() + dayMs);
      const isLast = nextMidnight.getTime() >= now.getTime();
      chunks.push({
        start: new Date(cursor.getTime()),
        end: isLast ? new Date(now.getTime()) : new Date(nextMidnight.getTime() - 1_000),
        watermark: isLast ? new Date(now.getTime()) : new Date(nextMidnight.getTime() + 60_000),
      });
      cursor = nextMidnight;
    }
    return chunks;
  }
}
