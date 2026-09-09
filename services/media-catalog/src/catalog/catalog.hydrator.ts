import type { EpisodeRow, SeasonRow } from '../db/catalog-db.types';
import { MovieRepository } from '../db/movie.repo';
import { TVShowRepository } from '../db/tv-show.repo';
import { HttpError } from '../errors';
import { logger } from '../logger';
import type { CatalogProvider } from '../provider/provider';
import { SingleFlight } from '../utils/single-flight';

const SCOPE = 'CatalogHydrator';

type SeasonEntry = { season: SeasonRow; episodes: EpisodeRow[] };

/** Ensures persisted catalog rows are hydrated from the configured provider. */
export class CatalogHydrator {
  private readonly singleFlight = new SingleFlight();

  constructor(
    private readonly movies: MovieRepository,
    private readonly tvShows: TVShowRepository,
    private readonly provider: CatalogProvider,
    private readonly hydrationTtlMs: number
  ) {}

  async ensureMovieFresh(mediaId: number): Promise<void> {
    await this.singleFlight.run(`movie:${mediaId}`, async () => {
      const row = this.movies.getMovie(mediaId);
      if (
        row &&
        row.details_synced_at &&
        Date.now() - row.details_synced_at < this.hydrationTtlMs
      ) {
        return;
      }
      try {
        const movie = await this.provider.getMovie(mediaId);
        if (!movie) {
          if (!row) throw new HttpError(404, `Movie ${mediaId} not found`);
          return;
        }
        this.movies.upsertMovie(movie);
      } catch (error) {
        if (row && !(error instanceof HttpError)) {
          logger.warn(SCOPE, `Movie ${mediaId} refresh failed, serving stale data`, error);
          return;
        }
        throw error;
      }
    });
  }

  async ensureTVShowFresh(mediaId: number): Promise<void> {
    await this.singleFlight.run(`tv:${mediaId}`, async () => {
      const row = this.tvShows.getTVShow(mediaId);
      if (
        row &&
        row.details_synced_at &&
        Date.now() - row.details_synced_at < this.hydrationTtlMs
      ) {
        return;
      }
      try {
        const show = await this.provider.getTVShow(mediaId);
        if (!show) {
          if (!row) throw new HttpError(404, `TV show ${mediaId} not found`);
          return;
        }
        this.tvShows.upsertTVShow(show);
      } catch (error) {
        if (row && !(error instanceof HttpError)) {
          logger.warn(SCOPE, `TV show ${mediaId} refresh failed, serving stale data`, error);
          return;
        }
        throw error;
      }
    });
  }

  async ensureSeasonFresh(tvMediaId: number, seasonNumber: number): Promise<SeasonEntry> {
    let entry = this.tvShows.getSeasonWithEpisodes(tvMediaId, seasonNumber);
    if (
      entry?.season.synced &&
      entry.season.episodes_synced_at &&
      Date.now() - entry.season.episodes_synced_at < this.hydrationTtlMs
    ) {
      return entry;
    }
    try {
      const season = await this.provider.getSeason(tvMediaId, seasonNumber);
      if (!season) {
        throw new HttpError(404, `Season ${seasonNumber} of show ${tvMediaId} not found`);
      }
      this.tvShows.upsertSeasonWithEpisodes(season);
    } catch (error) {
      if (entry && !(error instanceof HttpError)) {
        logger.warn(
          SCOPE,
          `Season ${seasonNumber} of show ${tvMediaId} refresh failed, serving stale data`,
          error
        );
        return entry;
      }
      throw error;
    }
    entry = this.tvShows.getSeasonWithEpisodes(tvMediaId, seasonNumber);
    if (!entry) throw new HttpError(404, `Season ${seasonNumber} of show ${tvMediaId} not found`);
    return entry;
  }
}
