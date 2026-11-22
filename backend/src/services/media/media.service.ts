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

import { EpisodeRenumberService } from './episode-renumber.service';
import { MIRROR_LANGUAGE } from './mirror-language';

/**
 * Ensures the local media index holds fresh data for the media the backend works
 * with, mirroring it from the media-catalog service over HTTP. The catalog
 * service enforces freshness on its side; each call returns the local mirror row
 * (with the local id source discovery and streaming key off of).
 */
export class MediaService {
  private readonly movieRepository: MovieRepository;
  private readonly tvShowRepository: TVShowRepository;
  private readonly renumber: EpisodeRenumberService;

  constructor(
    db: Database,
    private readonly catalogClient: CatalogClientService
  ) {
    this.movieRepository = db.getMovieRepository();
    this.tvShowRepository = db.getTVShowRepository();
    this.renumber = new EpisodeRenumberService(db, catalogClient);
  }

  @traced('MediaService')
  public async getMovieById(id: number): Promise<Movie | null> {
    return this.movieRepository.findById(id);
  }

  /** Local mirror lookup only; never contacts the catalog. */
  @traced('MediaService')
  public async getLocalMovieByMediaId(mediaId: number): Promise<Movie | null> {
    return this.movieRepository.findByMediaId(mediaId);
  }

  /**
   * Ensures the catalog has fresh details for the movie, then mirrors it locally. `detail` is in
   * `language`; the mirror always takes the English details (see `withMirrorDetail`).
   */
  @traced('MediaService')
  public async getMovieByMediaId(
    mediaId: number,
    language = MIRROR_LANGUAGE
  ): Promise<{ local: Movie; detail: MovieDetail } | null> {
    const [detail, mirrored] = await this.withMirrorDetail(language, language =>
      this.catalogClient.getMovie(mediaId, language)
    );
    if (!detail) return null;
    const local = await this.movieRepository.upsertMovieDetail(mirrored);
    return { local, detail };
  }

  /**
   * Ensures the catalog has fresh details for the show, then mirrors it locally. When the
   * catalog renumbered the show's seasons (anime numbered by AniList entry), the local episodes
   * and everything stored by episode number move first, so season reads never mix numberings.
   */
  @traced('MediaService')
  public async getTVShowByMediaId(
    mediaId: number,
    language = MIRROR_LANGUAGE
  ): Promise<{ local: TVShow; detail: TVShowDetail } | null> {
    const [detail, mirrored] = await this.withMirrorDetail(language, language =>
      this.catalogClient.getTVShow(mediaId, language)
    );
    if (!detail) return null;
    const local = await this.tvShowRepository.upsertTVShowDetail(mirrored);
    local.seasonLayoutVersion = await this.renumber.reconcile(local, mirrored);
    return { local, detail };
  }

  /**
   * Ensures the catalog has fresh episodes for the season, then mirrors it locally. The season
   * and episode names and overviews returned are in `language`; the mirror keeps English ones.
   */
  @traced('MediaService')
  public async getSeason(
    tvMediaId: number,
    seasonNumber: number,
    language = MIRROR_LANGUAGE
  ): Promise<Season | null> {
    const show = await this.getTVShowByMediaId(tvMediaId, language);
    if (!show) return null;
    const [detail, mirrored] = await this.withMirrorDetail(language, language =>
      this.catalogClient.getSeason(tvMediaId, seasonNumber, language)
    );
    if (!detail) return null;
    const season = await this.tvShowRepository.upsertSeasonDetail(mirrored);
    const local = await this.tvShowRepository.findSeasonByIdWithEpisodes(season.id);
    if (!local || detail === mirrored) return local;
    const translated = new Map(detail.episodes.map(episode => [episode.episodeNumber, episode]));
    return Object.assign(local, {
      name: detail.name,
      overview: detail.overview,
      episodes: local.episodes?.map(episode => {
        const text = translated.get(episode.episodeNumber);
        return text
          ? Object.assign(episode, { name: text.name, overview: text.overview })
          : episode;
      }),
    });
  }

  /**
   * Catalog details in `language`, and the details to mirror: always English, since source
   * search and notifications read the mirror's titles and a server serves profiles in several
   * languages. When the English details can't be had, the ones asked for are mirrored; the next
   * English refresh (source discovery does one first) corrects them.
   */
  private async withMirrorDetail<T>(
    language: string,
    load: (language: string) => Promise<T | null>
  ): Promise<[T | null, T]> {
    if (language === MIRROR_LANGUAGE) {
      const detail = await load(language);
      return [detail, detail as T];
    }
    const [detail, english] = await Promise.all([
      load(language),
      load(MIRROR_LANGUAGE).catch((error: unknown) => {
        logger.warn('MediaService', 'English catalog details unavailable for the mirror', error);
        return null;
      }),
    ]);
    return [detail, (english ?? detail) as T];
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
