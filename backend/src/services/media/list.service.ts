import { logger } from '@logger';

import type { Database } from '@database/database';
import type { MediaList } from '@entities/list.entity';
import { Movie } from '@entities/movie.entity';
import { TVShow } from '@entities/tvshow.entity';
import { MediaError } from '@errors/media.errors';
import type { MediaListRepository } from '@repositories/mediaList.repository';
import type { TmdbService } from '@services/content-catalog/tmdb/tmdb.service';
import { traced } from '@utils/tracing.util';

import type { MediaService } from './media.service';
import type { TranslatedMedia } from './media.types';

const LISTS: Record<string, { name: string; slug: string; description: string }> = {
  '@@tmdb_movies_popular': {
    name: 'Popular Movies',
    slug: '@@tmdb_movies_popular',
    description: 'List of popular movies from TMDB',
  },
  '@@tmdb_movies_top-rated': {
    name: 'Top Rated Movies',
    slug: '@@tmdb_movies_top-rated',
    description: 'List of top rated movies from TMDB',
  },
  '@@tmdb_shows_popular': {
    name: 'Popular TV Shows',
    slug: '@@tmdb_shows_popular',
    description: 'List of popular TV shows from TMDB',
  },
};

export class ListService {
  private readonly mediaListRepository: MediaListRepository;

  constructor(
    private readonly db: Database,
    private readonly tmdbService: TmdbService,
    private readonly mediaService: MediaService
  ) {
    this.mediaListRepository = db.getMediaListRepository();
  }

  @traced('ListService')
  async getListContentFromApi(
    slug: string,
    page: number
  ): Promise<{ medias: (Movie | TVShow)[]; pages: number; total: number }> {
    if (!LISTS[slug]) {
      throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
    }
    const {
      totalPages,
      totalItems,
      items: medias,
    } = await this.tmdbService.getListSource(slug, page);

    logger.debug(
      'ListService',
      `List ${slug} has ${totalItems} results and ${totalPages} pages, obtained page ${page}`
    );

    const mediaResults = await Promise.all(
      medias.map(async mediaData => {
        if (mediaData._type === 'movie') {
          return this.mediaService.getMovieByTmdbId(mediaData.id, mediaData);
        }
        return this.mediaService.getTVShowByTmdbId(mediaData.id, mediaData);
      })
    );

    return {
      medias: mediaResults.filter((media): media is Movie | TVShow => media !== null),
      pages: totalPages,
      total: totalItems,
    };
  }

  private async getOrCreateList(slug: string, preload: boolean): Promise<MediaList> {
    let mediaList = await this.mediaListRepository.findBySlug(slug, preload);
    if (!mediaList) {
      const list = LISTS[slug];
      if (list) {
        mediaList = await this.mediaListRepository.createMediaList(
          list.name,
          list.description,
          slug
        );
      } else {
        throw new MediaError(`List with slug ${slug} not found`, 'list_not_found');
      }
    }
    return mediaList;
  }

  @traced('ListService')
  async updateListContent(slug: string, medias: (Movie | TVShow)[]): Promise<MediaList> {
    const mediaList = await this.getOrCreateList(slug, false);

    mediaList.movies = [];
    mediaList.tvShows = [];

    for (const media of medias) {
      if (media instanceof Movie) {
        mediaList.movies.push(media);
      }
      if (media instanceof TVShow) {
        mediaList.tvShows.push(media);
      }
    }

    return await this.mediaListRepository.saveMediaList(mediaList);
  }

  @traced('ListService')
  async getListBySlug(slug: string): Promise<MediaList> {
    const mediaList = await this.getOrCreateList(slug, true);

    if (mediaList.movies.length + mediaList.tvShows.length === 0) {
      const { medias } = await this.getListContentFromApi(slug, 1);
      return await this.updateListContent(slug, medias);
    }
    return mediaList;
  }

  @traced('ListService')
  async getListContent(slug: string, language = 'en'): Promise<TranslatedMedia[]> {
    const mediaList = await this.getListBySlug(slug);
    if (mediaList.slug !== slug) {
      throw new MediaError(
        `List slug mismatch: requested ${slug}, got list with slug ${mediaList.slug}`,
        'list_not_found'
      );
    }
    if (!mediaList.movies) {
      console.log(mediaList);
    }

    const medias = await this.mediaService.mediasWithLanguage(
      [...mediaList.movies, ...mediaList.tvShows],
      language
    );

    return medias.sort((a, b) => b.popularity - a.popularity);
  }

  @traced('ListService')
  async getLists() {
    return Object.entries(LISTS).map(([slug, list]) => ({
      slug,
      name: list.name,
      description: list.description,
    }));
  }
}
