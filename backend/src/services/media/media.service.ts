import { logger } from '@logger';

import type { Database } from '@database/database';
import type { Movie } from '@entities/movie.entity';
import type { Season } from '@entities/season.entity';
import type { TVShow } from '@entities/tvshow.entity';
import type { MovieRepository } from '@repositories/movie.repository';
import type { TVShowRepository } from '@repositories/tvshow.repository';
import type { MovieDetail, TVShowDetail } from '@services/catalog/catalog.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';
import { traced } from '@utils/tracing.util';

/**
 * Ensures the local media index holds fresh data for the media the backend works
 * with, mirroring it from the media-catalog service over HTTP. The catalog
 * service enforces freshness on its side; each call returns the local mirror row
 * (with the local id source discovery and streaming key off of).
 */
export class MediaService {
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;

  constructor(
    db: Database,
    private readonly catalogClient: CatalogClientService
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
  }

  @traced('MediaService')
  public async getMovieById(id: number): Promise<Movie | null> {
    return this.movieRepository.findById(id);
  }

  /** Ensures the catalog has fresh details for the movie, then mirrors it locally. */
  @traced('MediaService')
  public async getMovieByMediaId(
    mediaId: number,
    language = 'en'
  ): Promise<{ local: Movie; detail: MovieDetail } | null> {
    const detail = await this.catalogClient.getMovie(mediaId, language);
    if (!detail) return null;
    const local = await this.movieRepository.upsertMovieDetail(detail);
    return { local, detail };
  }

  /** Ensures the catalog has fresh details for the show, then mirrors it locally. */
  @traced('MediaService')
  public async getTVShowByMediaId(
    mediaId: number,
    language = 'en'
  ): Promise<{ local: TVShow; detail: TVShowDetail } | null> {
    const detail = await this.catalogClient.getTVShow(mediaId, language);
    if (!detail) return null;
    const local = await this.tvShowRepository.upsertTVShowDetail(detail);
    return { local, detail };
  }

  /** Ensures the catalog has fresh episodes for the season, then mirrors it locally. */
  @traced('MediaService')
  public async getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language = 'en'
  ): Promise<Season | null> {
    const detail = await this.catalogClient.getSeason(tvMediaId, seasonNumber, language);
    if (!detail) return null;
    const season = await this.tvShowRepository.upsertSeasonDetail(detail);
    return this.tvShowRepository.findSeasonByIdWithEpisodes(season.id);
  }

  @traced('MediaService')
  public async markShowAsWatching(showId: number): Promise<void> {
    await this.tvShowRepository.markAsWatching(showId);
    await this.pushWatchingSet();
  }

  /** Mirrors the local watching set into the catalog (drives ON_DEMAND season sync). */
  public async pushWatchingSet(): Promise<void> {
    try {
      const mediaIds = await this.tvShowRepository.getWatchingTVShowMediaIds();
      await this.catalogClient.setWatching(mediaIds);
    } catch (error) {
      // Best effort: the catalog's watching flag only optimizes episode sync.
      logger.warn('MediaService', 'Unable to push the watching set to the catalog', error);
    }
  }
}
