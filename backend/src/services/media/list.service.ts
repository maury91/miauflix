import { MediaService } from "./media.service";
import { MediaListRepository } from "@repositories/mediaList.repository";
import { MediaList } from "@entities/list.entity";
import { TMDBApi } from "@services/tmdb/tmdb.api";
import { MediaSummaryList } from "@services/tmdb/tmdb.types";
import { Movie } from "@entities/movie.entity";
import { TVShow } from "@entities/tvshow.entity";
import { Database } from "@database/database";

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
    const {
      total_pages,
      total_results,
      results: medias,
    } = await list.source(page);

    console.log(
      `[ListService] List ${slug} has ${total_results} results and ${total_pages} pages, obtained page ${page}`,
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
      pages: total_pages,
      total: total_results,
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

    console.log("saving list");
    return await this.mediaListRepository.saveMediaList(mediaList);
  }

  async getListBySlug(slug: string): Promise<MediaList> {
    const mediaList = await this.getOrCreateList(slug, true);

    if (mediaList.movies.length + mediaList.tvShows.length === 0) {
      console.log("Data is empty, getting more of it");
      const { medias } = await this.getListContentFromApi(slug, 1);
      console.log("Got the data, updating content");
      return await this.updateListContent(slug, medias);
    }
    return mediaList;
  }

  async getListContent(
    slug: string,
    language = "en",
  ): Promise<(Omit<Movie, "translations"> | TVShow)[]> {
    const mediaList = await this.getListBySlug(slug);
    if (!mediaList.movies) {
      console.log(mediaList);
    }
    return [...mediaList.movies, ...mediaList.tvShows]
      .sort((a, b) => b.popularity - a.popularity)
      .map((media) => {
        if (media instanceof Movie) {
          const { translations, ...movie } = media;
          const translation = translations.find(
            (translation) => translation.language === language,
          );
          if (translation) {
            return {
              ...movie,
              title: translation.title || media.title,
              overview: translation.overview || media.overview,
              tagline: translation.tagline || media.tagline,
            };
          }
          return movie;
        }
        return media;
      });
  }

  async getLists() {
    return Object.entries(this.lists).map(([slug, list]) => ({
      slug,
      name: list.name,
      description: list.description,
    }));
  }
}
