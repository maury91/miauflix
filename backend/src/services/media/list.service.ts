import { logger } from "@logger";

import type { MediaList } from "@entities/list.entity";
import { Movie } from "@entities/movie.entity";
import { TVShow } from "@entities/tvshow.entity";
import type { Database } from "@database/database";
import type { MediaListRepository } from "@repositories/mediaList.repository";
import type { TMDBApi } from "@services/tmdb/tmdb.api";
import type { MediaSummaryList } from "@services/tmdb/tmdb.types";

import type { MediaService } from "./media.service";
import type { TranslatedMedia } from "./media.types";

export class ListService {
  private readonly lists: Record<
    string,
    {
      name: string;
      source: (page?: number) => Promise<MediaSummaryList>;
      slug: string;
      description: string;
    }
  >;
  private readonly mediaListRepository: MediaListRepository;

  constructor(
    db: Database,
    private readonly tmdbApi: TMDBApi,
    private readonly mediaService: MediaService,
  ) {
    this.lists = {
      "@@tmdb_movies_popular": {
        name: "Popular Movies",
        source: this.tmdbApi.getPopularMovies.bind(this.tmdbApi),
        slug: "@@tmdb_movies_popular",
        description: "List of popular movies from TMDB",
      },
      "@@tmdb_movies_top-rated": {
        name: "Top Rated Movies",
        source: this.tmdbApi.getTopRatedMovies.bind(this.tmdbApi),
        slug: "@@tmdb_movies_top-rated",
        description: "List of top rated movies from TMDB",
      },
      // "@@tmdb_shows_popular": {
      //   name: "Popular TV Shows",
      //   source: this.tmdbApi.getPopularShows.bind(this.tmdbApi),
      //   slug: "@@tmdb_shows_popular",
      //   description: "List of popular TV shows from TMDB",
      // },
    };
    this.mediaListRepository = db.getMediaListRepository();
  }

  async getListContentFromApi(
    slug: string,
    page: number,
  ): Promise<{ medias: (Movie | TVShow)[]; pages: number; total: number }> {
    if (!this.lists[slug]) {
      throw new Error(`List with slug ${slug} not found`);
    }
    const list = this.lists[slug];
    const { totalPages, totalItems, items: medias } = await list.source(page);

    logger.debug(
      "ListService",
      `List ${slug} has ${totalItems} results and ${totalPages} pages, obtained page ${page}`,
    );

    return {
      medias: await Promise.all(
        medias.map(async (mediaData) => {
          if (mediaData._type === "movie") {
            return this.mediaService.getMovie(mediaData.id, mediaData);
          }
          return this.mediaService.getTVShow(mediaData.id);
        }),
      ),
      pages: totalPages,
      total: totalItems,
    };
  }

  private async getOrCreateList(
    slug: string,
    preload: boolean,
  ): Promise<MediaList> {
    let mediaList = await this.mediaListRepository.findBySlug(slug, preload);
    if (!mediaList) {
      if (this.lists[slug]) {
        const list = this.lists[slug];
        mediaList = await this.mediaListRepository.createMediaList(
          list.name,
          list.description,
          slug,
        );
      } else {
        throw new Error(`List with slug ${slug} not found`);
      }
    }
    return mediaList;
  }

  async updateListContent(
    slug: string,
    medias: (Movie | TVShow)[],
  ): Promise<MediaList> {
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

  async getListBySlug(slug: string): Promise<MediaList> {
    const mediaList = await this.getOrCreateList(slug, true);

    if (mediaList.movies.length + mediaList.tvShows.length === 0) {
      const { medias } = await this.getListContentFromApi(slug, 1);
      return await this.updateListContent(slug, medias);
    }
    return mediaList;
  }

  async getListContent(
    slug: string,
    language = "en",
  ): Promise<TranslatedMedia[]> {
    const mediaList = await this.getListBySlug(slug);
    if (!mediaList.movies) {
      console.log(mediaList);
    }

    const medias = await this.mediaService.mediasWithLanguage(
      [...mediaList.movies, ...mediaList.tvShows],
      language,
    );

    return medias.sort((a, b) => b.popularity - a.popularity);
  }

  async getLists() {
    return Object.entries(this.lists).map(([slug, list]) => ({
      slug,
      name: list.name,
      description: list.description,
    }));
  }
}
