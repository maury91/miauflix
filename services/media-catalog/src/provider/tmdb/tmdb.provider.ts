import { logger } from '../../logger';
import type { ApiCache } from '../../utils/api-cache';
import type {
  CatalogProvider,
  ProviderChangesPage,
  ProviderEpisode,
  ProviderGenre,
  ProviderMovie,
  ProviderSeason,
  ProviderTVShow,
} from '../provider';
import { ProviderError } from '../provider';
import { TmdbClient } from './client';

const MAX_SEASON_CHANGE_PAGES = 100;

/**
 * The Movie Database (TMDB) implementation of the catalog provider abstraction.
 * This is the only module in the service that knows about TMDB specifics —
 * swapping catalogs means adding a sibling `provider/<name>/` package.
 */

export class TmdbProvider implements CatalogProvider {
  readonly name = 'tmdb';

  constructor(private readonly client: TmdbClient) {}

  static build(apiCache: ApiCache, values: { apiUrl: string; accessToken: string }): TmdbProvider {
    return new TmdbProvider(new TmdbClient(apiCache, values));
  }

  async test(): Promise<boolean> {
    return this.client.test();
  }

  resolveExternal(ref: {
    mediaType: 'movie' | 'tv';
    ids: { imdb?: string };
  }): Promise<number | null> {
    return ref.ids.imdb
      ? this.client.findByImdbId(ref.ids.imdb, ref.mediaType)
      : Promise.resolve(null);
  }

  async getMovie(mediaId: number): Promise<ProviderMovie | null> {
    try {
      return await this.client.getMovieDetails(mediaId);
    } catch (error) {
      if (error instanceof ProviderError && error.isNotFound) return null;
      throw error;
    }
  }

  async getTVShow(mediaId: number): Promise<ProviderTVShow | null> {
    try {
      return await this.client.getTVShowDetails(mediaId);
    } catch (error) {
      if (error instanceof ProviderError && error.isNotFound) return null;
      throw error;
    }
  }

  async getSeason(tvMediaId: number, seasonNumber: number): Promise<ProviderSeason | null> {
    let data;
    try {
      data = await this.client.getSeasonWithImages(tvMediaId, seasonNumber);
    } catch (error) {
      if (error instanceof ProviderError && error.isNotFound) return null;
      throw error;
    }
    const episodes: ProviderEpisode[] = data.episodes.map(episode => ({
      mediaId: episode.id,
      episodeNumber: episode.episode_number,
      name: episode.name,
      overview: episode.overview,
      airDate: episode.air_date,
      still: episode.still_path ?? '',
    }));
    return {
      tvMediaId,
      mediaId: data.id,
      seasonNumber: data.season_number,
      name: data.name,
      overview: data.overview,
      airDate: data.air_date,
      poster: data.poster_path ?? '',
      episodes,
    };
  }

  async getGenres(language: string): Promise<ProviderGenre[]> {
    const [movieGenres, tvGenres] = await Promise.all([
      this.client.movieGenres(language),
      this.client.tvGenres(language),
    ]);
    const byId = new Map<number, ProviderGenre>();
    for (const genre of [...movieGenres.genres, ...tvGenres.genres]) {
      if (genre.name) byId.set(genre.id, { id: genre.id, name: genre.name });
    }
    return [...byId.values()];
  }

  async *changedMovies(startDate: Date, endDate: Date): AsyncGenerator<ProviderChangesPage> {
    yield* this.changedPages(
      (page, end) => this.client.changedMovies(startDate, end, page),
      endDate,
      'movie'
    );
  }

  async *changedTVShows(startDate: Date, endDate: Date): AsyncGenerator<ProviderChangesPage> {
    yield* this.changedPages(
      (page, end) => this.client.changedTVShows(startDate, end, page),
      endDate,
      'tv show'
    );
  }

  async seasonChanges(mediaId: number): Promise<number[]> {
    const seasonNumbers = new Set<number>();
    const seenPages = new Set<number>();
    let page = 1;
    while (!seenPages.has(page) && page <= MAX_SEASON_CHANGE_PAGES) {
      seenPages.add(page);
      const changes = await this.client.tvShowChanges(mediaId, page);
      for (const change of changes.changes) {
        if (change.key !== 'season') continue;
        for (const item of change.items) {
          if (typeof item.value?.season_number === 'number') {
            seasonNumbers.add(item.value.season_number);
          }
        }
      }

      const totalPages = changes.total_pages;
      if (
        typeof totalPages !== 'number' ||
        !Number.isSafeInteger(totalPages) ||
        totalPages < 1 ||
        page >= totalPages ||
        (changes.page !== undefined && changes.page !== page)
      )
        break;
      page++;
    }
    return [...seasonNumbers];
  }

  private async *changedPages(
    fetchPage: (
      page: number,
      endDate: Date
    ) => Promise<{
      page: number;
      total_pages: number;
      results: Array<{ id: number }>;
    }>,
    endDate: Date,
    label: string
  ): AsyncGenerator<ProviderChangesPage> {
    let currentPage = 1;
    let totalPages = 1;
    do {
      const response = await fetchPage(currentPage, endDate);
      logger.debug(
        'TmdbProvider',
        `${label} changes page ${response.page}/${response.total_pages}`
      );
      yield {
        page: response.page,
        totalPages: response.total_pages,
        items: response.results.map(result => result.id),
      };
      totalPages = response.total_pages;
      currentPage++;
    } while (currentPage <= totalPages);
  }
}
