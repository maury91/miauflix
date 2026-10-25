import { logger } from '@logger';
import type {
  MediaRef,
  MediaSummary,
  SearchGenre,
  SearchGenreKey,
  SearchResponse,
} from '@miauflix/service-contracts';

import type { RecentSearchRepository } from '@repositories/recent-search.repository';
import type {
  SearchGenreDto,
  SearchPageDto,
  SearchRecentDto,
  SearchRecentKind,
  SearchResultDetailDto,
  SearchResultDto,
} from '@routes/search.types';
import type { CatalogClientService } from '@services/catalog/catalog-client.service';

export type SearchInput =
  | { query: string; genre?: undefined; page: number; language: string }
  | { query?: undefined; genre: SearchGenreKey; page: number; language: string };

/** Genre chips shown on the search page, shortcuts included. */
export const SEARCH_GENRE_CHIPS = 10;
/** How long the catalog's genre ranking is reused before asking again. */
const GENRES_TTL_MS = 10 * 60_000;

const toResult = (summary: MediaSummary): SearchResultDto => ({
  _type: summary.mediaType === 'movie' ? 'movie' : 'tvshow',
  mediaId: summary.mediaId,
  title: summary.title,
  overview: summary.overview,
  poster: summary.poster,
  backdrop: summary.backdrop,
  releaseDate: summary.releaseDate,
  rating: summary.rating,
});

/** Title and genre search through the catalog, plus the user's recent searches. */
export class SearchService {
  private readonly genres = new Map<
    string,
    { expiresAt: number; genres: Promise<SearchGenre[]> }
  >();

  constructor(
    private readonly catalog: Pick<
      CatalogClientService,
      'batch' | 'discover' | 'search' | 'searchGenres'
    >,
    private readonly recents: RecentSearchRepository,
    private readonly now: () => number = Date.now
  ) {}

  /** The genres with the most catalog titles, followed by the shortcuts (e.g. Anime). */
  async listGenres(language: string, limit = SEARCH_GENRE_CHIPS): Promise<SearchGenreDto[]> {
    const genres = await this.allGenres(language);
    const shortcuts = genres.filter(genre => genre.shortcut);
    const ranked = genres.filter(genre => !genre.shortcut);
    return [...ranked.slice(0, Math.max(0, limit - shortcuts.length)), ...shortcuts].map(
      ({ key, name }) => ({ key, name })
    );
  }

  async run(input: SearchInput): Promise<SearchPageDto> {
    const response: SearchResponse =
      input.genre !== undefined
        ? await this.catalog.discover(input.genre, input.page, input.language)
        : await this.catalog.search(input.query, input.page, input.language);
    return {
      page: response.page,
      totalPages: response.totalPages,
      totalResults: response.totalResults,
      results: response.results.map(toResult),
    };
  }

  /** Full catalog details for the runtime / season count the search summaries lack. */
  async enrich(results: SearchResultDto[], language: string): Promise<SearchResultDetailDto[]> {
    if (!results.length) return [];
    const refs: MediaRef[] = results.slice(0, 50).map(result => ({
      mediaType: result._type === 'movie' ? 'movie' : 'tv',
      mediaId: result.mediaId,
    }));
    const { items } = await this.catalog.batch(refs, language, 'prefetch');
    return items.map(item =>
      item.mediaType === 'movie'
        ? {
            _type: 'movie',
            mediaId: item.mediaId,
            runtime: item.runtime || undefined,
            logo: item.logo || undefined,
          }
        : {
            _type: 'tvshow',
            mediaId: item.mediaId,
            seasonCount: item.seasons.filter(season => season.seasonNumber > 0).length,
            logo: item.logo || undefined,
          }
    );
  }

  /** Recent searches, with genre keys replaced by the genre's name for display. */
  async listRecents(userId: string, language = 'en'): Promise<SearchRecentDto[]> {
    const entries = await this.recents.list(userId);
    const names = entries.some(entry => entry.kind === 'genre')
      ? new Map(
          (await this.allGenres(language).catch(() => [])).map(genre => [genre.key, genre.name])
        )
      : new Map<string, string>();
    return entries.map(entry => ({
      kind: entry.kind,
      query: entry.query,
      label: entry.kind === 'genre' ? (names.get(entry.query) ?? entry.query) : entry.query,
      searchedAt: entry.searchedAt.toISOString(),
    }));
  }

  /** The catalog's genre ranking for the language, reused for a while; failures are not kept. */
  private allGenres(language: string): Promise<SearchGenre[]> {
    const cached = this.genres.get(language);
    if (cached && cached.expiresAt > this.now()) return cached.genres;
    const genres = this.catalog.searchGenres(language);
    this.genres.set(language, { expiresAt: this.now() + GENRES_TTL_MS, genres });
    genres.catch(error => {
      if (this.genres.get(language)?.genres === genres) this.genres.delete(language);
      logger.warn('SearchService', `Unable to load search genres for '${language}'`, error);
    });
    return genres;
  }

  recordRecent(userId: string, kind: SearchRecentKind, query: string): Promise<void> {
    return this.recents.record(userId, kind, query);
  }

  removeRecent(userId: string, kind: SearchRecentKind, query: string): Promise<void> {
    return this.recents.remove(userId, kind, query);
  }
}
